import fs from 'node:fs';
import {canonical, parseJson} from '../lib/config/strict-json.mjs';
import {schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {RunnerError, localPath, sha256, writeLocal} from '../lib/config/path-selection.mjs';
import {definitionsFor} from './registries.mjs';
import {auditEvents, appendAudit} from './audit-store.mjs';
import {requireTransition} from './runtime-state.mjs';
import {archiveBytes, readArchive, rawLines} from './co-written-archive.mjs';

// A later stage rewriting text an earlier, already-gated stage declared is a backward
// re-entry (format/gate-model.md section 1). The runner witnesses the rewrite as an audit
// change event and writes a transition PROPOSAL (decision null: it authorizes nothing).
// The next run reopens the earlier gate. PO approval of that reopened gate is the authority:
// decide.mjs and import-decision.mjs both call prepareAmendments/sealAmendments, which fill each
// proposal's decision with that approval and register the record through requireTransition.
// The runner itself never creates PO authority.
export const CO_WRITE_REASON = 'Co-declared output materialized';
const SUPERSEDED_REASON = 'Amendment superseded by a later edit of the same file';
const TRANSITIONS_DIR = 'review/transitions';
const transitionFile = id => `${TRANSITIONS_DIR}/${id}.json`;
export const isCoWrite = event => event.type === 'change' && event.reason.startsWith(CO_WRITE_REASON) && event.refs.length >= 3;

// Edit events that name this stage and that no registered transition or supersession has taken over yet.
export function openAmendments(root, stage, events = auditEvents(root)) {
  const closed = new Set(events.filter(event => event.type === 'transition' || event.reason.startsWith(SUPERSEDED_REASON)).flatMap(event => event.refs));
  return events.filter(event => isCoWrite(event) && event.refs.includes(`amends:${stage}`) && !closed.has(`amend-${event.id}`));
}
export function amendmentNote(root, stage, changed) {
  const open = openAmendments(root, stage).filter(event => changed.includes(event.refs[0]));
  return open.length ? `; recorded amendment: ${open.map(event => `${event.refs[1]} edited ${event.refs[0]} (audit ${event.id})`).join(', ')}` : '';
}
function amendmentRecord(config, registry, stage, event, {decision = null, scope, at = event.at}) {
  const [file, writer] = event.refs; const node = `artifact:${file}`;
  const to = definitionsFor(config, registry, stage)[0];
  return {
    id: `amend-${event.id}`, kind: 'backward', opener: 'dev', at, source: event.id,
    reason: `${writer} amended ${file} declared by ${stage}; PO approval of the reopened ${stage} gate ratifies the amended bytes`,
    from: {stage: writer, scope: definitionsFor(config, registry, writer)[0].scope, revision: event.before},
    to: {stage, scope: scope ?? to.scope, revision: event.after},
    impact: [{node, domain: 'spec', classification: 'direct', reason: `${file} changed by ${writer} after ${stage} approval`, path: [node]}],
    authority: 'po', decision, regates: [to.id],
  };
}
function store(root, record) {
  validateSchema(record, schema('transition.schema.json'), `transition ${record.id}`);
  writeLocal(root, transitionFile(record.id), canonical(record) + '\n');
}
export function writeProposal(root, config, registry, event) {
  for (const stage of event.refs.filter(ref => ref.startsWith('amends:')).map(ref => ref.slice(7))) store(root, amendmentRecord(config, registry, stage, event, {}));
}

// Ratification plan: which open amendments the PO approval seals and which it supersedes. `outputs` is the hash map
// the approved gate records. Refuses (RunnerError, exit 3) when the amended bytes are no longer the bytes under approval.
export function prepareAmendments(root, config, registry, stage, {decision, scope, at, outputs}) {
  const open = openAmendments(root, stage); const records = []; const superseded = [];
  for (const file of [...new Set(open.map(event => event.refs[0]))]) {
    const group = open.filter(event => event.refs[0] === file);
    const absolute = localPath(root, file);
    const current = fs.existsSync(absolute) ? sha256(fs.readFileSync(absolute)) : null;
    const chosen = group.filter(event => event.after === current).at(-1);
    if (!chosen) throw new RunnerError(`${stage}: cannot ratify amendment ${group.at(-1).id} of ${file}: the amended bytes (${group.at(-1).after.slice(0, 12)}) are no longer in the file (${current?.slice(0, 12) ?? 'missing'}); the proposal stays open`);
    if (outputs?.[file] !== current) throw new RunnerError(`${stage}: cannot ratify amendment ${chosen.id} of ${file}: the gate under approval records ${outputs?.[file]?.slice(0, 12) ?? 'no hash'}, the amended file is ${current.slice(0, 12)}; the proposal stays open`);
    records.push(amendmentRecord(config, registry, stage, chosen, {decision, scope, at}));
    for (const event of group.filter(row => row !== chosen)) superseded.push({event, by: chosen});
  }
  const bound = registry.definitions.get(config.gates.stage_definitions[stage].id);
  for (const record of records) {
    validateSchema(record, schema('transition.schema.json'), `transition ${record.id}`);
    if (!bound.transitions.includes('backward')) throw new RunnerError(`${stage}: definition does not allow backward transitions; cannot record ${record.id}`);
  }
  return {records, superseded, ids: records.map(record => record.id)};
}
// `authorityScope`: scope of the PO decision event when it is not the stage scope (batch import).
export function sealAmendments(root, config, registry, stage, plan, authorityScope) {
  for (const {event, by} of plan.superseded) {
    appendAudit(root, {type: 'change', scope: {kind: 'artifact', ids: [event.refs[0]], revision: event.after}, before: event.before, after: event.after, refs: [`amend-${event.id}`, `superseded-by:amend-${by.id}`],
      reason: `${SUPERSEDED_REASON}: ${event.refs[1]} edit ${event.id} replaced by ${by.id}; not sealed`});
    fs.rmSync(localPath(root, transitionFile(`amend-${event.id}`)), {force: true});
  }
  for (const record of plan.records) {
    // The ratified bytes are archived so a later re-run that drops them can be recognised.
    archiveBytes(root, config, fs.readFileSync(localPath(root, record.impact[0].node.slice('artifact:'.length))));
    store(root, record);
    requireTransition(root, {transition: transitionFile(record.id)}, config, registry, stage, true, authorityScope);
  }
}

// Writer guard: a re-run of the amended stage must keep what its PO-approved amendment changed.
export function droppedAmendment(root, config, stage, file, content) {
  const dir = localPath(root, TRANSITIONS_DIR);
  if (!fs.existsSync(dir)) return null;
  const ratified = fs.readdirSync(dir).filter(name => name.startsWith('amend-') && name.endsWith('.json')).map(name => parseJson(fs.readFileSync(`${dir}/${name}`, 'utf8'), name))
    .filter(record => record.decision && record.to.stage === stage && record.impact[0]?.node === `artifact:${file}`)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1)).at(-1);
  if (!ratified) return null;
  const pre = readArchive(root, config, ratified.from.revision); const post = readArchive(root, config, ratified.to.revision);
  if (!pre || !post) return `archived bytes of ${ratified.id} are missing or altered`;
  const preLines = new Set(rawLines(pre.toString('utf8'))); const postLines = new Set(rawLines(post.toString('utf8'))); const next = new Set(rawLines(content));
  const lost = [...postLines].filter(line => !preLines.has(line) && !next.has(line));
  const restored = [...preLines].filter(line => !postLines.has(line) && next.has(line));
  if (!lost.length && !restored.length) return null;
  return `PO-approved amendment ${ratified.id} to ${file} was dropped (${lost.length} amended line(s) missing, ${restored.length} replaced line(s) restored)`;
}

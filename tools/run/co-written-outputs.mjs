import fs from 'node:fs';
import {STAGES} from '../lib/config/config-loader.mjs';
import {concreteOutputs} from '../lib/output-patterns.mjs';
import {localPath, sha256, RunnerError} from '../lib/config/path-selection.mjs';
import {definitionsFor} from './registries.mjs';
import {auditEvents, appendAudit} from './audit-store.mjs';
import {readGate} from './gate-files.mjs';
import {CO_WRITE_REASON, isCoWrite, openAmendments, writeProposal, droppedAmendment} from './amendment-records.mjs';
import {archiveBytes, readArchive, isInsertOnly} from './co-written-archive.mjs';
import {stageInFlight} from './runtime-state.mjs';

export {amendmentNote} from './amendment-records.mjs';
export {isInsertOnly} from './co-written-archive.mjs';

// A path several stages declare as output (a decisions ledger, a document a later
// stage amends) is written by whichever stage runs last. The runner witnesses each
// such write in the hash-chained audit log (before/after hashes and the writing stage)
// and archives the prior bytes of every write. gateChanges accepts a changed co-declared
// output only when an unbroken chain of writes by LATER stages leads from the hash the gate
// recorded to the file on disk AND the archived bytes prove each step only inserted lines.
// The kind label in an event is a human hint, never evidence: the bytes are recomputed.
const stageIndex = stage => STAGES.indexOf(stage);
function declarations(root, config, registry) {
  const by = new Map();
  for (const stage of STAGES) {
    if (!config.stages[stage].enabled) continue;
    const definition = definitionsFor(config, registry, stage)[0]; if (!definition) continue;
    for (const file of concreteOutputs(root, definition.outputs)) by.set(file, [...(by.get(file) ?? []), stage]);
  }
  return by;
}

// Hooks for materialize(): `guard` runs before anything is written, `committed` once per file after the commit.
export function coWriteHooks(root, config, registry, stage) {
  let by;
  const shared = file => (by ??= declarations(root, config, registry)).get(file) ?? [];
  return {
    guard(file, before, content) {
      const dropped = droppedAmendment(root, config, stage, file, content);
      if (dropped) throw new RunnerError(`${stage}: ${dropped}; the output was not materialized and the previous bytes stay`, 3);
    },
    committed(file, before, content) {
      const others = shared(file).filter(other => other !== stage);
      if (!others.length) return;
      const bytes = Buffer.from(content); const after = sha256(bytes); const prior = before ? archiveBytes(root, config, before) : null;
      if (prior === after) return;
      const kind = before === null || isInsertOnly(before.toString('utf8'), bytes.toString('utf8')) ? 'append' : 'edit';
      const refs = [file, stage, kind];
      // A later stage rewriting text an earlier, already-gated stage declared is an amendment of that stage.
      if (kind === 'edit') for (const earlier of others.filter(other => stageIndex(other) < stageIndex(stage) && readGate(root, config, other))) refs.push(`amends:${earlier}`);
      const event = appendAudit(root, {type: 'change', scope: {kind: 'artifact', ids: [file], revision: after}, before: prior, after, refs,
        reason: `${CO_WRITE_REASON}: ${kind} by ${stage}`});
      if (refs.some(ref => ref.startsWith('amends:'))) writeProposal(root, config, registry, event);
    },
  };
}

// An edit that amends `stage` is deferred while the amending stage is still mid-run: its writer/reviewer checkpoint
// is open, so the earlier gate is not reopened yet and a pending result reaches the stage that owns it. Once the
// amending stage settled, the same edit reopens the earlier gate on the next run.
const deferredAmendment = (root, link, stage) => link.refs.includes(`amends:${stage}`) && stageInFlight(root, link.refs[1]);

// Walk back from the bytes on disk to the recorded hash. Every link needs a later writer, archived preimage bytes
// that hash to the event's `before`, and bytes that only inserted lines relative to the step after it (or an
// amendment of this stage whose writer has not settled yet).
function explained(root, config, links, stage, baseline, currentBytes) {
  let bytes = currentBytes; let cursor = sha256(bytes); let limit = links.length;
  while (cursor !== baseline) {
    let at = limit - 1;
    while (at >= 0 && links[at].after !== cursor) at--;
    if (at < 0) return false;
    const link = links[at];
    if (stageIndex(link.refs[1]) <= stageIndex(stage)) return false;
    const preimage = readArchive(root, config, link.before);
    if (!preimage || !(isInsertOnly(preimage.toString('utf8'), bytes.toString('utf8')) || deferredAmendment(root, link, stage))) return false;
    bytes = preimage; cursor = link.before; limit = at;
  }
  return true;
}
// True when the file on disk differs from the hash a gate/receipt recorded only by later stages' verified appends.
export function coWriteSettled(root, config, stage, file, recorded, events = auditEvents(root).filter(isCoWrite)) {
  const absolute = localPath(root, file);
  if (!fs.existsSync(absolute)) return false;
  const bytes = fs.readFileSync(absolute);
  return recorded === sha256(bytes) || explained(root, config, events.filter(event => event.refs[0] === file), stage, recorded, bytes);
}
// gateChanges filter: drops changed paths whose every change since approval is a later stage's verified append.
export function withoutExplainedCoWrites(root, config, stage, data, changed) {
  const candidates = changed.filter(file => Object.hasOwn(data.outputs, file) || Object.hasOwn(data.inputs, file));
  if (!candidates.length) return changed;
  const events = auditEvents(root).filter(isCoWrite);
  const settled = candidates.filter(file => [data.outputs[file], data.inputs[file]].filter(Boolean).every(recorded => coWriteSettled(root, config, stage, file, recorded, events)));
  return changed.filter(file => !settled.includes(file));
}

// Text for the writer's unhashed request: current bytes of the stage's shared outputs, so a re-run keeps
// rows and amendments other stages wrote instead of regenerating them from its own sources.
export function coWrittenRequest(root, config, registry, stage, request = '') {
  const files = [...declarations(root, config, registry)]
    .filter(([file, stages]) => stages.includes(stage) && stages.length > 1 && fs.existsSync(localPath(root, file))).map(([file]) => file);
  if (!files.length) return request;
  const block = [
    'CO-DECLARED OUTPUTS: other stages also write these files and their current bytes are the shared state. Keep every existing line and amendment; add or change only what this stage owns.',
    ...openAmendments(root, stage).map(event => `AMENDMENT by ${event.refs[1]} in ${event.refs[0]} (audit ${event.id}) awaits PO approval of this stage; keep it.`),
    ...files.map(file => {
      const text = fs.readFileSync(localPath(root, file), 'utf8');
      return `--- CO-WRITTEN FILE: ${file} ---\n${text.endsWith('\n') ? text : `${text}\n`}--- END CO-WRITTEN FILE ---`;
    }),
  ].join('\n');
  return [request, block].filter(Boolean).join('\n');
}

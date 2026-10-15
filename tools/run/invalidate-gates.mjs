import {optionalFiles, onlyOptionalInputChanges} from './optional-context.mjs';
import {ownGateExclusions, selectDefinitionInputs} from './own-gate-exclusions.mjs';
import {REVIEW_REQUIRED_STAGES} from '../lib/config/config-loader.mjs';
import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {hashes, localPath, sha256, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {concreteOutputs} from '../lib/output-patterns.mjs';
import {STAGES} from '../lib/config/config-loader.mjs';
import {definitionsFor, livePins, jsonFile} from './registries.mjs';
import {stageContext} from './stage-context.mjs';
import {readGate, writeGate, effectiveHash, changedHashes} from './gate-files.mjs';
import {impactClosure} from './impact-closure.mjs';
import {appendAudit} from './audit-store.mjs';
import {minorGatePending} from './minor-decisions.mjs';
import {reviewEligible} from './review-results.mjs';
import {loadEvidence, receiptEligible} from './evidence-heads.mjs';
import {gateHeads, censusEligible, storedNoImpact} from './gate-evidence.mjs';
import {withoutExplainedCoWrites, amendmentNote} from './co-written-outputs.mjs';

// Cause identity is content based. A changed path is already accounted for only while its current bytes are
// (a) what this stage's own writer last produced (`written_outputs`), or (b) the bytes recorded when the repair
// started (`repair_entry.foreign`: {path: sha256}). Any other bytes at a known path are a new cause.
// Pseudo paths such as `effective-config` and `candidate-pins` are not files; their hash is null.
export function contentHash(root, file) {
  try { return sha256(fs.readFileSync(localPath(root, file))); } catch { return null; }
}
export function ownRepairWrite(root, written = {}) {
  return file => Object.hasOwn(written ?? {}, file) && written[file] === contentHash(root, file);
}
export const isForeignMap = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function sameContentAsRecorded(root, foreign, ownWrite) {
  return file => ownWrite(file) || (isForeignMap(foreign) && Object.hasOwn(foreign, file) && foreign[file] === contentHash(root, file));
}
function recordedRuntime(root, stage) {
  const file = localPath(root, `review/runtime/${stage}.json`);
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function memberArtifactChanges(root, config, definition, model, exclude) {
  const manifest = jsonFile(root, `${config.gates.candidates_dir}/${model.candidate.manifest}.json`);
  const files = [
    ...selectDefinitionInputs(root, definition, {optional: true, exclude}),
    ...optionalFiles(root, config.stages[definition.stage]),
    ...concreteOutputs(root, definition.outputs, {omitMissing: true}),
  ];
  const current = hashes(root, files);
  return manifest.members
    .filter(member => member.kind === definition.scope.kind && definition.scope.ids.includes(member.id))
    .flatMap(member => changedHashes(root, member.artifacts, current));
}

// Read-only counterpart of the runner's invalidation scan.
export function gateChanges(root, config, registry, stage, gate, options) {
  const data = gate.data; const definitions = definitionsFor(config, registry, stage);
  let currentInputs = {};
  try { currentInputs = stageContext(root, config, registry, stage).inputs; }
  catch (error) { if (!(error instanceof RunnerError)) throw error; }
  const changed = changedHashes(root, data.inputs, currentInputs);
  const outputPaths = concreteOutputs(root, definitions[0].outputs, {omitMissing: true});
  changed.push(...changedHashes(root, data.outputs, hashes(root, outputPaths)));
  for (const def of definitions) {
    const relative = `${config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;
    const model = def.id === data.model?.definition.id ? data.model : fs.existsSync(localPath(root, relative)) ? jsonFile(root, relative) : null;
    if (model) changed.push(...memberArtifactChanges(root, config, def, model, ownGateExclusions(config.gates.dir, stage, definitions)));
  }
  if (data.config_sha256 !== effectiveHash(config, stage, definitions)) changed.push('effective-config');
  const pins = livePins(root, options, registry.baseline, stage);
  if (data.model && (data.model.candidate.build !== pins.build || (stage === 'handoff' && (data.model.candidate.head !== pins.head || data.model.candidate.base !== pins.base)))) changed.push('candidate-pins');
  return withoutExplainedCoWrites(root, config, stage, data, [...new Set(changed)]);
}

// A gate an earlier invalidation left PENDING/STALE (settling clears `invalidation`) still owes its re-run, even
// when the upstream stage that caused it later settled on identical bytes: waiting would leave it undecidable.
function awaitingRerun(config, gates) {
  const awaiting = new Set();
  for (const [stage, gate] of gates) {
    if (!config.stages[stage].enabled || gate.value !== 'PENDING' || !gate.data.invalidation || gate.data.model?.states.freshness !== 'STALE') continue;
    gate.invalidated = true; awaiting.add(stage);
  }
  return awaiting;
}
export function invalidateGates(root, config, registry, options) {
  const gates = new Map(); const stale = [];
  // Validate every existing stage gate before launching any process.
  for (const stage of STAGES) {
    const gate = readGate(root, config, stage); if (gate) gates.set(stage, gate);
  }
  const evidence = loadEvidence(root, config);
  for (const [stage, gate] of gates) if (gate.data.model && config.stages[stage].enabled) {
    const pins = {...gate.data.model.candidate, ...livePins(root, options, registry.baseline, stage)}; delete pins.dirty;
    for (const def of definitionsFor(config, registry, stage)) {
      const file = `${config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;
      const model = def.id === gate.data.model.definition.id ? gate.data.model : fs.existsSync(localPath(root, file)) ? jsonFile(root, file) : null;
      if (!model) continue;
      const selected = gateHeads(root, config, model, def, {context: evidence, pins, noImpact: storedNoImpact(root, config, registry.graph, pins)});
      const retiring = options.stage === stage && options.supersedes?.length && selected.heads.filter(head => !options.supersedes.some(row => row.id === head.id));
      const pendingMinor = ['PENDING', 'CHANGES_REQUESTED'].includes(gate.value) && selected.heads.length > 0 && selected.heads.every(head => head.execution.result === 'PASS' && minorGatePending({enabled: true, ...head.review}));
      if (!pendingMinor && selected.heads.length && !selected.eligible && (!retiring || retiring.some(head => !receiptEligible(head, {reviewRequired: config.review.enabled, approvers: config.roles.po.approvers ?? []})))) throw new RunnerError(selected.reason, 2);
    }
  }
  for (const [stage, gate] of gates) {
    if (!config.stages[stage].enabled) continue;
    const changed = gateChanges(root, config, registry, stage, gate, options);
    if (changed.length) stale.push({stage, changed: [...new Set(changed)]});
  }
  if (!stale.length) return {gates, invalidated: awaitingRerun(config, gates), impact: null};
  const paths = new Set(stale.flatMap(item => item.changed));
  const seeds = registry.graph.nodes.filter(node => paths.has(node.source)).map(node => node.id);
  const proof = censusEligible(evidence, registry.graph, livePins(root, options, registry.baseline));
  const impact = impactClosure(registry.graph, seeds, {censusVerified: proof && [...paths].every(p => registry.graph.nodes.some(n => n.source === p))});
  const optionalOnly = onlyOptionalInputChanges(config, gates, stale);
  const earliest = Math.min(...stale.map(item => STAGES.indexOf(item.stage)));
  const invalidated = new Set();
  for (const [stage, gate] of gates) {
    const own = stale.find(item => item.stage === stage);
    const dependent = impact.impact.some(row => registry.graph.nodes.find(n => n.id === row.node)?.source === gate.relative || Object.hasOwn(gate.data.inputs, registry.graph.nodes.find(n => n.id === row.node)?.source));
    if (!own && (optionalOnly || !(impact.complete ? dependent : STAGES.indexOf(stage) >= earliest))) continue;
    const data = {...gate.data}; delete data.approval;
    data.invalidation = {reason: (optionalOnly ? 'Optional input bytes changed; only selecting stages invalidated' : impact.complete ? 'Typed causal impact closure; independent scopes retained only with proof' : `BR-14 fallback from ${STAGES[earliest]}: missing mapping/census/independence proof`) + amendmentNote(root, stage, [...paths]), changed: [...paths].sort(), impact: impact.impact, at: new Date().toISOString()};
    // The gate stays invalidated until its repair settles. Re-running over the same
    // stale set (a multi-invocation manual repair) must not rewrite it or repeat the audit event.
    // Only bytes this stage's own writer produced are its effect; any other new path is a new cause.
    const known = gate.value === 'PENDING' && gate.data.invalidation && gate.data.model?.states.freshness === 'STALE' ? gate.data.invalidation : null;
    const runtime = recordedRuntime(root, stage);
    const ownWrite = ownRepairWrite(root, runtime.written_outputs);
    const accounted = sameContentAsRecorded(root, runtime.repair_entry?.foreign, ownWrite);
    // Scoped projections follow the changed set whether or not the gate itself is rewritten.
    const staleScoped = (stageName, reason, at, {onlyCurrent}) => {
      for (const def of definitionsFor(config, registry, stageName)) {
        const relative = `${config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;
        if (!fs.existsSync(localPath(root, relative))) continue;
        const model = jsonFile(root, relative);
        if (onlyCurrent && model.states.freshness === 'STALE' && model.states.human === 'PENDING' && model.decision === null) continue;
        const scopedImpact = !impact.complete || def.scope.ids.some(id => impact.impact.some(row => row.node === `${def.scope.kind}:${id}`)) || [...def.inputs, ...def.outputs, ...concreteOutputs(root, def.outputs, {omitMissing: true})].some(file => paths.has(file));
        if (!scopedImpact) continue;
        model.states.human = 'PENDING'; model.states.freshness = 'STALE'; model.states.progress = 'draft'; model.decision = null;
        writeLocal(root, relative, canonical(model) + '\n');
        for (const id of model.receipts) writeLocal(root, `review/freshness/${id}.json`, canonical({id, freshness: 'STALE', reason, at}) + '\n');
      }
    };
    if (known && known.reason === data.invalidation.reason && data.invalidation.changed.every(file => ownWrite(file) || (known.changed.includes(file) && accounted(file)))) {
      staleScoped(stage, known.reason, known.at, {onlyCurrent: true});
      gate.invalidated = true; invalidated.add(stage); continue;
    }
    if (data.model) data.model = {...data.model, decision: null, states: {...data.model.states, human: 'PENDING', freshness: 'STALE', progress: 'draft'}};
    writeGate(root, config, stage, 'PENDING', data);
    const scope = data.model?.scope ?? {kind: 'stage', ids: [stage], revision: data.config_sha256};
    appendAudit(root, {type: 'change', scope, before: data.config_sha256, after: null, refs: [stage, ...(data.model?.receipts ?? [])], reason: `${data.invalidation.reason}; impact=${canonical(impact.impact)}`});
    gate.value = 'PENDING'; gate.data = data; gate.invalidated = true; invalidated.add(stage);
    staleScoped(stage, data.invalidation.reason, data.invalidation.at, {onlyCurrent: false});
  }
  for (const stage of awaitingRerun(config, gates)) invalidated.add(stage);
  return {gates, invalidated, impact};
}
export function passedGateEligible(root, config, registry, stage, gate, options = {build: gate.data.model?.candidate.build}, settings = {}) {
  const required = config.review.enabled && REVIEW_REQUIRED_STAGES.includes(stage);
  if (!gate.data.model) return false;
  if (!reviewEligible(gate.data.review, {required, approvers: config.roles.po.approvers ?? []}) && !(settings.allowPendingMinor && minorGatePending(gate.data.review))) return false;
  if (gate.data.model && gate.data.model.states.freshness !== 'CURRENT') return false;
  if (gate.data.model) {
    const def = registry.definitions.get(gate.data.model.definition.id);
    if (!def || def.version !== gate.data.model.definition.version || canonical(def.scope) !== canonical(gate.data.model.scope)) return false;
    const pins = {...gate.data.model.candidate, ...livePins(root, options, registry.baseline, stage)}; delete pins.dirty;
    if (!gateHeads(root, config, gate.data.model, def, {...settings, pins, noImpact: storedNoImpact(root, config, registry.graph, pins)}).eligible) return false;
  }
  if (gate.data.evals.some(e => e.exit_code !== 0) && gate.data.model?.states.eval !== 'PASS') return false;
  for (const binding of config.gates.scoped_definitions) {
    const def = registry.definitions.get(binding.id); if (def?.stage !== stage) continue;
    const file = `${config.gates.dir}/scoped/${binding.id}/${def.scope.revision}.json`;
    if (!fs.existsSync(localPath(root, file))) return false;
    const model = settings.models?.get(file) ?? jsonFile(root, file);
    if (!(settings.allowPendingMinor ? ['PENDING', 'APPROVED', 'NOT_REQUIRED'] : ['APPROVED', 'NOT_REQUIRED']).includes(model.states.human) || model.states.freshness !== 'CURRENT' || config.review.enabled && !['PASS', 'NEEDS_CHANGES'].includes(model.states.review)) return false;
    const pins = {...model.candidate, ...livePins(root, options, registry.baseline, stage)}; delete pins.dirty;
    if (!gateHeads(root, config, model, def, {...settings, pins, noImpact: storedNoImpact(root, config, registry.graph, pins)}).eligible) return false;
  }
  return true;
}

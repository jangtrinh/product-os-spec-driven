import {definitionRevision} from '../lib/definition-scope.mjs';
import fs from 'node:fs';
import {rebuildPacketData} from '../reader/packet/source-rebuild.mjs';
import {canonical} from '../lib/config/strict-json.mjs';
import {hashes, localPath, sha256, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {readRecord, schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {jsonFile, checkMembership, livePins} from './registries.mjs';
import {reviewEligible} from './review-results.mjs';
import {propagationEligible} from './impact-closure.mjs';
import {immutableJson} from './audit-store.mjs';
import {readGate, writeGate, validateGate} from './gate-files.mjs';
import {activeException} from './authority-binding.mjs';
import {loadEvidence, requireHeads} from './evidence-heads.mjs';
import {receiptMembers} from './receipt-keys.mjs';
import {approvalHeads} from './approval-evidence.mjs';
import {preflightDecision, recordDecision} from './decision-records.mjs';
import {prepareAmendments, sealAmendments} from './amendment-records.mjs';

export function resolveOverrides(decision, ids) {
  const allowed = new Set(ids); const owners = new Set(ids.map(id => id.split('.AC-')[0]));
  const seen = new Map();
  for (const row of decision.overrides) {
    if ((!allowed.has(row.id) && !owners.has(row.id)) || seen.has(row.id)) throw new RunnerError(`Unknown/duplicate/conflicting override: ${row.id}`);
    seen.set(row.id, row);
  }
  return new Map(ids.map(id => [id, seen.get(id) ?? seen.get(id.split('.AC-')[0]) ?? {decision: decision.default, reason: decision.reason}]));
}
export function currentReceipt(root, config, record, pins) {
  const context = loadEvidence(root, config, [record]);
  const members = receiptMembers(context, record); if (!members.length) return false;
  try { return requireHeads(context, members.map(member => ({member, pins, domain: record.domain, reviewRequired: true}))).some(head => head.id === record.id); }
  catch (error) { if (error.code === 2 && !error.message.startsWith('Q-RECEIPT')) return false; throw error; }
}
export function importDecision(root, config, registry, options, print) {
  const decision = readRecord(root, options.decision, 'batch-decision.schema.json');
  const packet = readRecord(root, options.packet, 'packet-data.schema.json');
  const digest = sha256(canonical(packet));
  if (decision.data_sha256 !== digest || decision.packet_id !== `packet-${digest}`) throw new RunnerError('Packet data digest/id mismatch');
  if (canonical(decision.scope) !== canonical(packet.scope) || canonical(decision.pins) !== canonical(packet.candidate)) throw new RunnerError('Decision full scope/pins mismatch');
  if (!registry.baseline) throw new RunnerError('gates.baseline required for decision import');
  const live = livePins(root, options, registry.baseline);
  if (packet.candidate.head !== live.head || packet.candidate.base !== live.base || packet.candidate.build !== live.build || packet.baseline.head !== registry.baseline.head || packet.baseline.manifest !== registry.baseline.manifest) throw new RunnerError('Stale packet head/base/build/baseline pins');
  const manifest = jsonFile(root, `${config.gates.candidates_dir}/${packet.candidate.manifest}.json`);
  checkMembership(root, manifest, packet.candidate.manifest);
  if (canonical(manifest) !== canonical(packet.membership)) throw new RunnerError('Forged/incomplete candidate membership');
  const requested = manifest.members.filter(row => row.kind === 'ac' && packet.scope.ids.includes(row.id));
  if (canonical(requested.map(row => row.id).sort()) !== canonical(packet.scope.ids) || sha256(canonical(requested)) !== packet.scope.revision) throw new RunnerError('Unknown/incomplete scope membership or revision');
  if (canonical(packet.requests.map(row => row.id).sort()) !== canonical(packet.scope.ids)) throw new RunnerError('Missing/duplicate requested decisions');
  const overrides = resolveOverrides(decision, packet.scope.ids);
  const bindings = config.gates.scoped_definitions.map(b => registry.definitions.get(b.id)).filter(Boolean);
  for (const id of packet.scope.ids) if (!bindings.some(def => def.scope.kind === 'ac' && def.scope.ids.includes(id))) throw new RunnerError(`Unknown scoped gate definition: ${id}`);
  if (canonical(hashes(root, Object.keys(packet.assets))) !== canonical(packet.assets)) throw new RunnerError('Stale packet asset hashes');
  const currentChange = readRecord(root, `${config.gates.changes_dir}/${packet.change.id}.json`, 'change-set.schema.json');
  if (currentChange.id !== packet.change.id || canonical(currentChange.candidate) !== canonical(packet.candidate) || canonical(currentChange.baseline) !== canonical(packet.baseline) || canonical(currentChange.scope) !== canonical(packet.scope) || canonical(currentChange.propagation) !== canonical(packet.change.propagation) || canonical(currentChange.impact) !== canonical(packet.change.impact)) throw new RunnerError('Stale/incompatible Change Set draft');
  const rebuilt = rebuildPacketData({root, config, changeId: currentChange.id, head: live.head});
  if (rebuilt.json !== canonical(packet)) throw new RunnerError('Packet data differs from the canonical payload rebuilt from authoritative source and registries');
  if (!['Reviewed', 'Approved'].includes(currentChange.state)) throw new RunnerError('Change Set is not independently reviewed', 2);
  if (!options.as || options.as !== decision.by || !(config.roles.po.approvers ?? []).includes(options.as)) throw new RunnerError('Missing/unrecognized PO authority --as', 2);
  if (Date.parse(decision.at) > Date.now()) throw new RunnerError('Future decision timestamp');
  if (live.dirty && bindings.some(def => def.stage === 'handoff')) throw new RunnerError('Dirty git tree cannot establish G5', 2);
  const evidence = loadEvidence(root, config, packet.evidence);
  const good = approvalHeads(evidence, manifest, packet.scope, packet.candidate, registry.graph, {candidate: packet.candidate, impact: packet.change.impact}, packet.evidence, member => bindings.some(def => def.stage === 'handoff' && def.scope.kind === member.kind && def.scope.ids.includes(member.id)));
  if (packet.open.some(row => row.blocking) || packet.findings.some(row => row.disposition === 'open' || row.severity !== 'Minor' && row.disposition === 'accepted-minor')) throw new RunnerError('Packet has unresolved blocking OPEN/findings', 2);
  if (!packet.aggregate_checks.length || !packet.aggregate_checks.every(id => good.some(r => r.id === id && ['spec', 'local-ci'].includes(r.domain)))) throw new RunnerError('Aggregate corpus checks missing/current evidence unavailable', 2);
  if (!propagationEligible(packet.change.propagation, good, packet.scope.ids, {members: manifest.members, approvers: config.roles.po.approvers})) throw new RunnerError('Semantic propagation not independently verified on current AC/SCN outcomes', 2);
  for (const id of decision.exceptions) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new RunnerError('Invalid exception id');
    const exception = readRecord(root, `${config.gates.exceptions_dir}/${id}.json`, 'exception.schema.json');
    if (exception.id !== id || !activeException(exception, decision.scope, options.as) || !packet.exceptions.some(e => canonical(e) === canonical(exception))) throw new RunnerError(`Unknown/expired/scope-mismatched exception: ${id}`);
  }
  const updates = [];
  for (const def of bindings.filter(d => d.scope.ids.some(id => packet.scope.ids.includes(id)))) {
    if (def.scope.kind !== 'ac' || def.scope.ids.some(id => !packet.scope.ids.includes(id))) throw new RunnerError('Scoped definition is not fully enumerated by this batch');
    const selected = manifest.members.filter(m => m.kind === 'ac' && def.scope.ids.includes(m.id));
    if (selected.length !== def.scope.ids.length || definitionRevision(def) !== def.scope.revision) throw new RunnerError(`scope-version-required: ${def.id}`, 2);
    const file = `${config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;
    const model = readRecord(root, file, 'gate-state.schema.json');
    if (canonical(model.candidate) !== canonical(packet.candidate) || canonical(model.definition) !== canonical({id: def.id, version: def.version}) || canonical(model.scope) !== canonical(def.scope) || model.states.freshness !== 'CURRENT' || model.states.eval !== 'PASS' || !['PASS', 'NEEDS_CHANGES'].includes(model.states.review)) throw new RunnerError(`Stale/ineligible scoped gate: ${def.id}`, 2);
    const rows = def.scope.ids.map(id => overrides.get(id));
    const approved = rows.every(row => row.decision === 'approve');
    if (approved && !def.scope.ids.every(id => good.some(r => r.scope.ids.includes(id) && r.coverage.passed.includes(id)))) throw new RunnerError(`Missing current AC coverage for ${def.id}`, 2);
    const human = approved ? 'APPROVED' : 'PENDING';
    updates.push({file, model: {...model, decision: approved ? decision.id : null, states: {...model.states, human}}});
  }
  preflightDecision(root, config, decision, 'batch-decision.schema.json');
  const savedPacket = `review/packets/${decision.data_sha256}.json`;
  if (fs.existsSync(localPath(root, savedPacket)) && canonical(readRecord(root, savedPacket, 'packet-data.schema.json')) !== canonical(packet)) throw new RunnerError('Immutable packet differs from approved digest');
  // Preflight every projection before the append-only approval event.
  const projected = new Map(updates.map(row => [row.file, row.model]));
  for (const {file, model} of updates) validateSchema(model, schema('gate-state.schema.json'), file);
  const aggregateUpdates = [];
  for (const stage of [...new Set(bindings.map(d => d.stage))]) {
    const all = bindings.filter(d => d.stage === stage).every(def => {
      const file = `${config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;
      const model = projected.get(file) ?? readRecord(root, file, 'gate-state.schema.json');
      return model.states.human === 'APPROVED' && model.states.freshness === 'CURRENT';
    });
    const gate = readGate(root, config, stage);
    if (gate && all && reviewEligible(gate.data.review, {required: true, approvers: config.roles.po.approvers ?? []})) {
      const data = {...gate.data, approval: {by: decision.by, at: decision.at}, model: {...gate.data.model, decision: decision.id, states: {...gate.data.model.states, human: 'APPROVED'}}};
      validateGate(data, 'APPROVED', stage, root, config.gates.dir);
      aggregateUpdates.push({stage, data});
    }
  }
  const allApproved = [...overrides.values()].every(row => row.decision === 'approve');
  const nextChange = {...currentChange, state: allApproved ? 'Approved' : 'Reviewed', po_decision: allApproved ? decision.id : null};
  validateSchema(nextChange, schema('change-set.schema.json'), 'approved Change Set');
  // The same PO-approval ratification as decide.mjs, for every stage this batch approves; its decision event scope is the batch scope.
  const amendmentPlans = aggregateUpdates.map(({stage, data}) => ({stage, plan: prepareAmendments(root, config, registry, stage, {decision: decision.id, scope: data.model.scope, at: decision.at, outputs: data.outputs})}));
  const {event} = recordDecision(root, config, decision, {refs: [decision.packet_id, decision.data_sha256, currentChange.id, ...amendmentPlans.flatMap(row => row.plan.ids)], dirty: live.dirty, schemaName: 'batch-decision.schema.json'});
  for (const {stage, plan} of amendmentPlans) sealAmendments(root, config, registry, stage, plan, decision.scope);
  immutableJson(root, savedPacket, packet, 'packet-data.schema.json');
  for (const {file, model} of updates) { validateSchema(model, schema('gate-state.schema.json'), file); writeLocal(root, file, canonical(model) + '\n'); }
  for (const {stage, data} of aggregateUpdates) writeGate(root, config, stage, 'APPROVED', data);
  writeLocal(root, `${config.gates.changes_dir}/${currentChange.id}.json`, canonical(nextChange) + '\n');
  print(`Decision ${decision.id} applied; audit ${event.id}; authority asserted-local. Publication, receiver acknowledgment and switch remain separate.`);
  return 0;
}

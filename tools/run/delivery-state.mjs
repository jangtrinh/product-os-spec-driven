import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {hashes, localPath, sha256, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {readRecord} from '../lib/config/schema-validation.mjs';
import {auditEvents, appendAudit, immutableJson} from './audit-store.mjs';
import {jsonFile, checkMembership} from './registries.mjs';
import {decisionAuthority, sameScope} from './authority-binding.mjs';
import {resolveOverrides} from './import-decision.mjs';
import {loadEvidence} from './evidence-heads.mjs';
import {approvalHeads} from './approval-evidence.mjs';
import {propagationEligible} from './impact-closure.mjs';

// Local lifecycle API: publication creates an immutable snapshot; receiver
// acknowledgment and switch are explicit separate events, never inferred.
export function recordDeliveryEvent(root, config, changeId, event, currentPins) {
  if (!/^CS-[a-z0-9-]+$/.test(changeId) || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(event.id ?? '')) throw new RunnerError('Invalid delivery/change id');
  if (!['publication', 'acknowledgment', 'switch'].includes(event.type) || typeof event.actor !== 'string' || !event.actor.includes('@')) throw new RunnerError('Invalid delivery event actor/type');
  const changePath = `${config.gates.changes_dir}/${changeId}.json`;
  const change = readRecord(root, changePath, 'change-set.schema.json');
  if (change.id !== changeId) throw new RunnerError('Change Set id differs from registry binding', 2);
  if (!change.candidate || canonical(change.candidate) !== canonical(currentPins)) throw new RunnerError('Moved head/base/build/manifest invalidates delivery', 2);
  if (event.type === 'publication') {
    if (!change.po_decision || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(change.po_decision)) throw new RunnerError('Publication requires an exact PO-approved Change Set', 2);
    const decisionPath = `${config.gates.decisions_dir}/${change.po_decision}.json`;
    if (!fs.existsSync(localPath(root, decisionPath))) throw new RunnerError('Missing immutable publication approval', 2);
    const decision = readRecord(root, decisionPath, 'batch-decision.schema.json');
    const authority = decisionAuthority(auditEvents(root), {id: change.po_decision, scope: change.scope, actor: decision.by, refs: [decision.packet_id, decision.data_sha256, changeId]});
    if (!authority || authority.after !== sha256(canonical(decision)) || decision.id !== change.po_decision || !sameScope(decision.scope, change.scope) || canonical(decision.pins) !== canonical(change.candidate) || !(config.roles.po.approvers ?? []).includes(decision.by) || !(config.roles.po.approvers ?? []).includes(event.actor) || ![...resolveOverrides(decision, decision.scope.ids).values()].every(row => row.decision === 'approve')) throw new RunnerError('Publication requires immutable exact-scope/candidate PO approval', 2);
    const manifest = jsonFile(root, `${config.gates.candidates_dir}/${change.candidate.manifest}.json`);
    checkMembership(root, manifest, change.candidate.manifest);
    const graph = readRecord(root, config.gates.graph, 'dependency-graph.schema.json');
    const packetPath = `review/packets/${decision.data_sha256}.json`;
    const packet = fs.existsSync(localPath(root, packetPath)) ? readRecord(root, packetPath, 'packet-data.schema.json') : null;
    if (packet && sha256(canonical(packet)) !== decision.data_sha256) throw new RunnerError('Publication packet differs from approved immutable digest', 2);
    const evidence = loadEvidence(root, config, packet?.evidence ?? []);
    const heads = approvalHeads(evidence, manifest, change.scope, change.candidate, graph, change, packet?.evidence ?? [], member => member.kind === 'stage' && member.id === 'handoff' || change.regates.some(id => {
      const binding = config.gates.scoped_definitions.find(row => row.id === id); if (!binding) return false;
      const def = readRecord(root, `${config.gates.definitions_dir}/${id}/${binding.version}.json`, 'gate-definition.schema.json');
      return def.stage === 'handoff' && def.scope.kind === member.kind && def.scope.ids.includes(member.id);
    }));
    if (packet && !packet.aggregate_checks.every(id => heads.some(record => record.id === id && ['spec', 'local-ci'].includes(record.domain)))) throw new RunnerError('Publication aggregate checks lack current heads', 2);
    if (!propagationEligible(change.propagation, heads, change.scope.ids, {members: manifest.members, approvers: config.roles.po.approvers})) throw new RunnerError('Publication semantic propagation lacks eligible current heads', 2);
  }
  const before = auditEvents(root).find(row => row.id === event.id);
  const snapshot = `${config.project.spec_root}/delivery/baselines/${changeId}`;
  const receiptRef = event.type === 'publication' ? `${snapshot}/manifest.json` : event.actor;
  const reason = `${event.type}; change=${changeId}; actor=${event.actor}; candidate=${canonical(change.candidate)}`;
  if (before) {
    if (before.type !== event.type || before.actor !== event.actor || before.reason !== reason || !sameScope(before.scope, change.scope) || !before.refs.includes(changeId)) throw new RunnerError('Delivery event id reused with different content');
    return before;
  }
  if (event.type === 'publication') {
    if (change.state !== 'Approved') throw new RunnerError('Publication requires an exact PO-approved Change Set', 2);
    const manifest = jsonFile(root, `${config.gates.candidates_dir}/${change.candidate.manifest}.json`);
    checkMembership(root, manifest, change.candidate.manifest);
    const artifacts = Object.assign({}, ...manifest.members.map(member => member.artifacts));
    // All inputs are validated before copying; retries never overwrite bytes.
    if (canonical(artifacts) !== canonical(hashes(root, Object.keys(artifacts)))) throw new RunnerError('Publication source changed');
    for (const file of Object.keys(artifacts)) writeLocal(root, `${snapshot}/files/${file}`, fs.readFileSync(localPath(root, file)), {immutable: true});
    immutableJson(root, `${snapshot}/manifest.json`, {change_set: changeId, pins: change.candidate, membership: manifest, artifacts});
    change.state = 'Published';
  } else {
    if (!['Published', 'Acknowledged', 'Switched'].includes(change.state)) throw new RunnerError('Receiver event requires published baseline', 2);
    const receiver = change.receivers.find(row => row.receiver === event.actor);
    if (!receiver) throw new RunnerError('Unknown delivery receiver');
    if (event.type === 'acknowledgment') receiver.acknowledgment = event.id;
    else {
      if (!receiver.acknowledgment || !auditEvents(root).some(row => row.id === receiver.acknowledgment && row.type === 'acknowledgment' && row.actor === event.actor && sameScope(row.scope, change.scope) && row.refs.includes(changeId) && row.after === change.candidate.manifest)) throw new RunnerError('Switch requires explicit receiver acknowledgment', 2);
      receiver.switch = event.id; receiver.baseline = change.candidate.manifest;
    }
    change.state = change.receivers.every(row => row.switch) ? 'Switched' : change.receivers.every(row => row.acknowledgment) ? 'Acknowledged' : 'Published';
  }
  const receipt = appendAudit(root, {id: event.id, type: event.type, scope: change.scope, before: change.baseline.manifest, after: change.candidate.manifest, refs: [changeId, receiptRef], actor: event.actor, reason});
  writeLocal(root, changePath, canonical(change) + '\n');
  return receipt;
}

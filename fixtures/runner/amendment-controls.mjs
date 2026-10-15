import fs from 'node:fs';
import path from 'node:path';
import {batchFixture} from './batch-fixture.mjs';
import {projectFixture} from './project-fixture.mjs';
import {copy, put} from './evidence-head-controls.mjs';
import {loadEvidence, selectHeads} from '../../tools/run/evidence-heads.mjs';
import {invalidateGates} from '../../tools/run/invalidate-gates.mjs';
import {loadRegistries} from '../../tools/run/registries.mjs';
import {censusEligible} from '../../tools/run/gate-evidence.mjs';
import {propagationEligible} from '../../tools/run/impact-closure.mjs';
import {recordDeliveryEvent} from '../../tools/run/delivery-state.mjs';
import {canonical} from '../../tools/lib/config/strict-json.mjs';
import {hashes, sha256} from '../../tools/lib/config/path-selection.mjs';
import {censusGraph} from './census-graph.mjs';
import {projectCensusModel} from '../../tools/lib/census-source-corpus.mjs';

export function observed(action) {
  try { const value = action(); return value?.code !== undefined ? value : {code: value === false ? 2 : 0, out: String(value)}; }
  catch (error) { return {code: error.code ?? 3, out: error.message}; }
}
function currentImport(p, negative = false) {
  try {p.rebuildBatch();} catch (error) {if (!negative || error.code !== 2) throw error;}
  return p.importBatch();
}
function graphObservation(p, template, id) {
  const receipt = copy(template); receipt.id = id; receipt.execution.result = 'PASS'; receipt.execution.exit = 0; receipt.review.verdict = 'PASS';
  const member = {kind: 'artifact', id: p.config.gates.graph, artifacts: hashes(p.root, [p.config.gates.graph])}; member.revision = sha256(canonical(member.artifacts));
  const manifest = {version: '1', members: [member]}; const digest = sha256(canonical(manifest));
  receipt.scope = {kind: 'artifact', ids: [member.id], revision: sha256(canonical([member]))}; receipt.pins.manifest = digest; receipt.artifacts = member.artifacts;
  receipt.review.inputs = Object.keys(member.artifacts);
  receipt.review.criteria = [{id: 'graph-completeness', mandatory: true, score: 2, evidence: 'Independent source census'}];
  return {receipt, manifest, digest};
}
export function graphReceipt(p, template = p.packet?.evidence[0] ?? p.receipt, id = 'current-graph-proof') {
  const {receipt, manifest, digest} = graphObservation(p, template, id);
  p.write(`review/candidates/${digest}.json`, manifest); put(p, receipt); return receipt;
}
// Reserve known proof topology in memory; persist only the final graph-bound observation.
export function certifiedFixtureGraph(p, graph, template = p.packet?.evidence[0] ?? p.receipt, id = 'current-graph-proof', extra = []) {
  const model = projectCensusModel(p.root, p.config);
  const prototype = graphObservation(p, template, id).receipt;
  model.censusPayloads = [prototype, ...extra].map(data => ({type:'evidence-receipt', file:`review/receipts/${data.id}.json`, data, pathBase:''}));
  const full = censusGraph(model);
  for (const node of graph.nodes) {
    const current = full.nodes.find(n => n.id === node.id);
    if (!current) full.nodes.push(node);
    else if (!model.docs.some(d => d.rel === current.source)) Object.assign(current, node);
  }
  for (const edge of graph.edges) if (!full.edges.some(e => e.from === edge.from && e.to === edge.to && e.relation === edge.relation)) full.edges.push(edge);
  full.complete = graph.complete;
  Object.assign(graph, full); p.write(p.config.gates.graph, graph);
  return graphReceipt(p, template, id);
}
export const amendmentControls = [
  ...['evaluator', 'rules'].map(pin => [`${pin} review version mismatch`, t => {
    const p = batchFixture(t); const receipt = copy(p.packet.evidence[0]); receipt.id = `mismatched-${pin}`;
    const field = pin === 'rules' ? 'ruleset_version' : 'evaluator_version'; receipt.review[field] = 'other-version'; put(p, receipt);
    return {p, red: () => currentImport(p, true), restore: () => {receipt.review[field] = receipt.pins[pin]; put(p, receipt); p.rebuildBatch();}, green: () => p.importBatch()};
  }]),
  ['accepted Minor without authorized PO', t => {
    const p = batchFixture(t); const receipt = p.packet.evidence[0]; receipt.review.verdict = 'NEEDS_CHANGES';
    receipt.review.findings = [{id: 'minor-1', criterion: 'source', severity: 'Minor', disposition: 'accepted-minor', file: 'us/US-16.md', line: 1, impact: 'Documented cosmetic concern', fix: 'Track cosmetic follow-up', owner: 'dev', accepted_by: 'unknown@example.test', reason: 'Retain the documented Minor with tracked follow-up', follow_up: 'Follow-up cosmetic task'}];
    const save = () => {put(p, receipt); p.rebuildBatch();}; save();
    return {p, red: () => p.importBatch(), restore: () => {receipt.review.findings[0].accepted_by = 'po@example.test'; save();}, green: () => p.importBatch()};
  }],
  ['migrated FAIL retired by overlay', t => {
    const p = batchFixture(t); const receipt = copy(p.packet.evidence[0]); receipt.id = 'migrated-overlay-fail'; delete receipt.pins.manifest;
    receipt.execution.result = 'FAIL'; receipt.execution.exit = 1; put(p, receipt);
    p.rebuildBatch();
    return {p, red: () => p.importBatch(), restore: () => {p.write(`review/freshness/${receipt.id}.json`, {freshness: 'STALE'}); p.rebuildBatch();}, green: () => p.importBatch()};
  }],
  ['graph census manifest member revision forged', t => {
    const p = batchFixture(t); const graph = JSON.parse(fs.readFileSync(path.join(p.root, p.config.gates.graph))); graph.complete = true; p.write(p.config.gates.graph, graph);
    const valid = certifiedFixtureGraph(p, graph); const receipt = copy(valid); const manifest = JSON.parse(fs.readFileSync(path.join(p.root, `review/candidates/${receipt.pins.manifest}.json`)));
    manifest.members[0].revision = 'a'.repeat(64); receipt.pins.manifest = sha256(canonical(manifest)); receipt.scope.revision = sha256(canonical(manifest.members));
    const forgedFile = `review/candidates/${receipt.pins.manifest}.json`;
    p.write(forgedFile, manifest); put(p, receipt);
    const action = record => observed(() => censusEligible(loadEvidence(p.root, p.config), graph, record.pins));
    return {p, red: () => action(receipt), restore: () => {
      // The malformed candidate is an ordinary census dependent under D21.
      // Restore the fixture's whole attack, including its temporary candidate.
      fs.unlinkSync(path.join(p.root, forgedFile)); put(p, valid);
    }, green: () => action(valid)};
  }],
  ['duplicate current target with an omitted scope member', t => {
    const p = batchFixture(t); const receipt = p.packet.evidence[0]; const members = p.packet.membership.members; const revision = receipt.scope.revision;
    const duplicate = [members[0], copy(members[0])]; receipt.scope.revision = sha256(canonical(duplicate)); put(p, receipt);
    const action = target => observed(() => propagationEligible(p.packet.change.propagation, [receipt], p.packet.scope.ids, {members: target, approvers: p.config.roles.po.approvers}));
    return {p, red: () => action(duplicate), restore: () => {receipt.scope.revision = revision; put(p, receipt);}, green: () => action(members)};
  }],
  ...['impact census', 'gate invalidation', 'decision import', 'publication', 'propagation'].map(owner => [`wrong revision: ${owner}`, t => {
    const p = owner === 'gate invalidation' ? projectFixture(t) : batchFixture(t);
    let receipt; let action;
    if (owner === 'gate invalidation') {
      p.config.roles.po.enabled = false; p.save(); if (p.run().code !== 0) throw Error('Gate control must settle');
      receipt = JSON.parse(fs.readFileSync(path.join(p.root, `review/receipts/${p.gate('prd').data.model.receipts[0]}.json`)));
      action = () => invalidateGates(p.root, p.config, loadRegistries(p.root, p.config), {head: 'fixture-head', build: 'not-built'});
    } else if (owner === 'impact census') {
      const graph = JSON.parse(fs.readFileSync(path.join(p.root, p.config.gates.graph))); graph.complete = true; p.write(p.config.gates.graph, graph);
      receipt = certifiedFixtureGraph(p, graph); action = () => censusEligible(loadEvidence(p.root, p.config), graph, receipt.pins);
    } else if (owner === 'publication') {
      if (p.importBatch().code !== 0) throw Error('Publication control must approve');
      // Historical approvals may predate immutable packet retention; preserve its bytes as backup.
      fs.renameSync(path.join(p.root, `review/packets/${p.decision.data_sha256}.json`), path.join(p.root, 'approved-packet-backup.json'));
      receipt = p.packet.evidence[0]; action = () => recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'publish-revision', type: 'publication', actor: 'po@example.test'}, p.packet.candidate);
    } else if (owner === 'propagation') {
      receipt = p.packet.evidence[0]; action = () => propagationEligible(p.packet.change.propagation, [receipt], p.packet.scope.ids, {members: p.packet.membership.members, approvers: p.config.roles.po.approvers});
    } else {receipt = p.packet.evidence[0]; action = () => p.importBatch();}
    const revision = receipt.scope.revision; receipt.scope = {...receipt.scope, revision: 'a'.repeat(64)};
    const save = () => {put(p, receipt); if (owner === 'decision import') p.saveBatch();}; save();
    return {p, red: () => observed(action), restore: () => {receipt.scope.revision = revision; save();}, green: () => observed(action)};
  }]),
];
export function absentVersionHeads(t, pin) {
  const p = batchFixture(t); const original = p.packet.evidence[0]; delete original.pins[pin]; put(p, original); p.saveBatch();
  const other = copy(original); other.id = `other-${pin}`; other.review[pin === 'rules' ? 'ruleset_version' : 'evaluator_version'] = 'other-version'; put(p, other);
  const query = {member: p.packet.membership.members[0], members: p.packet.membership.members, pins: p.packet.candidate, domain: 'spec'};
  return {p, original, other, heads: () => selectHeads(loadEvidence(p.root, p.config), query)};
}
export function changedMemberHeads(t) {
  const p = batchFixture(t); p.write('evidence/one.txt', 'unchanged member\n'); p.write('evidence/two.txt', 'old member\n');
  const member = (id, file) => {const artifacts = hashes(p.root, [file]); return {kind: 'ac', id, artifacts, revision: sha256(canonical(artifacts))};};
  const prior = {version: '1', members: [member('US-16.AC-01', 'evidence/one.txt'), member('US-16.AC-02', 'evidence/two.txt')]};
  const old = copy(p.packet.evidence[0]); old.id = 'old-two-member-fail'; old.pins.manifest = sha256(canonical(prior));
  old.scope.revision = sha256(canonical(prior.members)); old.artifacts = {...old.artifacts, ...Object.assign({}, ...prior.members.map(row => row.artifacts))};
  old.review.inputs = [...new Set([...old.review.inputs, ...Object.keys(old.artifacts)])];
  old.execution.result = 'FAIL'; old.execution.exit = 1; p.write(`review/candidates/${old.pins.manifest}.json`, prior); put(p, old);
  p.write('evidence/two.txt', 'changed member\n');
  const current = {version: '1', members: [prior.members[0], member('US-16.AC-02', 'evidence/two.txt')]};
  const fresh = copy(old); fresh.id = 'fresh-two-member-pass'; fresh.pins.manifest = sha256(canonical(current)); fresh.scope.revision = sha256(canonical(current.members));
  fresh.artifacts = {...fresh.artifacts, ...current.members[1].artifacts}; fresh.execution.result = 'PASS'; fresh.execution.exit = 0;
  p.write(`review/candidates/${fresh.pins.manifest}.json`, current); put(p, fresh);
  return {p, old, fresh, heads: () => selectHeads(loadEvidence(p.root, p.config), {member: current.members[0], members: current.members, pins: fresh.pins, domain: 'spec'})};
}

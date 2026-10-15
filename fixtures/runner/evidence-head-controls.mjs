import fs from 'node:fs';
import path from 'node:path';
import {batchFixture} from './batch-fixture.mjs';
import {appendAudit} from '../../tools/run/audit-store.mjs';
import {inventory, hashes} from '../../tools/lib/config/path-selection.mjs';
import {projectCensusGraph} from './census-graph.mjs';

export const copy = value => structuredClone(value);
export const snapshot = p => hashes(p.root, inventory(p.root));
export const put = (p, receipt, filename = receipt.id) => p.write(`review/receipts/${filename}.json`, receipt);
export function witness(p, receipt) {
  appendAudit(p.root, {type: 'eval', scope: receipt.scope, refs: [...new Set([receipt.id, ...receipt.supersedes.map(row => row.id)])], reason: 'Independent explicit re-observation; local acceptance control'});
}
export function retire(p, id) { fs.rmSync(path.join(p.root, `review/receipts/${id}.json`)); }
export function failed(p, id = 'current-fail') {
  const receipt = copy(p.packet.evidence[0]); receipt.id = id;
  receipt.execution.result = 'FAIL'; receipt.execution.exit = 1;
  receipt.review.verdict = 'FAIL'; receipt.review.criteria[0].score = 0;
  return receipt;
}
export function superseder(p, target = 'current-fail', id = 'explicit-pass') {
  const receipt = copy(p.packet.evidence[0]); receipt.id = id;
  receipt.supersedes = [{id: target, reason: 'Independent re-observation retires the contradicted result on identical member bytes'}];
  return receipt;
}
function embedded(p, receipt) {
  p.packet.evidence = [receipt]; p.packet.aggregate_checks = [receipt.id];
  for (const row of p.packet.change.propagation) row.evidence = [receipt.id];
  p.changeSet.propagation = copy(p.packet.change.propagation);
  p.write(`review/changes/${p.changeSet.id}.json`, p.changeSet); p.saveBatch();
}
function oldCandidate(p, {complete = true, missing = false, reachable = false} = {}) {
  const receipt = p.packet.evidence[0]; receipt.pins.head = 'prior-candidate-head'; put(p, receipt);
  const node = {id: 'req:other', kind: 'req', source: 'evidence/check.txt', revision: '1'};
  const ownership = p.packet.scope.ids.map(id => ({from: 'us:US-16', to: `ac:${id}`, relation: 'derives', source: 'us/US-16.md', revision: '1'}));
  p.packet.change.impact = [{node: node.id, domain: 'spec', classification: 'direct', reason: 'Declared unrelated source seed', path: [node.id]}];
  p.changeSet.impact = copy(p.packet.change.impact); p.write(`review/changes/${p.changeSet.id}.json`, p.changeSet); p.saveBatch();
  const graph = projectCensusGraph(p); graph.complete = complete;
  for (const edge of ownership) if (!graph.edges.some(e => e.from === edge.from && e.to === edge.to && e.relation === edge.relation)) graph.edges.push(edge);
  if (!missing) graph.nodes.push(node);
  if (reachable) graph.edges.push({from: node.id, to: `ac:${p.packet.scope.ids[0]}`, relation:'uses', source:node.source, revision:'1'});
  p.write(p.config.gates.graph, graph);
  return {graph, node};
}
export const headControls = [
  ['clock skew', p => { const r = failed(p); r.at = '2000-01-01T00:00:00.000Z'; put(p, r); return () => retire(p, r.id); }],
  ['equal at', p => { const r = failed(p); r.at = p.packet.evidence[0].at; put(p, r); return () => retire(p, r.id); }],
  ['migrated FAIL', p => { const r = failed(p); put(p, r); return () => retire(p, r.id); }],
  ['migrated FAIL without candidate digest', p => { const r = failed(p); delete r.pins.manifest; put(p, r); return () => p.write(`review/freshness/${r.id}.json`, {id: r.id, freshness: 'STALE', reason: 'Recorded retirement of unresolvable migrated provenance'}); }],
  ['fork', p => { const old = failed(p); put(p, old); const a = superseder(p); put(p, a); witness(p, a); const b = failed(p, 'fork-fail'); b.supersedes = copy(a.supersedes); put(p, b); witness(p, b); return () => { b.execution = copy(a.execution); b.review = copy(a.review); put(p, b); }; }],
  ['key-drift laundering', p => { const old = failed(p); put(p, old); const r = superseder(p); r.artifacts['us/US-16.md'] = 'a'.repeat(64); put(p, r); witness(p, r); return () => { r.artifacts = copy(old.artifacts); put(p, r); }; }],
  ['pins laundering', p => { const old = failed(p); put(p, old); const r = superseder(p); r.pins.build = 'other-build'; put(p, r); witness(p, r); return () => { r.pins = copy(old.pins); put(p, r); }; }],
  ['dangling', p => { const r = superseder(p, 'missing-id'); put(p, r); witness(p, r); return () => { delete r.supersedes; put(p, r); }; }],
  ['self', p => { const r = superseder(p, 'explicit-pass'); put(p, r); witness(p, r); return () => { delete r.supersedes; put(p, r); }; }],
  ['cycle', p => { const a = superseder(p, 'cycle-b', 'cycle-a'); const b = superseder(p, 'cycle-a', 'cycle-b'); put(p, a); put(p, b); witness(p, a); witness(p, b); return () => { delete a.supersedes; delete b.supersedes; put(p, a); put(p, b); }; }],
  ['embedded-only supersession', p => { const old = failed(p); put(p, old); const r = superseder(p); embedded(p, r); witness(p, r); return () => put(p, r); }],
  ['missing audit witness', p => { const old = failed(p); put(p, old); const r = superseder(p); put(p, r); return () => witness(p, r); }],
  ['overlay STALE', p => { const r = p.packet.evidence[0]; p.write(`review/freshness/${r.id}.json`, {id: r.id, freshness: 'STALE', reason: 'Recorded impact', at: new Date().toISOString()}); return () => p.write(`review/freshness/${r.id}.json`, {id: r.id, freshness: 'CURRENT'}); }],
  ['duplicate id', p => { const r = failed(p, p.packet.evidence[0].id); put(p, r, 'duplicate-copy'); return () => fs.rmSync(path.join(p.root, 'review/receipts/duplicate-copy.json')); }],
  ['non-independent superseder', p => { const old = failed(p); put(p, old); const r = superseder(p); r.review.reviewer = r.review.builder; put(p, r); witness(p, r); return () => { r.review.reviewer = 'qc'; put(p, r); }; }],
  ['non-transitive retirement', p => { const b = failed(p, 'chain-b'); put(p, b); const a = superseder(p, b.id, 'chain-a'); put(p, a); witness(p, a); const c = superseder(p, a.id, 'chain-c'); put(p, c); witness(p, c); return () => { c.supersedes.push({id: b.id, reason: 'Explicitly retire the remaining FAIL head'}); put(p, c); witness(p, c); }; }],
  ['candidate-wide drift without no-impact proof', p => { const {graph} = oldCandidate(p, {complete: false}); return () => { graph.complete = true; p.write(p.config.gates.graph, graph); }; }],
  ['unknown impact seed', p => { const {graph, node} = oldCandidate(p, {missing: true}); return () => { graph.nodes.push(node); p.write(p.config.gates.graph, graph); }; }],
  ['reachable scoped member', p => { const {graph, node} = oldCandidate(p, {reachable: true}); return () => { graph.edges = graph.edges.filter(edge => edge.from !== node.id); p.write(p.config.gates.graph, graph); }; }],
  ['rules-pin laundering', p => { const old = failed(p); put(p, old); const r = superseder(p); r.pins.rules = 'other-rules'; put(p, r); witness(p, r); return () => { r.pins.rules = old.pins.rules; put(p, r); }; }],
];
export function headFixture(t, mutate, {embeddedOnly = false} = {}) {
  const p = batchFixture(t); const restore = mutate(p);
  if (!embeddedOnly) {
    // Invalid current evidence can also refuse generation. Keep the prior packet
    // in that negative control and require the actual import path to refuse it.
    try { p.rebuildBatch(); } catch (error) { if (error.code !== 2) throw error; }
  }
  const green = () => { restore(); p.rebuildBatch(); };
  return {p, green};
}

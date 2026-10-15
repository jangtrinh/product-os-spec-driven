import {canonical} from '../lib/config/strict-json.mjs';
import {receiptEligible} from './evidence-heads.mjs';
import {validateReceiptRevision} from './receipt-bindings.mjs';

const causal = edge => !['mentions', 'supersedes'].includes(edge.relation);
export function impactClosure(graph, seeds, {censusVerified = false} = {}) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const outgoing = new Map(); const reverse = new Map();
  for (const edge of graph.edges.filter(causal)) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    if (!reverse.has(edge.to)) reverse.set(edge.to, []);
    outgoing.get(edge.from).push(edge); reverse.get(edge.to).push(edge);
  }
  const found = new Map(); const queue = [...new Set(seeds)].map(id => ({id, path: [id]}));
  let complete = graph.complete && censusVerified && seeds.every(id => nodes.has(id));
  while (queue.length) {
    const item = queue.shift(); if (found.has(item.id)) continue;
    const node = nodes.get(item.id);
    if (!node) complete = false;
    found.set(item.id, {node: item.id, classification: item.path.length < 3 ? 'direct' : 'transitive', reason: item.path.join(' -> '), path: item.path});
    for (const edge of outgoing.get(item.id) ?? []) queue.push({id: edge.to, path: [...item.path, edge.to]});
  }
  return {complete, impact: [...found.values()], reverse: Object.fromEntries([...reverse].map(([id, edges]) => [id, edges.map(e => e.from).sort()]))};
}
export function propagationEligible(rows, receipts, scopeIds, {members, approvers = []} = {}) {
  if (!members) return false;
  const covered = new Set();
  for (const row of rows) {
    if (row.status !== 'verified' || !row.review || !row.evidence.length) return false;
    for (const ac of row.ac) covered.add(ac);
    for (const id of row.evidence) {
      const receipt = receipts.find(r => r.id === id);
      if (!receipt || receipt.freshness !== 'CURRENT') return false;
      validateReceiptRevision(receipt, members);
      if (!receiptEligible(receipt, {approvers})) return false;
      if (!row.ac.every(ac => receipt.coverage.passed.includes(ac)) || !row.scenario.every(scn => receipt.coverage.scenarios.includes(scn))) return false;
      // The reviewer must confirm current expected outcomes, not a trace tag.
      if (!receipt.review.criteria.some(c => c.id === 'semantic-propagation' && c.mandatory && c.score === 2 && c.evidence)) return false;
    }
  }
  return scopeIds.every(id => covered.has(id));
}

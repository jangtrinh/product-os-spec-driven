import test from 'node:test';
import assert from 'node:assert/strict';
import {declaredRelationCensus} from '../../lib/declared-relation-census.mjs';

function declarations() {
  const doc = (id, type, trace, body) => ({id, type, rel: `${type}/${id}.md`, fm: {id, type, trace}, body});
  return declaredRelationCensus({docs: [
    doc('US-01', 'us', {req: ['REQ-01']}, ''),
    doc('PRD', 'prd', {decisions: ['D1']}, '| ID | Requirement | Source |\n|---|---|---|\n| REQ-01 | Outcome | — |'),
    doc('ledger', 'decisions', {req: ['REQ-02']}, '| Id | Decision | Detail |\n|---|---|---|\n| D1 | Authorize | — |'),
  ]}).edges.filter(e => e.causal);
}
function reachable(edges, seed) {
  const queue = [seed], seen = new Set();
  for (const id of queue) {
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...edges.filter(e => e.from === id).map(e => e.to));
  }
  return seen;
}
test('registry preserves ancestor document declarations transitively through PRD ownership', () => {
  assert.ok(reachable(declarations(), 'decision:D1').has('req:REQ-01'));
});
test('registry gives a decision ancestor every trace on its owning ledger', () => {
  assert.ok(reachable(declarations(), 'req:REQ-02').has('decision:D1'));
});

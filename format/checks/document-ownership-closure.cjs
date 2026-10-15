'use strict';
const assert = require('node:assert/strict');
const prior = process.argv.find(argument=>argument.startsWith('--registry-at='))?.slice(14);
const registry = prior ? JSON.parse(require('node:child_process').execFileSync('git',
  ['show',prior+':format/reference-registry.json'],{encoding:'utf8'})) : require('../reference-registry.json');
const entries = new Map(registry.entries.map(entry => [entry.id, entry]));
function edge(id, context) {
  const entry = entries.get(id);
  assert(entry, 'missing fixture entry '+id);
  if (!entry.causal || entry.effect !== 'edge') return [];
  const substitute = template => template.replace(/\{([^{}]+)\}/g, (_, key) => {
    assert(Object.hasOwn(context,key), 'missing fixture context '+key); return context[key];
  });
  const nodes = {source:substitute(entry.source.id),target:substitute(entry.target.id)};
  const edges = [[nodes[entry.edge.from], nodes[entry.edge.to]]];
  if (entry.ownership) edges.push([substitute(entry.ownership.id),nodes.target]);
  return edges.filter(([from,to])=>from!==to);
}
function closure(seed, edges) {
  const reached = new Set([seed]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [from,to] of edges) if (reached.has(from) && !reached.has(to)) {
      reached.add(to); changed = true;
    }
  }
  return reached;
}
const prd = {'document-or-record-path':'prd/PRD.md','document-path':'prd/PRD.md',
  'document-kind':'artifact','document-id':'PRD-01','D-id':'D1','row-REQ-id':'REQ-01','REQ-id':'REQ-01','value':'D1','typed-id':'D1'};
const ledger = {'document-or-record-path':'decisions/decisions.md','document-path':'decisions/decisions.md',
  'document-kind':'artifact','document-id':'decisions-01','D-id':'D1','value':'REQ-02','typed-id':'REQ-02'};
const cases = [
  ['PRD decision reaches declared REQ', 'decision:D1', 'req:REQ-01',
    [...edge('front-matter-trace-decisions',prd),...edge('prd-req-identity',prd)]],
  ['ledger REQ reaches declared decision', 'req:REQ-02', 'decision:D1',
    [...edge('front-matter-trace-req',ledger),...edge('decision-ledger-identity',ledger)]]
];
const missing=[];
for (const [name,seed,target,edges] of cases) {
  const reachable=closure(seed,edges).has(target);
  console.log(JSON.stringify({conformance:name,reachable}));
  if (!reachable) missing.push(name);
  assert(!closure(target,edges).has(seed),name+' does not reverse propagation');
  if (!prior) assert(edges.every(([from,to])=>from!==to),name+' has no self-edge');
}
assert.deepEqual(missing,[],'document trace prerequisites must reach all owned identities');
const story={'document-or-record-path':'us/US-01.md','document-kind':'us','document-id':'US-01',
  'US-id':'US-01','AC-id':'AC-01','SCN-id':'SCN-CORE-01','value':'REQ-01'};
const storyEdges=[...edge('front-matter-trace-req',story),...edge('front-matter-id',story),
  ...edge('us-ac-identity',story),...edge('front-matter-defs-scenario-id',story)];
assert(closure('req:REQ-01',storyEdges).has('ac:US-01.AC-01'),'REQ reaches owned AC');
assert(closure('us:US-01',storyEdges).has('scenario:US-01.SCN-CORE-01'),'logical US parent reaches scenario');
assert(closure('artifact:us/US-01.md',storyEdges).has('ac:US-01.AC-01'),'physical document owns AC');
assert.equal(entries.get('body-id-mention').causal,false,'incidental mention never owns');
assert.equal(entries.get('scenario-detail-id').causal,false,'scenario consistency row never owns');
assert.equal(entries.get('dependency-graph-nodes-id').causal,false,'graph projection never owns');
console.log('PASS 2 computed document ownership closures; no reverse propagation, self-edges or mention ownership');

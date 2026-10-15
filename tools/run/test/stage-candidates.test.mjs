import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {candidateFor} from '../registries.mjs';
import {stageCandidates, retainScoped} from '../stage-candidates.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {projectCensusGraph} from '../../../fixtures/runner/census-graph.mjs';

function scopedDefinitions(p) {
  p.write('spec/prd.txt', 'Generated prd\n'); p.write('source/independent.txt', 'Unchanged independent source'); p.write('spec/independent.txt', 'Unchanged independent output');
  const scopes = ['US-16.AC-01', 'US-17.AC-01'].map((id, i) => {
    const def = {...p.definitions.prd, id: `scoped-${i}`, scope: {kind: 'ac', ids: [id], revision: 'proposed'}, ...(i ? {inputs: ['source/independent.txt'], outputs: ['spec/independent.txt']} : {})};
    def.scope = candidateFor(p.root, def).scope;
    p.write(`review/definitions/${def.id}/1.json`, def); p.config.gates.scoped_definitions.push({id: def.id, version: '1'}); return def;
  });
  p.save(); return scopes;
}
test('stage run writes one complete manifest shared by aggregate and every scoped model', t => {
  const p = projectFixture(t); const defs = scopedDefinitions(p); const r = p.run(); assert.equal(r.code, 2, r.out);
  const digest = p.gate('prd').data.model.candidate.manifest;
  const files = fs.readdirSync(path.join(p.root, 'review/candidates')); assert.deepEqual(files, [`${digest}.json`]);
  const manifest = JSON.parse(fs.readFileSync(path.join(p.root, `review/candidates/${digest}.json`), 'utf8'));
  assert.deepEqual(manifest.members.map(row => `${row.kind}:${row.id}`), ['ac:US-16.AC-01', 'ac:US-17.AC-01', 'stage:prd']);
  for (const def of defs) {
    const model = JSON.parse(fs.readFileSync(path.join(p.root, `review/gates/scoped/${def.id}/${def.scope.revision}.json`), 'utf8'));
    assert.equal(model.candidate.manifest, digest); assert.deepEqual(model.scope, def.scope);
  }
});
test('unchanged scoped approval survives combined manifest move only with complete no-impact proof', t => {
  const p = projectFixture(t); const defs = scopedDefinitions(p);
  const graph = {version: '1', complete: true, nodes: [{id: 'ac:US-16.AC-01', kind: 'ac', source: 'input/po-spec.txt', revision: '1'}, {id: 'ac:US-17.AC-01', kind: 'ac', source: 'source/independent.txt', revision: '1'}], edges: []};
  for (const id of ['US-16', 'US-17']) {graph.nodes.push({id: `us:${id}`, kind: 'us', source: 'spec/prd.txt', revision: '1'}); graph.edges.push({from: `us:${id}`, to: `ac:${id}.AC-01`, relation: 'derives', source: 'spec/prd.txt', revision: '1'});}
  p.write(p.config.gates.graph, graph); assert.equal(p.run().code, 2);
  const file = `review/gates/scoped/${defs[1].id}/${defs[1].scope.revision}.json`;
  const model = JSON.parse(fs.readFileSync(path.join(p.root, file), 'utf8')); model.states.human = 'APPROVED'; model.decision = 'prior-scoped-approval'; p.write(file, model);
  p.write('input/po-spec.txt', 'Only local first member changes');
  const pins = {...p.gate('prd').data.model.candidate};
  const candidates = stageCandidates(p.root, [p.definitions.prd, ...defs], [], pins);
  const independent = candidates.find(row => row.definition.id === defs[1].id); assert.notEqual(independent.digest, model.candidate.manifest);
  const full = projectCensusGraph(p);
  for (const node of graph.nodes) {
    const declared = full.nodes.find(n => n.id === node.id);
    if (declared) Object.assign(declared, node); else full.nodes.push(node);
  }
  for (const edge of graph.edges) if (!full.edges.some(e => e.from === edge.from && e.to === edge.to && e.relation === edge.relation)) full.edges.push(edge);
  Object.assign(graph, full); p.write(p.config.gates.graph, graph);
  const previous = {data: {invalidation: {reason: 'Typed causal impact closure; source-backed independent scope proof', impact: [{node: 'ac:US-16.AC-01', classification: 'direct', reason: 'Only local source changed', path: ['ac:US-16.AC-01']}]}}};
  const retained = retainScoped(p.root, p.config, independent, previous);
  assert.equal(retained.states.human, 'APPROVED'); assert.equal(retained.decision, model.decision); assert.equal(retained.candidate.manifest, independent.digest);
  assert.equal(canonical(retained.scope), canonical(model.scope)); assert.equal(retainScoped(p.root, p.config, independent, {data: {invalidation: {reason: 'BR-14 fallback'}}}), null);
  p.write(p.config.gates.graph, {...graph, complete: false}); assert.equal(retainScoped(p.root, p.config, independent, previous), null); p.write(p.config.gates.graph, graph);
  p.write('source/independent.txt','Changed member after scoped approval');
  const changed=stageCandidates(p.root,[p.definitions.prd,...defs],[],pins).find(row=>row.definition.id===defs[1].id);
  assert.equal(retainScoped(p.root,p.config,changed,previous),null);
  p.write('source/independent.txt','Unchanged independent source');
  model.states.freshness = 'STALE'; p.write(file, model);
  assert.throws(() => retainScoped(p.root, p.config, independent, previous), /CURRENT/);
  model.states.human = 'PENDING'; model.decision = null; p.write(file, model);
  assert.equal(retainScoped(p.root, p.config, independent, previous), null);
});
test('conflicting definitions for the same candidate member reject before gate creation', t => {
  const p = projectFixture(t); const defs = scopedDefinitions(p); const conflicting = {...defs[1], scope: {...defs[1].scope, ids: defs[0].scope.ids}};
  assert.throws(() => stageCandidates(p.root, [defs[0], conflicting], [], {}), /Conflicting candidate member/);
});

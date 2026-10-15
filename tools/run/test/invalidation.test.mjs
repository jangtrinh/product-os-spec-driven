import {definitionRevision} from '../../lib/definition-scope.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {impactClosure, propagationEligible} from '../impact-closure.mjs';
import {loadRegistries} from '../registries.mjs';
import {invalidateGates} from '../invalidate-gates.mjs';
import {writeGate} from '../gate-files.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';
import {certifiedFixtureGraph} from '../../../fixtures/runner/amendment-controls.mjs';

function scopedClosureFixture(t, complete) {
  const p = projectFixture(t, ['prd', 'us']); p.config.roles.po.enabled = false;
  for (const stage of ['prd', 'us']) {
    p.write(`source/${stage}.txt`, `Independent ${stage} source`); p.write(`spec/${stage}.txt`, `Generated ${stage}\n`);
    p.config.stages[stage].context = [`source/${stage}.txt`]; p.definitions[stage].inputs = [`source/${stage}.txt`];
  }
  const nodes = [{id: 'ac:US-16.AC-01', kind: 'ac', source: 'source/prd.txt', revision: '1'}, {id: 'scenario:US-16.SCN-16-01', kind: 'scenario', source: 'spec/scenario.txt', revision: '1'}, {id: 'screen-state:S01/normal', kind: 'screen-state', source: 'spec/screen.txt', revision: '1'}, {id: 'ac:US-17.AC-01', kind: 'ac', source: 'source/us.txt', revision: '1'}];
  const edges = [['ac:US-16.AC-01', 'scenario:US-16.SCN-16-01', 'verifies'], ['scenario:US-16.SCN-16-01', 'screen-state:S01/normal', 'implements']].map(([from, to, relation]) => ({from, to, relation, source: 'source/prd.txt', revision: '1'}));
  for (const [us, stage] of [['US-16', 'prd'], ['US-17', 'us']]) {nodes.push({id: `us:${us}`, kind: 'us', source: `spec/${stage}.txt`, revision: '1'}); edges.push({from: `us:${us}`, to: `ac:${us}.AC-01`, relation: 'derives', source: `spec/${stage}.txt`, revision: '1'});}
  p.write('spec/scenario.txt', 'Local scenario declaration'); p.write('spec/screen.txt', 'Local screen declaration');
  p.write('review/graph.json', {version: '1', complete, nodes, edges}); p.save(); assert.equal(p.run().code, 0);
  const gate = p.gate('prd'); const id = gate.data.model.receipts[0];
  const receipt = JSON.parse(fs.readFileSync(path.join(p.root, `review/receipts/${id}.json`), 'utf8'));
  gate.data.model.receipts.push('graph-census'); writeGate(p.root, p.config, 'prd', 'NOT_REQUIRED', gate.data);
  const graph = {version:'1', complete, nodes, edges};
  // Input paths are declared by the pipeline. The explicit AC source mappings
  // above are the fixture's local observable outcomes used as impact seeds.
  for (const stage of ['prd', 'us']) graph.nodes.push({id:`artifact:source/${stage}.txt`, kind:'artifact', source:'config/pipeline.yaml', revision:'1'});
  certifiedFixtureGraph(p, graph, receipt, 'graph-census');
  // Certification finalizes the fixture graph after the initial stage run.
  // Observe that final graph in both synthetic gates before changing a source;
  // otherwise the setup itself seeds a shared graph change, not a local change.
  const graphRevision = sha256(fs.readFileSync(path.join(p.root, p.config.gates.graph)));
  for (const stage of ['prd', 'us']) {
    const current = p.gate(stage);
    current.data.inputs[p.config.gates.graph] = graphRevision;
    writeGate(p.root, p.config, stage, 'NOT_REQUIRED', current.data);
  }
  return {p, id};
}

test('US-SD0203.AC-01: changed PRD bytes reset US and rerun', t => {
  const p = projectFixture(t, ['prd', 'us']); p.config.roles.po.enabled = false; p.config.stages.us.context.push('spec/prd.txt'); p.save();
  assert.equal(p.run().code, 0); const old = p.gate('us').data.model.receipts[0]; p.write('spec/prd.txt', 'Changed approved PRD\n');
  const r = p.run(); assert.equal(r.code, 0, r.out); assert.notEqual(p.gate('us').data.model.receipts[0], old);
  assert.match(fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8'), /BR-14 fallback/);
});
test('US-SD0203.AC-02: source change resets and rechecks every later passed gate', t => {
  const p = projectFixture(t, ['clarify', 'prd', 'us']); p.config.roles.po.enabled = false; p.save(); assert.equal(p.run().code, 0);
  p.write('input/po-spec.txt', 'Changed PO source\n'); const r = p.run(); assert.equal(r.code, 0, r.out);
  for (const stage of ['clarify', 'prd', 'us']) {assert.match(p.gate(stage).raw, /^GATE: NOT_REQUIRED/); assert.match(r.out,new RegExp(stage+': GATE: NOT_REQUIRED'));}
  assert.doesNotMatch(r.out, /scope-version-required/);
  assert.match(fs.readFileSync(path.join(p.root,'review/audit.jsonl'),'utf8'),/BR-14 fallback/);
});
test('US-SD0203.AC-03: unchanged inventory never reruns passed gates', t => {
  const p = projectFixture(t, ['prd', 'us']); p.config.roles.po.enabled = false; p.save(); assert.equal(p.run().code, 0);
  const before = ['prd', 'us'].map(stage => p.gate(stage).raw); assert.equal(p.run().code, 0);
  assert.deepEqual(['prd', 'us'].map(stage => p.gate(stage).raw), before);
});
test('adding/deleting directory context member invalidates sorted inventory', t => {
  const p = projectFixture(t); p.write('source/a.txt', 'source a'); p.config.stages.prd.context.push('source/'); p.save(); assert.equal(p.run().code, 2);
  p.approve('prd'); p.write('source/b.txt', 'source b'); const r = p.run(); assert.equal(r.code, 2, r.out); assert.match(p.gate('prd').raw, /^GATE: PENDING/);
  assert.ok(Object.hasOwn(p.gate('prd').data.inputs, 'source/b.txt'));
});
test('typed closure traverses cycles; mentions never proves causal independence', () => {
  const graph = {version: '1', complete: true, nodes: ['ac:local', 'scenario:dependent', 'screen-state:S01/normal', 'ac:independent'].map(id => ({id})), edges: [{from: 'ac:local', to: 'scenario:dependent', relation: 'verifies'}, {from: 'scenario:dependent', to: 'screen-state:S01/normal', relation: 'implements'}, {from: 'screen-state:S01/normal', to: 'ac:local', relation: 'uses'}, {from: 'ac:local', to: 'ac:independent', relation: 'mentions'}]};
  const closure = impactClosure(graph, ['ac:local'], {censusVerified: true});
  assert.equal(closure.complete, true); assert.deepEqual(closure.impact.map(row => row.node), ['ac:local', 'scenario:dependent', 'screen-state:S01/normal']);
  assert.equal(impactClosure(graph, ['ac:local']).complete, false);
});
test('old scenario with valid amendment tag does not establish semantic propagation', () => {
  const rows = [{status: 'verified', review: 'A-09 is tagged', evidence: ['receipt'], ac: ['US-16.AC-01'], scenario: ['US-16.SCN-16-01']}];
  const receipts = [{id: 'receipt', freshness: 'CURRENT', execution: {result: 'PASS'}, review: {independent: true, criteria: [{id: 'trace-tag', mandatory: true, score: 2, evidence: 'A-09'}]}, coverage: {passed: ['US-16.AC-01'], scenarios: ['US-16.SCN-16-01']}}];
  assert.equal(propagationEligible(rows, receipts, ['US-16.AC-01']), false);
});
test('proved complete local closure stales SCN/screen/receipt and preserves independent gate', t => {
  const {p, id} = scopedClosureFixture(t, true); const independent = p.gate('us').raw;
  const oldReceipt = fs.readFileSync(path.join(p.root, `review/receipts/${id}.json`));
  p.write('source/prd.txt', 'A-09-like local observable outcome changed');
  const result = invalidateGates(p.root, p.config, loadRegistries(p.root, p.config), {head: 'fixture-head', build: 'not-built'});
  assert.equal(result.impact.complete, true); assert.deepEqual(result.impact.impact.map(row => row.node), ['ac:US-16.AC-01', 'scenario:US-16.SCN-16-01', 'screen-state:S01/normal']);
  assert.deepEqual([...result.invalidated], ['prd']); assert.equal(p.gate('us').raw, independent);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, `review/freshness/${id}.json`), 'utf8')).freshness, 'STALE');
  assert.deepEqual(fs.readFileSync(path.join(p.root, `review/receipts/${id}.json`)), oldReceipt);
});
test('missing census edge and unmapped shared rule broaden closure conservatively', t => {
  for (const complete of [false, true]) {
    const {p} = scopedClosureFixture(t, complete);
    if (complete) { p.write('shared-rule.txt', 'A-06-like rule'); p.config.stages.prd.context.push('shared-rule.txt'); p.save(); }
    else p.write('source/prd.txt', 'Changed source without complete consumer census');
    const result = invalidateGates(p.root, p.config, loadRegistries(p.root, p.config), {head: 'fixture-head', build: 'not-built'});
    assert.equal(result.impact.complete, false); assert.deepEqual([...result.invalidated], ['prd', 'us']);
    assert.match(p.gate('us').data.invalidation.reason, /BR-14 fallback/);
  }
});
test('graph change after the final fixture observation invalidates both consuming gates', t => {
  const {p} = scopedClosureFixture(t, true);
  const graphFile = path.join(p.root, p.config.gates.graph);
  p.write(p.config.gates.graph, fs.readFileSync(graphFile, 'utf8') + '\n');
  const result = invalidateGates(p.root, p.config, loadRegistries(p.root, p.config), {head: 'fixture-head', build: 'not-built'});
  assert.equal(result.impact.complete, false);
  assert.deepEqual([...result.invalidated], ['prd', 'us']);
  assert.ok(p.gate('us').data.invalidation.changed.includes(p.config.gates.graph));
});
test('changed bundle reruns configured aggregate corpus command after new version binding', t => {
  const p = projectFixture(t); p.config.roles.po.enabled = false;
  const capture = path.join(p.root, 'corpus-runs.jsonl');
  p.config.evals.prd = [{run: command({eval: true, evalCapture: capture}), per_file: 'spec/prd.txt'}]; p.save(); assert.equal(p.run().code, 0);
  p.write('input/po-spec.txt', 'Changed corpus source'); p.definitions.prd.version = '2'; p.config.gates.stage_definitions.prd.version = '2'; p.definitions.prd.scope.revision = definitionRevision(p.definitions.prd); p.save();
  const r = p.run(); assert.equal(r.code, 0, r.out);
  assert.equal(fs.readFileSync(capture, 'utf8').trim().split('\n').length, 2);
});

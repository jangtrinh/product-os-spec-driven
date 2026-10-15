import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {graphReceipt} from '../../../fixtures/runner/amendment-controls.mjs';
import {projectCensusGraph} from '../../../fixtures/runner/census-graph.mjs';
import {dependencyCensus} from '../dependency-census.mjs';
import {censusEligible} from '../gate-evidence.mjs';
import {loadEvidence} from '../evidence-heads.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {certifiedFixtureGraph} from '../../../fixtures/runner/amendment-controls.mjs';
import {copy, put, snapshot} from '../../../fixtures/runner/evidence-head-controls.mjs';
import {certificateFixture, remove} from '../../lint/test/graph-certification-fixture.mjs';
import {noImpactProof} from '../gate-evidence.mjs';
import {selectHeads} from '../evidence-heads.mjs';
import {receiptMembers} from '../receipt-keys.mjs';

test('terminal graph certificate converges with proof ownership and four stable review rounds', t => {
  const p = batchFixture(t);
  let graph = projectCensusGraph(p); p.write(p.config.gates.graph, graph);
  let proof = graphReceipt(p);
  assert.equal(dependencyCensus(p.root, p.config, graph).complete(), false, 'new proof topology needs regeneration');
  graph = projectCensusGraph(p); p.write(p.config.gates.graph, graph); proof = graphReceipt(p);
  assert.equal(dependencyCensus(p.root, p.config, graph).complete(), true);
  assert.equal(censusEligible(loadEvidence(p.root, p.config), graph, proof.pins), true);
  const stable = canonical(graph);
  for (let round = 0; round < 4; round++) {
    graph = projectCensusGraph(p);
    assert.equal(canonical(graph), stable);
    p.write(p.config.gates.graph, graph); proof = graphReceipt(p);
    assert.equal(censusEligible(loadEvidence(p.root, p.config), graph, proof.pins), true);
  }
  assert.ok(graph.nodes.some(n => n.id === `artifact:${p.config.gates.graph}`));
  assert.ok(graph.edges.some(e => e.from === 'artifact:review/receipts/current-graph-proof.json' && e.to === 'receipt:current-graph-proof' && e.relation === 'derives'));
});
for (const mutation of ['missing','reversed','non-causal']) test(`proof receipt document ownership is required: ${mutation}`,t => {
  const {p,graph,proof} = certificateFixture(t), bad = copy(graph);
  const edge = bad.edges.find(e => e.from === 'artifact:review/receipts/current-graph-proof.json' && e.to === 'receipt:current-graph-proof');
  assert.ok(edge);
  if (mutation === 'missing') bad.edges.splice(bad.edges.indexOf(edge),1);
  if (mutation === 'reversed') [edge.from,edge.to] = [edge.to,edge.from];
  if (mutation === 'non-causal') edge.causal = false;
  assert.notDeepEqual(bad,graph);
  const before = snapshot(p);
  assert.equal(censusEligible(loadEvidence(p.root,p.config),bad,proof.pins),false);
  assert.deepEqual(snapshot(p),before);
  assert.equal(censusEligible(loadEvidence(p.root,p.config),graph,proof.pins),true);
});
test('independence proof for omitted certificate is unavailable even with a stored target node',t => {
  const {p,graph,proof,file} = certificateFixture(t), id = `artifact:${file}`;
  graph.nodes.push({id,kind:'artifact',source:file,revision:'1'});
  const seed = graph.nodes.find(n => n.id !== id).id;
  const closure = {candidate:proof.pins,impact:[{node:seed,path:[seed],classification:'direct'}]};
  assert.equal(noImpactProof(graph,proof.pins,closure,{root:p.root,config:p.config})(proof,{kind:'artifact',id:file,artifacts:{}}),false);
});
test('fresh proof identity regenerates finite topology and old raw-byte proof becomes stale',t => {
  const {p,graph,proof} = certificateFixture(t), oldBytes = canonical(graph);
  const fresh = certifiedFixtureGraph(p,graph,proof,'fresh-independent-graph-proof');
  assert.notEqual(canonical(graph),oldBytes);
  const context = loadEvidence(p.root,p.config), oldMember = receiptMembers(context,proof)[0];
  assert.equal(selectHeads(context,{member:oldMember,members:[oldMember],pins:proof.pins,domain:'spec',graphProof:true,reviewRequired:true}).eligible,false);
  assert.equal(censusEligible(context,graph,fresh.pins),true);
  const stable = canonical(graph);
  for (let round=0;round<4;round++) assert.equal(canonical(projectCensusGraph(p)),stable);
});
test('current failing proof head cannot be hidden by the certification exception',t => {
  const {p,graph,proof} = certificateFixture(t), fail = copy(proof); fail.id = 'failing-graph-proof';
  fail.execution.result = 'FAIL'; fail.execution.exit = 1; fail.review.verdict = 'FAIL'; put(p,fail);
  const fresh = certifiedFixtureGraph(p,graph,proof,proof.id);
  Object.assign(fail,graphReceipt(p,fail,fail.id)); fail.execution.result = 'FAIL'; fail.execution.exit = 1; fail.review.verdict = 'FAIL'; put(p,fail);
  assert.equal(dependencyCensus(p.root,p.config,graph).complete(),true);
  const before = snapshot(p);
  assert.throws(()=>censusEligible(loadEvidence(p.root,p.config),graph,fresh.pins),error=>error.code===2);
  assert.deepEqual(snapshot(p),before);
  fail.execution = copy(fresh.execution); fail.review = copy(fresh.review); put(p,fail);
  assert.equal(censusEligible(loadEvidence(p.root,p.config),graph,fresh.pins),true);
});
test('source addition, changed references and deleted source fail current reused census handles',t => {
  const {p,graph} = certificateFixture(t), check = dependencyCensus(p.root,p.config,graph);
  assert.equal(check.complete(),true);
  p.write('spec/added-contract.md','---\nid: added\ntype: contract\n---\nAdded declared source');
  assert.equal(check.complete(),false);
  remove(p,'spec/added-contract.md'); assert.equal(check.complete(),true);
  const original = p.definitions.prd.inputs;
  p.write('source/new.txt','new prerequisite'); p.definitions.prd.inputs = [...original,'source/new.txt']; p.save();
  assert.equal(check.complete(),false);
  p.definitions.prd.inputs = original; p.save(); remove(p,'source/new.txt'); assert.equal(check.complete(),true);
  const changedConfig = copy(p.config); changedConfig.gates.graph = 'review/other-graph.json';
  p.write(changedConfig.gates.graph,graph); p.write('config/pipeline.yaml',changedConfig);
  assert.equal(check.complete(),false);
  p.save(); remove(p,changedConfig.gates.graph); assert.equal(check.complete(),true);
  const file = 'review/receipts/current-graph-proof.json';
  remove(p,file); assert.equal(check.complete(),false);
});

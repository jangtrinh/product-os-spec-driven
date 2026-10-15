import {definitionRevision} from '../../lib/definition-scope.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {stageHeadFixture} from '../../../fixtures/runner/stage-head-fixture.mjs';
import {headControls, snapshot, copy, put} from '../../../fixtures/runner/evidence-head-controls.mjs';
import {recordDeliveryEvent} from '../delivery-state.mjs';
import {auditEvents} from '../audit-store.mjs';
import {loadEvidence, selectHeads} from '../evidence-heads.mjs';
import {censusEligible} from '../gate-evidence.mjs';
import {hashes, sha256} from '../../lib/config/path-selection.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {graphReceipt, certifiedFixtureGraph} from '../../../fixtures/runner/amendment-controls.mjs';

for (const [name, mutate] of headControls.filter(([name]) => !['embedded-only supersession', 'key-drift laundering', 'pins laundering'].includes(name))) test(`publication rejects ${name} without mutation; reverted control publishes`, t => {
  const p = batchFixture(t); let green;
  if (['candidate-wide drift without no-impact proof', 'unknown impact seed', 'reachable scoped member'].includes(name)) {
    const restore = mutate(p); const badGraph = fs.readFileSync(path.join(p.root, p.config.gates.graph)); restore();
    const goodGraph = fs.readFileSync(path.join(p.root, p.config.gates.graph)); p.rebuildBatch(); assert.equal(p.importBatch().code, 0);
    p.write(p.config.gates.graph, badGraph.toString()); green = () => p.write(p.config.gates.graph, goodGraph.toString());
  } else { assert.equal(p.importBatch().code, 0); green = mutate(p); }
  const before = snapshot(p);
  assert.throws(() => recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'publish-head-control', type: 'publication', actor: 'po@example.test'}, p.packet.candidate), error => error.code === 2);
  assert.deepEqual(snapshot(p), before);
  green(); assert.equal(recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'publish-head-control', type: 'publication', actor: 'po@example.test'}, p.packet.candidate).type, 'publication');
});
test('new contradictory observation is stored and gate remains pending without implicit retirement', t => {
  const p = stageHeadFixture(t); const old = fs.readFileSync(path.join(p.root, 'review/receipts/migrated-current-fail.json'));
  const result = p.run(); assert.equal(result.code, 2, result.out); assert.match(result.out, /conflicting current evidence/); assert.match(p.gate('prd').raw, /^GATE: PENDING/);
  const files = fs.readdirSync(path.join(p.root, 'review/receipts')); assert.equal(files.length, 2);
  assert.deepEqual(fs.readFileSync(path.join(p.root, 'review/receipts/migrated-current-fail.json')), old);
  const fresh = p.read(`review/receipts/${files.find(file => file !== 'migrated-current-fail.json')}`); assert.equal(fresh.supersedes, undefined); assert.match(fresh.at, /\.\d{3}Z$/);
});
test('changed bound bytes retire prior FAIL naturally without supersedes', t => {
  const p = stageHeadFixture(t); p.write('input/po-spec.txt', 'Changed real source bytes'); p.definitions.prd.version = '2'; p.config.gates.stage_definitions.prd.version = '2'; p.definitions.prd.scope.revision = definitionRevision(p.definitions.prd); p.save();
  const result = p.run(); assert.equal(result.code, 0, result.out); assert.match(p.gate('prd').raw, /^GATE: NOT_REQUIRED/);
  assert.equal(fs.readdirSync(path.join(p.root, 'review/receipts')).length, 2);
  assert.equal(p.read('review/receipts/migrated-current-fail.json').execution.result, 'FAIL');
});
for (const manual of [false, true]) test(`explicit retirement CLI runs fresh ${manual ? 'manual' : 'automatic'} review and witnesses both ids`, t => {
  const p = stageHeadFixture(t, {manual});
  const args = ['--stage', 'prd', '--supersedes', p.receipt.id, '--reason', 'Independent re-observation on identical bytes', ...(manual ? ['--result', 'manual-review.txt', '--independent-review'] : [])];
  if (manual) { const pending = p.run(args.filter((value, index) => value !== '--result' && args[index - 1] !== '--result')); assert.equal(pending.code, 2, pending.out); assert.match(pending.out, /manual/); }
  const result = p.run(args); assert.equal(result.code, 0, result.out);
  const id = p.gate('prd').data.model.receipts[0]; const receipt = p.read(`review/receipts/${id}.json`);
  assert.deepEqual(receipt.supersedes, [{id: p.receipt.id, reason: 'Independent re-observation on identical bytes'}]);
  assert.ok(auditEvents(p.root).some(event => event.type === 'eval' && event.refs.includes(id) && event.refs.includes(p.receipt.id)));
  assert.equal(p.gate('prd').data.model.rounds.review, 1);
});
for (const [name, mutate, flags] of [
  ['dangling', () => {}, ['--supersedes', 'missing', '--reason', 'Reobserve']],
  ['domain drift', p => {p.receipt.domain = 'concept'; put(p, p.receipt);}, null],
  ['rules drift', p => {p.receipt.pins.rules = 'old-rules'; put(p, p.receipt);}, null],
  ['source drift', p => {p.receipt.artifacts['input/po-spec.txt'] = 'a'.repeat(64); put(p, p.receipt);}, null],
  ['non-independent reviewer', p => {p.definitions.prd.reviewer = 'dev'; p.save();}, null],
  ['missing manual independence', () => {}, null],
]) test(`retirement preflight rejects ${name} before any state mutation`, t => {
  const p = stageHeadFixture(t, {manual: name === 'missing manual independence'}); mutate(p); const before = snapshot(p);
  const result = p.run(['--stage', 'prd', ...(flags ?? ['--supersedes', p.receipt.id, '--reason', 'Independent reobserve'])]);
  assert.equal(result.code, 2, result.out); assert.deepEqual(snapshot(p), before);
});
test('settled gate rejects a new same-key FAIL before modifying any projection', t => {
  const p = projectFixture(t); p.config.roles.po.enabled = false; p.save(); assert.equal(p.run().code, 0);
  const id = p.gate('prd').data.model.receipts[0]; const receipt = JSON.parse(fs.readFileSync(path.join(p.root, `review/receipts/${id}.json`))); receipt.id = 'late-fail'; receipt.execution.result = 'FAIL'; receipt.execution.exit = 1; put(p, receipt);
  const before = snapshot(p); const result = p.run(); assert.equal(result.code, 2, result.out); assert.deepEqual(snapshot(p), before);
});
test('graph census checks every current proof head rather than finding one PASS', t => {
  const p = stageHeadFixture(t); const graph = p.read(p.config.gates.graph); graph.complete = true; p.write(p.config.gates.graph, graph); const pass = graphReceipt(p, p.receipt, 'census-pass');
  const fail = copy(pass); fail.id = 'census-fail'; fail.execution.result = 'FAIL'; fail.execution.exit = 1; put(p, fail);
  const before = snapshot(p); assert.throws(() => censusEligible(loadEvidence(p.root, p.config), graph, pass.pins), error => error.code === 2); assert.deepEqual(snapshot(p), before);
  fail.review.criteria = [{id: 'source', mandatory: true, score: 2, evidence: 'Removing a criterion does not retire the FAIL head'}]; put(p, fail);
  const withoutCriterion = snapshot(p); assert.throws(() => censusEligible(loadEvidence(p.root, p.config), graph, pass.pins), error => error.code === 2); assert.deepEqual(snapshot(p), withoutCriterion);
  fail.review.criteria = copy(pass.review.criteria);
  fail.execution = copy(pass.execution); put(p, fail);
  Object.assign(pass, certifiedFixtureGraph(p, graph, pass, pass.id));
  Object.assign(fail, graphReceipt(p, fail, fail.id));
  assert.equal(censusEligible(loadEvidence(p.root, p.config), graph, pass.pins), true);
  const member = {kind: 'artifact', id: 'named-census-artifact', artifacts: hashes(p.root, [p.config.gates.graph, 'input/po-spec.txt'])}; member.revision = sha256(canonical(member.artifacts));
  const manifest = {version: '1', members: [member]}; let digest = sha256(canonical(manifest)); p.write(`review/candidates/${digest}.json`, manifest);
  const named = copy(pass); named.id = 'named-census-pass'; named.scope = {kind: 'artifact', ids: [member.id], revision: sha256(canonical([member]))}; named.pins.manifest = digest; named.artifacts = member.artifacts; named.review.inputs = Object.keys(member.artifacts); put(p, named);
  const namedFail = copy(named); namedFail.id = 'named-census-fail'; namedFail.execution.result = 'FAIL'; namedFail.execution.exit = 1; namedFail.review.criteria = [{id: 'source', mandatory: true, score: 2, evidence: 'Hidden label cannot retire a named artifact FAIL'}]; put(p, namedFail);
  p.write('review/freshness/census-pass.json', {freshness: 'STALE'}); p.write('review/freshness/census-fail.json', {freshness: 'STALE'});
  const namedBefore = snapshot(p); assert.throws(() => censusEligible(loadEvidence(p.root, p.config), graph, {...p.receipt.pins, manifest: digest}), error => error.code === 2); assert.deepEqual(snapshot(p), namedBefore);
  namedFail.execution = copy(named.execution); namedFail.review.criteria = copy(named.review.criteria); put(p, namedFail);
  // The mixed certificate has no self-certification exception. Restore a valid
  // terminal certificate while retaining both independently checked proof heads.
  Object.assign(named, certifiedFixtureGraph(p, graph, named, named.id));
  Object.assign(namedFail, graphReceipt(p, namedFail, namedFail.id));
  digest = named.pins.manifest;
  assert.equal(censusEligible(loadEvidence(p.root, p.config), graph, {...p.receipt.pins, manifest: digest}), true);
});
test('stale superseder edges are inert and cannot hide a current FAIL', t => {
  const p = stageHeadFixture(t); const pass = copy(p.receipt); pass.id = 'stale-pass'; pass.execution.result = 'PASS'; pass.execution.exit = 0; pass.review.verdict = 'PASS'; pass.review.criteria[0].score = 2; pass.supersedes = [{id: 'missing-historical-target', reason: 'Historical retirement'}]; put(p, pass);
  p.write(`review/freshness/${pass.id}.json`, {id: pass.id, freshness: 'STALE'});
  const before = snapshot(p); const selected = selectHeads(loadEvidence(p.root, p.config), {member: p.candidate.manifest.members[0], pins: p.receipt.pins, domain: 'spec'});
  assert.deepEqual(selected.heads.map(row => row.id), [p.receipt.id]); assert.equal(selected.eligible, false); assert.deepEqual(snapshot(p), before);
});
test('explicit re-observation runs eval and fresh review without launching the builder', t => {
  const p = stageHeadFixture(t); p.config.agents.writer.command = 'absent-builder-must-not-run'; p.save();
  const beforeSource = fs.readFileSync(path.join(p.root, 'spec/prd.txt'));
  const result = p.run(['--stage', 'prd', '--supersedes', p.receipt.id, '--reason', 'Read-only independent re-observation']);
  assert.equal(result.code, 0, result.out); assert.deepEqual(fs.readFileSync(path.join(p.root, 'spec/prd.txt')), beforeSource);
  assert.equal(fs.readdirSync(path.join(p.root, 'review/log')).some(file => file.includes('writer')), false);
});
test('publication retry rejects a later FAIL before changing its existing snapshot', t => {
  const p = batchFixture(t); assert.equal(p.importBatch().code, 0);
  const event = {id: 'retry-publication', type: 'publication', actor: 'po@example.test'};
  recordDeliveryEvent(p.root, p.config, p.changeSet.id, event, p.packet.candidate);
  const fail = copy(p.packet.evidence[0]); fail.id = 'later-fail'; fail.execution.result = 'FAIL'; fail.execution.exit = 1; put(p, fail);
  const before = snapshot(p); assert.throws(() => recordDeliveryEvent(p.root, p.config, p.changeSet.id, event, p.packet.candidate), error => error.code === 2); assert.deepEqual(snapshot(p), before);
});
test('embedded-only ordinary PASS cannot establish import or publication; rejection preserves the store', t => {
  const p = batchFixture(t); fs.rmSync(path.join(p.root, 'review/receipts/fixture-receipt.json'));
  const before = snapshot(p);
  const result = p.importBatch(); assert.equal(result.code, 3, result.out);
  assert.deepEqual(snapshot(p), before);
  assert.equal(fs.existsSync(path.join(p.root, 'review/receipts/fixture-receipt.json')), false);
  assert.equal(fs.existsSync(path.join(p.root, 'review/decisions/fixture-decision.json')), false);
  p.write('review/receipts/fixture-receipt.json', p.packet.evidence[0]); p.rebuildBatch();
  assert.equal(p.importBatch().code, 0);
  assert.equal(recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'publish-resident', type: 'publication', actor: 'po@example.test'}, p.packet.candidate).type, 'publication');
});
test('legacy settled gate without a receipt model fails closed without mutation', t => {
  const p = projectFixture(t); p.config.roles.po.enabled = false; p.save(); assert.equal(p.run().code, 0);
  const data = p.gate('prd').data; delete data.model; p.write('review/gates/prd.md', `GATE: NOT_REQUIRED\n\n\`\`\`gate-data\n${JSON.stringify(data)}\n\`\`\`\n`);
  const before = snapshot(p); const result = p.run(); assert.equal(result.code, 2, result.out); assert.deepEqual(snapshot(p), before);
});
test('review-disabled owner-disabled stages settle without claiming reviewed quality', t => {
  const p = projectFixture(t, ['prd', 'us']); p.config.review.enabled = false; p.config.roles.po.enabled = false; p.save();
  const result = p.run(); assert.equal(result.code, 0, result.out); assert.equal(p.run().code, 0);
  for (const stage of ['prd', 'us']) { assert.match(p.gate(stage).raw, /^GATE: NOT_REQUIRED/); assert.equal(p.gate(stage).data.review.enabled, false); assert.equal(p.gate(stage).data.model.states.review, 'NOT_RUN'); }
});
test('failed explicit re-observation preserves real exit and never launches artifact repair', t => {
  const p = stageHeadFixture(t); p.config.agents.writer.command = 'absent-builder-must-not-run';
  p.config.evals.prd = [{run: `${command({eval: true, reject: 'Generated'})} spec/prd.txt`}]; p.save();
  const source = fs.readFileSync(path.join(p.root, 'spec/prd.txt'));
  const result = p.run(['--stage', 'prd', '--supersedes', p.receipt.id, '--reason', 'Independent re-observation with actual failing eval']);
  assert.equal(result.code, 2, result.out); assert.deepEqual(fs.readFileSync(path.join(p.root, 'spec/prd.txt')), source);
  const receipt = p.read(`review/receipts/${p.gate('prd').data.model.receipts[0]}.json`);
  assert.equal(receipt.execution.result, 'FAIL'); assert.equal(receipt.execution.exit, 1); assert.equal(p.gate('prd').data.model.states.eval, 'FAIL'); assert.equal(p.gate('prd').data.model.rounds.eval_fix, 0);
});

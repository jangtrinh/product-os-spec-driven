import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {certifiedFixtureGraph} from '../../../fixtures/runner/amendment-controls.mjs';
import {definitionRevision} from '../../lib/definition-scope.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';
import {loadRegistries} from '../registries.mjs';
import {invalidateGates, passedGateEligible} from '../invalidate-gates.mjs';
import {writeGate} from '../gate-files.mjs';

// A path the stage declares as an output is exempt from a fresh invalidation only when this stage's own
// repair wrote those bytes. A foreign or hand write to a declared output is a new cause.
const REVIEW = 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"original source compared with final output"}],"findings":[]}\n```\n';
const br14 = p => fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8').split('\n').filter(line => line.includes('BR-14 fallback')).length;

// Manual writer and manual reviewer: settled, approved, then the source is edited so the next run repairs.
function staleManualRepair(t) {
  const p = projectFixture(t, ['prd']);
  p.config.agents.writer.command = 'manual'; p.config.agents.reviewer.command = 'manual'; p.save();
  p.write('writer-1.txt', 'Generated prd v1\n'); p.write('writer-2.txt', 'Generated prd v2\n'); p.write('review.txt', REVIEW);
  assert.equal(p.run().code, 2);
  assert.equal(p.run(['--result', 'writer-1.txt']).code, 2);
  assert.equal(p.run(['--result', 'review.txt', '--independent-review']).code, 2);
  p.approve('prd');
  const baseline = br14(p);
  p.write('input/po-spec.txt', 'Original source and AC outcomes. Edited by PO.\n');
  const stale = p.run(); assert.equal(stale.code, 2, stale.out); assert.match(stale.out, /Manual writer pending/);
  assert.equal(br14(p), baseline + 1);
  return {p, baseline};
}

test('a foreign write to a declared output while stale is a new invalidation with its own BR-14 event', t => {
  const {p, baseline} = staleManualRepair(t);
  p.write('spec/prd.txt', 'Hand edit by someone other than the stage writer\n');
  const rerun = p.run(); assert.equal(rerun.code, 2, rerun.out);
  assert.equal(br14(p), baseline + 2, 'the foreign write is audited');
  assert.ok(p.gate('prd').data.invalidation.changed.includes('spec/prd.txt'), 'the gate records the foreign write');
});

test("the stage's own repair write is not a second invalidation", t => {
  const {p, baseline} = staleManualRepair(t);
  const written = p.run(['--result', 'writer-2.txt']); assert.equal(written.code, 2, written.out); assert.match(written.out, /Manual reviewer pending/);
  assert.equal(p.run().code, 2);
  assert.equal(p.run().code, 2);
  assert.equal(br14(p), baseline + 1, 'repair output bytes the runtime recorded do not repeat the audit event');
  assert.ok(!p.gate('prd').data.invalidation.changed.includes('spec/prd.txt'));
});

test('a hand edit after the stage wrote its repair output is audited again', t => {
  const {p, baseline} = staleManualRepair(t);
  assert.equal(p.run(['--result', 'writer-2.txt']).code, 2);
  p.write('spec/prd.txt', 'Generated prd v2, then edited by hand\n');
  assert.equal(p.run().code, 2);
  assert.equal(br14(p), baseline + 2);
  assert.ok(p.gate('prd').data.invalidation.changed.includes('spec/prd.txt'));
});

const pins = {head: 'fixture-head', build: 'not-built'};
const read = (p, file) => JSON.parse(fs.readFileSync(path.join(p.root, file)));
const scopedFile = (p, def) => `${p.config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;

function approvedFixture(t) {
  const p = projectFixture(t);
  const defs = [17, 18, 19].map(number => {
    const output = `spec/scoped-${number}.txt`;
    const input = `source/scoped-${number}.txt`;
    p.write(output, `Independent output ${number}\n`);
    p.write(input, `Independent source ${number}\n`);
    const def = {...p.definitions.prd, id: `scope-${number}`, inputs: [input], outputs: [output],
      scope: {kind: 'ac', ids: [`US-${number}.AC-01`], revision: 'unbound'}};
    def.scope.revision = definitionRevision(def);
    p.write(`review/definitions/${def.id}/1.json`, def);
    p.config.gates.scoped_definitions.push({id: def.id, version: '1'});
    return def;
  });
  p.save();
  const initial = p.run(); assert.equal(initial.code, 2, initial.out);
  const aggregate = p.gate('prd');
  const template = read(p, `review/receipts/${aggregate.data.model.receipts[0]}.json`);
  const graph = {version: '1', complete: true, nodes: defs.flatMap(def => [
    {id: `ac:${def.scope.ids[0]}`, kind: 'ac', source: def.outputs[0], revision: '1'},
  ]), edges: []};
  certifiedFixtureGraph(p, graph, template, 'scoped-graph-census');
  aggregate.data.inputs[p.config.gates.graph] = sha256(fs.readFileSync(path.join(p.root, p.config.gates.graph)));
  writeGate(p.root, p.config, 'prd', 'PENDING', aggregate.data);
  for (const def of defs) {
    const file = scopedFile(p, def); const model = read(p, file);
    model.states.human = 'APPROVED'; model.decision = `fixture-po-${def.id}`; p.write(file, model);
  }
  p.approve('prd');
  const control = p.run(); assert.equal(control.code, 0, control.out);
  const registry = loadRegistries(p.root, p.config);
  assert.equal(passedGateEligible(p.root, p.config, registry, 'prd', {...p.gate('prd'), value: 'APPROVED'}, pins), true);
  return {p, defs, registry};
}


test('a foreign write to another scoped output while stale marks that scoped projection STALE', t => {
  const {p, defs, registry} = approvedFixture(t);
  const first = path.join(p.root, defs[0].outputs[0]); const bytes = fs.readFileSync(first); bytes[bytes.length - 2] ^= 1; fs.writeFileSync(first, bytes);
  const opened = invalidateGates(p.root, p.config, registry, pins);
  assert.equal(opened.impact?.complete, true); assert.deepEqual([...opened.invalidated], ['prd']);
  const untouched = read(p, scopedFile(p, defs[1]));
  assert.equal(untouched.states.freshness, 'CURRENT', 'unrelated scoped member stays current after the first invalidation');
  fs.writeFileSync(path.join(p.root, defs[1].outputs[0]), 'Foreign edit to a second scoped output\n');
  const result = invalidateGates(p.root, p.config, registry, pins);
  assert.deepEqual([...result.invalidated], ['prd']);
  const model = read(p, scopedFile(p, defs[1]));
  assert.equal(model.states.human, 'PENDING'); assert.equal(model.states.freshness, 'STALE'); assert.equal(model.decision, null);
  assert.ok(p.gate('prd').data.invalidation.changed.includes(defs[1].outputs[0]));
  assert.equal(read(p, scopedFile(p, defs[2])).states.freshness, 'CURRENT');
});

test("the stage's own bytes over a CURRENT scoped output stale that projection without a second audit event", t => {
  const {p, defs, registry} = approvedFixture(t);
  const first = path.join(p.root, defs[0].outputs[0]); const bytes = fs.readFileSync(first); bytes[bytes.length - 2] ^= 1; fs.writeFileSync(first, bytes);
  const opened = invalidateGates(p.root, p.config, registry, pins);
  assert.equal(opened.impact?.complete, true); assert.deepEqual([...opened.invalidated], ['prd']);
  assert.equal(read(p, scopedFile(p, defs[1])).states.freshness, 'CURRENT', 'second scoped projection is still current');
  // The stage's own writer run produced these bytes: its hash is recorded in the runtime state.
  const own = 'Second scoped output written by this stage\'s repair\n';
  fs.writeFileSync(path.join(p.root, defs[1].outputs[0]), own);
  const runtime = read(p, 'review/runtime/prd.json');
  runtime.written_outputs = {[defs[1].outputs[0]]: sha256(Buffer.from(own))};
  // The repair has started: the first foreign edit's bytes were recorded then.
  runtime.repair_entry = {key: 'fixture', foreign: {[defs[0].outputs[0]]: sha256(fs.readFileSync(first))}};
  p.write('review/runtime/prd.json', runtime);
  const auditBefore = fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8').split('\n').filter(Boolean).length;
  const again = invalidateGates(p.root, p.config, registry, pins);
  assert.deepEqual([...again.invalidated], ['prd']);
  assert.equal(fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8').split('\n').filter(Boolean).length, auditBefore, 'the stage\'s own write is not a new audit event');
  assert.ok(!p.gate('prd').data.invalidation.changed.includes(defs[1].outputs[0]), 'the gate invalidation itself was not rewritten');
  const model = read(p, scopedFile(p, defs[1]));
  assert.equal(model.states.freshness, 'STALE'); assert.equal(model.states.human, 'PENDING'); assert.equal(model.decision, null);
  for (const id of model.receipts) assert.equal(read(p, `review/freshness/${id}.json`).freshness, 'STALE');
  assert.equal(read(p, scopedFile(p, defs[2])).states.freshness, 'CURRENT');
});

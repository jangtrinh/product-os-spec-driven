import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {snapshot, put} from '../../../fixtures/runner/evidence-head-controls.mjs';
import {recordReceipt} from '../evidence-records.mjs';
import {auditEvents} from '../audit-store.mjs';

function receiptFixture(t) {
  const p = projectFixture(t); assert.equal(p.run().code, 2);
  const data = p.gate('prd').data;
  const read = file => JSON.parse(fs.readFileSync(path.join(p.root, file)));
  const target = read(`review/receipts/${data.model.receipts[0]}.json`);
  const candidate = {scope: data.model.scope, digest: data.model.candidate.manifest, pins: {...data.model.candidate, dirty: false}, manifest: read(`review/candidates/${data.model.candidate.manifest}.json`)};
  const state = read('review/runtime/prd.json');
  const args = [p.root, p.config, p.definitions.prd, candidate, data.context, ['spec/prd.txt'], state, data.review, state.last_evals, {supersedes: [{id: target.id, reason: 'Fresh independently reviewed observation on the same source bytes'}]}];
  return {p, target, args};
}
for (const [name, mutate] of [
  ['domain mismatch', ({p, target}) => {target.domain = 'concept'; put(p, target);}],
  ['rules mismatch', ({p, target}) => {target.pins.rules = 'other-rules'; put(p, target);}],
  ['source mismatch', ({p, target}) => {target.artifacts['input/po-spec.txt'] = 'a'.repeat(64); put(p, target);}],
  ['dangling target', ({args}) => {args[9].supersedes[0].id = 'missing-receipt';}],
  ['empty reason', ({args}) => {args[9].supersedes[0].reason = ' \t';}],
  ['self grading superseder', ({args}) => {args[2] = {...args[2], reviewer: 'dev'};}],
  ['non-independent superseder', ({args}) => {args[7] = {...args[7], independent: false};}],
  ['unexecuted superseder', ({args}) => {args[8] = [];}],
]) test(`receipt write rejects ${name} before immutable/audit mutation`, t => {
  const control = receiptFixture(t); mutate(control); const before = snapshot(control.p);
  assert.throws(() => recordReceipt(...control.args), error => error.code === 2);
  assert.deepEqual(snapshot(control.p), before);
});
test('receipt write accepts explicit retirement and audits both ids with millisecond timestamp', t => {
  const {p, target, args} = receiptFixture(t); const id = recordReceipt(...args);
  const receipt = JSON.parse(fs.readFileSync(path.join(p.root, `review/receipts/${id}.json`)));
  assert.equal(receipt.supersedes[0].id, target.id); assert.match(receipt.at, /\.\d{3}Z$/);
  assert.ok(auditEvents(p.root).some(event => event.type === 'eval' && event.refs.includes(id) && event.refs.includes(target.id)));
});

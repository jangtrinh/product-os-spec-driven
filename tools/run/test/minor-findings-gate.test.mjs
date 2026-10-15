import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {parseReview, reviewEligible} from '../review-results.mjs';
import {writeGate} from '../gate-files.mjs';

const finding = {id: 'F-01', criterion: 'source', severity: 'Minor', file: 'spec/prd.txt', line: 1, impact: 'Presentation gap', fix: 'Align wording', owner: 'dev', disposition: 'open', reason: 'Still open'};
const criteria = [{id: 'source', mandatory: true, score: 2, evidence: 'Source compared with output'}];
function fixture(t, max = 1, changes = {}) {
  const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'NEEDS_CHANGES', criteria, findings: [finding], ...changes}});
  p.config.review.max_rounds = max; p.save(); return p;
}
for (const max of [1, 3]) test(`open Minor reaches human gate through ${max === 1 ? 'cap' : 'no-edit repair'}`, t => {
  const p = fixture(t, max); const result = p.run();
  assert.equal(result.code, 2, result.out);
  assert.ok(fs.existsSync(path.join(p.root, 'review/gates/prd.md')), result.out);
  const gate = p.gate('prd'); assert.match(gate.raw, /^GATE: PENDING/);
  assert.match(gate.raw, /F-01.*spec\/prd.txt:1.*Presentation gap/);
  assert.match(gate.raw, /PO.*accepted-minor.*reason.*follow.up.*changes.requested/i);
  assert.equal(reviewEligible(gate.data.review, {approvers: p.config.roles.po.approvers}), false);
  assert.equal(gate.data.review.findings[0].disposition, 'open');
  const again = p.run(); assert.equal(again.code, 2); assert.match(again.out, /Waiting:/);
});
test('human gate accepts per-finding PO decision without rewriting reviewer receipt', async t => {
  const p = fixture(t); assert.equal(p.run().code, 2);
  assert.ok(fs.existsSync(path.join(p.root, 'review/gates/prd.md')));
  const {data} = p.gate('prd'); const receipt = path.join(p.root, `review/receipts/${data.model.receipts[0]}.json`);
  const before = fs.readFileSync(receipt);
  Object.assign(data.review.findings[0], {disposition: 'accepted-minor', accepted_by: 'po@example.test', reason: 'Presentation only', follow_up: 'Cleanup next release'});
  assert.equal(reviewEligible(data.review, {approvers: p.config.roles.po.approvers}), true);
  data.approval = {by: 'po@example.test', at: new Date().toISOString()}; data.model.states.human = 'APPROVED'; data.model.decision = 'po-minor-decision';
  writeGate(p.root, p.config, 'prd', 'APPROVED', data);
  const {poReviewForReceipt} = await import('../minor-decisions.mjs');
  const observed = JSON.parse(fs.readFileSync(receipt));
  assert.ok(poReviewForReceipt(observed, {value: 'APPROVED', data}, p.config.roles.po.approvers));
  const wrongScope = {value: 'APPROVED', data: {...data, model: {...data.model, scope: {...data.model.scope, ids: ['us']}}}};
  assert.equal(poReviewForReceipt(observed, wrongScope, p.config.roles.po.approvers), null);
  const result = p.run(); assert.equal(result.code, 0, result.out); assert.deepEqual(fs.readFileSync(receipt), before);
  data.review.findings[0].accepted_by = 'dev@example.test'; writeGate(p.root, p.config, 'prd', 'APPROVED', data);
  assert.equal(p.run().code, 2);
});
test('PO changes request re-enters writer with retained finding text', t => {
  const p = fixture(t, 3); const capture = path.join(p.root, 'writer-input.jsonl');
  p.config.agents.writer.command = command({capture}); p.save(); assert.equal(p.run().code, 2);
  assert.ok(fs.existsSync(path.join(p.root, 'review/gates/prd.md')));
  const {data} = p.gate('prd'); data.model.states.human = 'CHANGES_REQUESTED';
  data.change_requests.push({text: 'F-01 spec/prd.txt:1: align presentation', by: 'po@example.test', at: new Date().toISOString()});
  writeGate(p.root, p.config, 'prd', 'CHANGES_REQUESTED', data);
  const before = fs.readFileSync(capture, 'utf8').trim().split('\n').length;
  assert.equal(p.run().code, 2);
  const rows = fs.readFileSync(capture, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(rows.length > before); assert.match(rows[before].input, /F-01 spec\/prd.txt:1: align presentation/);
});
for (const [name, changes] of [
  ['Major', {findings: [{...finding, severity: 'Major'}]}],
  ['mandatory score 1', {criteria: [{...criteria[0], score: 1}]}],
  ['FAIL', {verdict: 'FAIL', criteria: [{...criteria[0], score: 0}]}],
  ['BLOCKED', {verdict: 'BLOCKED'}], ['NOT_RUN', {verdict: 'NOT_RUN'}],
]) test(`${name} keeps the stop without a gate`, t => {
  const p = fixture(t, 1, changes); assert.equal(p.run().code, 2);
  assert.equal(fs.existsSync(path.join(p.root, 'review/gates/prd.md')), false);
});
test('non-independent Minor review cannot reach the Minor decision gate', t => {
  const p = fixture(t); p.config.agents.reviewer.command = 'manual'; p.save(); assert.equal(p.run().code, 2);
  p.write('review-answer.txt', `VERDICT: NEEDS_CHANGES\n\`\`\`review-data\n${JSON.stringify({criteria, findings: [finding]})}\n\`\`\`\n`);
  assert.equal(p.run(['--result', 'review-answer.txt']).code, 2);
  assert.equal(fs.existsSync(path.join(p.root, 'review/gates/prd.md')), false);
});
test('agent-supplied PO acceptance is retained only as an open finding', () => {
  const forged = {...finding, disposition: 'accepted-minor', accepted_by: 'po@example.test', follow_up: 'Later'};
  const result = parseReview(`VERDICT: NEEDS_CHANGES\n\`\`\`review-data\n${JSON.stringify({criteria, findings: [forged]})}\n\`\`\`\n`, true);
  assert.equal(reviewEligible(result, {approvers: ['po@example.test']}), false);
  assert.equal(result.findings[0].disposition, 'open'); assert.equal(Object.hasOwn(result.findings[0], 'accepted_by'), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';

test('US-SD0901.AC-01: agents accept runnable CLI commands or manual', t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2);
  const q = projectFixture(t); q.config.agents.writer.command = 'manual'; q.save(); const r = q.run();
  assert.equal(r.code, 2, r.out); assert.match(r.out, /Manual writer/);
});
test('US-SD0901.AC-02: shared agent command creates a fresh reviewer with source/AC/output only', t => {
  const p = projectFixture(t); p.config.agents.reviewer.command = p.config.agents.writer.command; p.save();
  const r = p.run(); assert.equal(r.code, 2, r.out);
  const log = fs.readFileSync(path.join(p.root, 'review/log/prd-review-1.txt'), 'utf8');
  assert.match(log, /PID: \d+/); assert.equal(p.gate('prd').data.review.independent, true);
});
test('US-SD0901.AC-03: manual prints prompt and resumes nonempty matching --result', t => {
  const p = projectFixture(t); p.config.agents.writer.command = 'manual'; p.save();
  const first = p.run(); assert.equal(first.code, 2, first.out); assert.match(first.out, /Original source and AC/);
  p.write('answer.txt', 'Generated prd\n'); const resumed = p.run(['--result', 'answer.txt']);
  assert.equal(resumed.code, 2, resumed.out); assert.match(p.gate('prd').raw, /^GATE: PENDING/);
});
test('US-SD0901.AC-04: manual self-review discloses unmet independence and remains PENDING', t => {
  const p = projectFixture(t); p.config.roles.po.enabled = false; p.config.agents.reviewer.command = 'manual'; p.save();
  assert.equal(p.run().code, 2);
  p.write('review-answer.txt', 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"original source"}],"findings":[]}\n```\n');
  const r = p.run(['--result', 'review-answer.txt']); assert.equal(r.code, 2, r.out);
  assert.match(p.gate('prd').raw, /review independent: no/); assert.equal(p.gate('prd').data.model.states.human, 'PENDING');
});
test('US-SD0901.AC-05: agent command missing is exit 4', t => {
  const p = projectFixture(t); p.config.agents.writer.command = 'absent-spec-driven-executable'; p.save();
  const r = p.run(); assert.equal(r.code, 4, r.out); assert.match(r.out, /not runnable/);
});
test('US-SD0902.AC-01: writer receives only its declared context and prompt', t => {
  const p = projectFixture(t); p.write('private-chat.txt', 'NEVER INCLUDE PRIVATE HISTORY');
  const capture = path.join(p.root, 'writer-input.jsonl'); p.config.agents.writer.command = command({capture}); p.save();
  const r = p.run(); assert.equal(r.code, 2, r.out);
  const input = JSON.parse(fs.readFileSync(capture, 'utf8').split('\n')[0]).input;
  assert.match(input, /Original source and AC/); assert.doesNotMatch(input, /NEVER INCLUDE PRIVATE HISTORY/);
  assert.doesNotMatch(input, /Every mandatory criterion must score 2/);
});
test('US-SD0902.AC-02: absent output from disabled stage skipped and recorded', t => {
  const p = projectFixture(t, ['tdd']); p.config.stages.tdd.context.push('spec/ux/design.md'); p.save();
  const r = p.run(); assert.equal(r.code, 0, r.out); assert.doesNotMatch(p.gate('tdd').raw, /spec\/ux\/design.md.*[a-f0-9]{64}/);
  assert.match(fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8'), /skipped disabled outputs: spec\/ux\/design.md/);
});
test('US-SD0902.AC-03: absent required context is exit 3 naming file', t => {
  const p = projectFixture(t); p.config.stages.prd.context.push('missing-source.txt'); p.save();
  const r = p.run(); assert.equal(r.code, 3, r.out); assert.match(r.out, /missing-source.txt/);
});
test('manual checkpoint rejects changed input, empty file and wrong phase', t => {
  const p = projectFixture(t); p.config.agents.writer.command = 'manual'; p.save(); assert.equal(p.run().code, 2);
  p.write('answer.txt', 'Generated prd\n'); p.write('input/po-spec.txt', 'Changed source');
  const changed = p.run(['--result', 'answer.txt']); assert.equal(changed.code, 3, changed.out); assert.match(changed.out, /does not match/);
});
test('reviewer mutation fails closed and leaves original artifact unchanged', t => {
  const p = projectFixture(t); p.config.agents.reviewer.command = command({mutate: 'spec/prd.txt'}); p.save();
  const r = p.run(); assert.equal(r.code, 4, r.out); assert.match(r.out, /mutated/);
  assert.equal(fs.readFileSync(path.join(p.root, 'spec/prd.txt'), 'utf8'), 'Generated prd\n');
});
test('manual reviewer resumes after writer updates a context file and still sees original source', t => {
  const p = projectFixture(t, ['clarify']); p.definitions.clarify.outputs = ['input/po-spec.txt'];
  p.config.agents.writer.command = 'manual'; p.config.agents.reviewer.command = 'manual';
  p.config.evals.clarify = [{run: command({eval: true}), per_file: 'input/po-spec.txt'}]; p.save();
  p.write('writer-answer.txt', 'Generated clarify\n');
  const first = p.run(['--paste', 'writer-answer.txt']); assert.equal(first.code, 2, first.out);
  assert.match(first.out, /Original source and AC outcomes/); assert.match(first.out, /Generated clarify/);
  assert.match(first.out.slice(first.out.indexOf('READ-ONLY INDEPENDENT REVIEW')), /Original source and AC outcomes/);
  p.write('review-answer.txt', 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"Original source compared with final output"}],"findings":[]}\n```\n');
  const second = p.run(['--result', 'review-answer.txt', '--independent-review']); assert.equal(second.code, 2, second.out);
  assert.equal(p.gate('clarify').data.review.independent, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/clarify.json'), 'utf8')).rounds.review, 1);
});

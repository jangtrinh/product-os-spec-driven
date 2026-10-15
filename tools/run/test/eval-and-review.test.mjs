import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';

test('US-SD0501.AC-01: eval repair caps persist across restart and stop at exit 2', t => {
  const p = projectFixture(t, ['prd'], {writer: {text: 'defect\n'}});
  p.config.limits.max_fix_rounds = 2; p.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/prd.txt'}]; p.save();
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.match(r.out, /cap exhausted/);
  const state = JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8'));
  assert.equal(state.rounds.eval_fix, 2); const again = p.run(); assert.equal(again.code, 2, again.out);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8')).rounds.eval_fix, 2);
});
test('US-SD0501.AC-02: reviewer VERDICT parsed and scores must agree', t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2); assert.equal(p.gate('prd').data.review.verdict, 'PASS');
  const q = projectFixture(t, ['prd'], {reviewer: {verdict: 'PASS', criteria: [{id: 'source', mandatory: true, score: 0, evidence: 'source'}]}});
  const r = q.run(); assert.equal(r.code, 4, r.out); assert.match(r.out, /contradicts/);
});
test('US-SD0501.AC-03: finding disposition and reason retained in review log', t => {
  const finding = {id: 'source-finding', criterion: 'source', severity: 'Minor', file: 'spec/prd.txt', line: 1, impact: 'small presentation gap', fix: 'align wording', owner: 'dev', disposition: 'accepted-minor', reason: 'PO accepts presentation only', accepted_by: 'po@example.test', follow_up: 'Track presentation cleanup'};
  const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'NEEDS_CHANGES', criteria: [{id: 'source', mandatory: true, score: 2, evidence: 'source'}], findings: [finding]}});
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.equal(p.gate('prd').data.review.findings[0].reason, finding.reason);
  assert.match(fs.readFileSync(path.join(p.root, 'review/log/prd-review-1.txt'), 'utf8'), /PO accepts presentation only/);
});
test('US-SD0501.AC-04: final FAIL with no edits stops 2 and never creates a gate', t => {
  const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'FAIL'}});
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.match(r.out, /final FAIL, no edits/);
  assert.equal(fs.existsSync(path.join(p.root, 'review/gates/prd.md')), false);
});
test('US-SD0501.AC-05: disabled review explicitly recorded', t => {
  const p = projectFixture(t); p.config.review.enabled = false; p.save(); const r = p.run();
  assert.equal(r.code, 2, r.out); assert.match(p.gate('prd').raw, /review disabled/); assert.equal(p.gate('prd').data.review.verdict, null);
});
test('US-SD0501.AC-06: actual eval exits recorded; unavailable tool is not PASS', t => {
  const p = projectFixture(t); p.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/*.txt'}]; p.save();
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.equal(p.gate('prd').data.evals[0].exit_code, 0);
  const q = projectFixture(t); q.config.evals.prd = [{run: 'absent-evaluator'}]; q.save(); const failure = q.run(); assert.equal(failure.code, 4, failure.out);
});
test('repair reruns eval before a fresh review of final bytes', t => {
  const p = projectFixture(t, ['prd'], {writer: {badUntilFix: true}}); p.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/*.txt'}]; p.save();
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.deepEqual(p.gate('prd').data.evals.map(e => e.exit_code), [1, 0]);
  assert.equal(p.gate('prd').data.model.rounds.eval_fix, 1); assert.equal(p.gate('prd').data.model.rounds.review, 1);
});
test('all NA review is NOT_RUN and cannot create a passing gate', t => {
  const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'NOT_RUN', criteria: [{id: 'source', mandatory: true, applicability: 'na', score: null, evidence: 'source', reason: 'No applicable source', confirmer: 'po'}]}});
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.equal(fs.existsSync(path.join(p.root, 'review/gates/prd.md')), false);
});
test('timeout is exit 4; empty per_file is exit 3; neither consumes behavioral fix round', t => {
  const p = projectFixture(t, ['prd'], {writer: {delay: 1000}}); const r = p.run(['--timeout-ms', '25']); assert.equal(r.code, 4, r.out);
  const q = projectFixture(t); q.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/missing-*.txt'}]; q.save(); const empty = q.run();
  assert.equal(empty.code, 3, empty.out); assert.equal(JSON.parse(fs.readFileSync(path.join(q.root, 'review/runtime/prd.json'), 'utf8')).rounds.eval_fix, 0);
});

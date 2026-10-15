import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {appendAudit} from '../audit-store.mjs';

// Repair re-entry is keyed on the invalidation that opened it: a new cause (pins, config, changed paths)
// while a review is in flight must go back to repair instead of settling on a review that never saw it.
const REVIEW = 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"original source compared with final output"}],"findings":[]}\n```\n';
const state = p => JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8'));
const writerCalls = capture => fs.existsSync(capture) ? fs.readFileSync(capture, 'utf8').split('\n').filter(Boolean).length : 0;

// Command writer, manual reviewer; settled, approved, then the source is edited so the next run repairs.
function staleReviewInFlight(t) {
  const p = projectFixture(t, ['prd'], {});
  const capture = path.join(p.root, 'writer-calls.jsonl');
  p.config.agents.writer.command = command({capture});
  p.config.agents.reviewer.command = 'manual'; p.save();
  p.write('review.txt', REVIEW);
  assert.equal(p.run().code, 2);
  assert.equal(p.run(['--result', 'review.txt', '--independent-review']).code, 2);
  p.approve('prd');
  p.write('input/po-spec.txt', 'Original source and AC outcomes. Edited by PO.\n');
  const repaired = p.run(); assert.equal(repaired.code, 2, repaired.out); assert.match(repaired.out, /Manual reviewer pending/);
  return {p, capture};
}

test('a new --build while a manual review waits after stale repair returns to repair instead of settling', t => {
  const {p, capture} = staleReviewInFlight(t);
  const before = {calls: writerCalls(capture), fix: state(p).rounds.eval_fix};
  assert.equal(before.calls, 2, 'initial write plus the stale-source repair');
  const rerun = p.run(['--build', 'build-2']); assert.equal(rerun.code, 2, rerun.out);
  assert.equal(state(p).rounds.eval_fix, before.fix + 1, 'a new candidate pin is a new invalidation: one more repair round');
  assert.equal(writerCalls(capture), before.calls + 1);
  assert.match(rerun.out, /Manual reviewer pending/);
  const again = p.run(['--build', 'build-2']);
  assert.equal(state(p).rounds.eval_fix, before.fix + 1, 'the same pin again does not re-enter repair');
  assert.equal(writerCalls(capture), before.calls + 1, again.out);
  const settled = p.run(['--build', 'build-2', '--result', 'review.txt', '--independent-review']); assert.equal(settled.code, 2, settled.out);
  assert.equal(p.gate('prd').data.model.candidate.build, 'build-2');
  assert.equal(p.gate('prd').data.invalidation, null);
});

test('a changed effective config while a manual review waits returns to repair', t => {
  const {p, capture} = staleReviewInFlight(t);
  const before = {calls: writerCalls(capture), fix: state(p).rounds.eval_fix};
  p.config.limits.max_fix_rounds = 4; p.save();
  const rerun = p.run(); assert.equal(rerun.code, 2, rerun.out);
  assert.equal(state(p).rounds.eval_fix, before.fix + 1);
  assert.equal(writerCalls(capture), before.calls + 1);
});

test('--supersedes on the first re-entry does not hide a later invalidation from repair', t => {
  const p = projectFixture(t, ['prd'], {});
  const capture = path.join(p.root, 'writer-calls.jsonl');
  p.config.agents.writer.command = command({capture});
  p.config.agents.reviewer.command = 'manual'; p.save();
  p.write('review.txt', REVIEW);
  assert.equal(p.run().code, 2);
  assert.equal(p.run(['--result', 'review.txt', '--independent-review']).code, 2);
  const receipt = p.gate('prd').data.model.receipts[0];
  // A PO-authorised backward transition reopens the gate; the re-observation retires the receipt instead of repairing.
  const record = {id: 'transition-prd', kind: 'backward', opener: 'qc', at: new Date().toISOString(), source: 'Expected outcome changed', reason: 'Return expected-result change to source AC and PO', from: {stage: 'tdd', scope: p.definitions.prd.scope, revision: 'before'}, to: {stage: 'prd', scope: p.definitions.prd.scope, revision: 'after'}, impact: [{node: 'ac:US-16.AC-01', domain: 'spec', classification: 'direct', reason: 'Expected outcome', path: ['ac:US-16.AC-01']}], authority: 'po', decision: null, regates: ['gate-prd']};
  const event = appendAudit(p.root, {type: 'decision', scope: record.to.scope, actor: 'po@example.test', refs: [record.id], reason: 'PO authorizes changed AC'});
  record.decision = event.id; p.write('transition.json', record);
  const retire = ['--stage', 'prd', '--transition', 'transition.json'];
  const superseded = p.run([...retire, '--supersedes', receipt, '--reason', 'Independent re-observation on identical bytes', '--independent-review']);
  assert.equal(superseded.code, 2, superseded.out); assert.match(superseded.out, /Manual reviewer pending/);
  const before = {calls: writerCalls(capture), fix: state(p).rounds.eval_fix};
  assert.equal(before.fix, 0, 'the retirement run repaired nothing');
  assert.equal(state(p).repair_entry, undefined, 'a run that skipped repair must not record that repair was entered');
  // The same transition applied again without --supersedes re-opens the gate with an identical invalidation
  // and identical gate bytes: only the "repair never started" record separates it from the first run.
  const later = p.run(retire); assert.equal(later.code, 2, later.out);
  assert.equal(state(p).rounds.eval_fix, before.fix + 1, 'the reopened gate must now be repaired');
  assert.equal(writerCalls(capture), before.calls + 1);
  assert.equal(p.run(retire).code, 2);
  assert.equal(state(p).rounds.eval_fix, before.fix + 1, 'the same cause again does not repair twice');
});

// A hand edit to a declared output is a foreign cause while the writer has not yet written. Once the repair
// output becomes the stage's own write that path leaves the foreign set; it is still the same cause.
test('a hand-edited declared output stays one cause after the repair write becomes an own write', t => {
  const p = projectFixture(t, ['prd']);
  p.config.agents.writer.command = 'manual'; p.config.agents.reviewer.command = 'manual'; p.save();
  p.write('writer-1.txt', 'Generated prd v1\n'); p.write('writer-2.txt', 'Generated prd v2\n'); p.write('review.txt', REVIEW);
  assert.equal(p.run().code, 2);
  assert.equal(p.run(['--result', 'writer-1.txt']).code, 2);
  assert.equal(p.run(['--result', 'review.txt', '--independent-review']).code, 2);
  p.approve('prd');
  p.write('spec/prd.txt', 'Hand edit by someone other than the stage writer\n');
  const opened = p.run(); assert.equal(opened.code, 2, opened.out); assert.match(opened.out, /Manual writer pending/);
  const afterOpen = state(p).rounds.eval_fix;
  const written = p.run(['--result', 'writer-2.txt']); assert.equal(written.code, 2, written.out); assert.match(written.out, /Manual reviewer pending/);
  assert.equal(state(p).rounds.eval_fix, afterOpen + 1, 'the repair round is spent once, by the writer result');
  const reviewed = p.run(['--result', 'review.txt', '--independent-review']);
  assert.doesNotMatch(reviewed.out, /does not match the pending/, reviewed.out);
  assert.match(reviewed.out, /prd: GATE: PENDING/, reviewed.out);
  assert.equal(state(p).rounds.eval_fix, afterOpen + 1, 'submitting the review must not spend another fix round');
});

// Cause identity is content based: a path counts as already known only while its bytes are still the bytes
// recorded when the repair started, or the bytes this stage's own writer produced.
const br14 = p => fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8').split('\n').filter(line => line.includes('BR-14 fallback')).length;
function approvedManual(t) {
  const p = projectFixture(t, ['prd']);
  p.config.agents.writer.command = 'manual'; p.config.agents.reviewer.command = 'manual'; p.save();
  for (const [i, text] of ['v1', 'v2', 'v3'].entries()) p.write(`writer-${i + 1}.txt`, `Generated prd ${text}\n`);
  p.write('review.txt', REVIEW);
  assert.equal(p.run().code, 2);
  assert.equal(p.run(['--result', 'writer-1.txt']).code, 2);
  assert.equal(p.run(['--result', 'review.txt', '--independent-review']).code, 2);
  p.approve('prd');
  return p;
}

test('a second hand edit after the stage wrote its repair is a new cause: audited and repaired once more', t => {
  const p = approvedManual(t);
  p.write('spec/prd.txt', 'H2 hand edit\n');
  assert.equal(p.run().code, 2);
  const start = state(p).rounds.eval_fix;
  const written = p.run(['--result', 'writer-2.txt']); assert.match(written.out, /Manual reviewer pending/, written.out);
  assert.equal(state(p).rounds.eval_fix, start + 1);
  const events = br14(p);
  p.write('spec/prd.txt', 'H4 second hand edit after the writer\n');
  const again = p.run(); assert.equal(again.code, 2, again.out);
  assert.equal(br14(p), events + 1, 'the new bytes are a new invalidation event');
  assert.match(again.out, /Manual writer pending/, 'repair is entered again');
  const rewritten = p.run(['--result', 'writer-3.txt']); assert.match(rewritten.out, /Manual reviewer pending/, rewritten.out);
  assert.equal(state(p).rounds.eval_fix, start + 2, 'exactly one more repair round');
  const reviewed = p.run(['--result', 'review.txt', '--independent-review']);
  assert.match(reviewed.out, /prd: GATE: PENDING/, reviewed.out);
  assert.equal(state(p).rounds.eval_fix, start + 2, 'the review does not spend another round');
  assert.match(fs.readFileSync(path.join(p.root, 'spec/prd.txt'), 'utf8'), /v3/, 'the review settled the writer output, not the hand edit');
});

test('editing the foreign path again before the writer runs is one new cause and charges one round', t => {
  const p = approvedManual(t);
  p.write('spec/prd.txt', 'H2 hand edit\n');
  const first = p.run(); assert.match(first.out, /Manual writer pending/, first.out);
  const start = state(p).rounds.eval_fix; const events = br14(p);
  p.write('spec/prd.txt', "H2' edited again before the writer ran\n");
  const again = p.run(); assert.equal(again.code, 2, again.out); assert.match(again.out, /Manual writer pending/, again.out);
  assert.equal(br14(p), events + 1, 'the second edit is a new invalidation event');
  assert.equal(state(p).rounds.eval_fix, start, 'waiting for the writer charges nothing');
  const unchanged = p.run(); assert.match(unchanged.out, /Manual writer pending/, unchanged.out);
  assert.equal(br14(p), events + 1, 'the same bytes again are not another event');
  const written = p.run(['--result', 'writer-2.txt']); assert.match(written.out, /Manual reviewer pending/, written.out);
  assert.equal(state(p).rounds.eval_fix, start + 1, 'one round for the whole second cause');
  const reviewed = p.run(['--result', 'review.txt', '--independent-review']);
  assert.match(reviewed.out, /prd: GATE: PENDING/, reviewed.out);
  assert.equal(state(p).rounds.eval_fix, start + 1);
});

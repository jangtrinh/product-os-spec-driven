import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sharedLedgerProject, INTAKE_DOC, LEDGER} from '../../../fixtures/runner/shared-ledger-project.mjs';

const REVIEW = 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"original source compared with final output"}],"findings":[]}\n```\n';
const transitions = p => path.join(p.root, 'review/transitions');
const runtime = (p, stage) => JSON.parse(fs.readFileSync(path.join(p.root, `review/runtime/${stage}.json`), 'utf8'));
const rounds = (p, stage) => runtime(p, stage).rounds;
const settle = (p, extra = []) => p.run(['--result', 'review.txt', '--independent-review', ...extra]);
const reopenNotes = p => p.audit().filter(e => e.type === 'change' && e.refs[0] === 'intake' && /recorded amendment/.test(e.reason));

// Command writers, manual reviewers. intake is approved; clarify's writer has edited intake's document and waits on its reviewer.
function clarifyAwaitingReviewer(t) {
  const p = sharedLedgerProject(t, {amend: true}); p.mode({amend: true});
  p.config.agents.reviewer.command = 'manual'; p.save(); p.write('review.txt', REVIEW);
  assert.match(p.run().out, /Manual reviewer pending: review\/manual\/intake\.json/);
  assert.equal(settle(p).code, 2); assert.equal(p.state('intake'), 'PENDING');
  assert.equal(p.decide('intake').code, 0);
  const waiting = p.run(); assert.equal(waiting.code, 2, waiting.out);
  assert.match(waiting.out, /Manual reviewer pending: review\/manual\/clarify\.json/, waiting.out);
  assert.equal(p.state('intake'), 'APPROVED');
  return p;
}

test('(a) manual reviewer: the amending stage settles first, then the next run reopens the amended stage and the PO ratifies', t => {
  const p = clarifyAwaitingReviewer(t);
  const intakeBefore = rounds(p, 'intake');
  const edit = p.audit().find(e => e.type === 'change' && e.refs.join() === [INTAKE_DOC, 'clarify', 'edit', 'amends:intake'].join());
  assert.ok(edit, 'the clarify writer edit of intake is recorded as an amendment');

  // The reviewer result reaches the stage that owns the checkpoint; intake is untouched while clarify is mid-flight.
  const reviewed = settle(p);
  assert.equal(reviewed.code, 2, reviewed.out); assert.doesNotMatch(reviewed.out, /does not match the pending/, reviewed.out);
  assert.match(reviewed.out, /clarify: GATE: PENDING/, reviewed.out);
  assert.equal(p.state('clarify'), 'PENDING'); assert.equal(p.state('intake'), 'APPROVED');
  assert.deepEqual(rounds(p, 'intake'), intakeBefore, 'no intake round was spent');
  assert.equal(reopenNotes(p).length, 0, 'intake is not reopened before clarify settled');

  // Once clarify settled, the next run reopens intake with the amendment named; intake runs and waits on its own reviewer.
  const reopened = p.run(); assert.equal(reopened.code, 2, reopened.out);
  assert.match(reopened.out, /Manual reviewer pending: review\/manual\/intake\.json/, reopened.out);
  assert.equal(p.state('intake'), 'PENDING');
  assert.match(reopenNotes(p)[0]?.reason ?? '', new RegExp(`recorded amendment: clarify edited ${INTAKE_DOC} \\(audit ${edit.id}\\)`));
  assert.equal(rounds(p, 'intake').eval_fix, intakeBefore.eval_fix + 1, 'exactly one intake repair round, spent when intake actually ran');
  assert.match(fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8'), /answered by po@example\.test/, 'intake re-run kept the amendment');

  // The intake reviewer result is accepted, and the PO approval of the reopened gate seals the amendment.
  assert.equal(settle(p).code, 2); assert.equal(p.state('intake'), 'PENDING');
  const approved = p.decide('intake'); assert.equal(approved.code, 0, approved.out);
  const record = JSON.parse(fs.readFileSync(path.join(transitions(p), `amend-${edit.id}.json`), 'utf8'));
  assert.equal(record.decision, p.gate('intake').data.model.decision);
  assert.deepEqual(p.audit().find(e => e.type === 'transition').refs, [record.id, record.decision]);

  // clarify owes its re-run; with the amendment sealed, it settles and the project completes.
  assert.match(p.run().out, /Manual reviewer pending: review\/manual\/clarify\.json/);
  assert.equal(settle(p).code, 2); assert.equal(p.decide('clarify').code, 0);
  const done = p.run(); assert.equal(done.code, 0, done.out);
  assert.deepEqual([p.state('intake'), p.state('clarify')], ['APPROVED', 'APPROVED']);
  assert.equal(fs.readdirSync(transitions(p)).length, 1);
});

test('(e) the PO approves clarify straight after its reviewer result, then intake reopens and the amendment is ratified', t => {
  const p = clarifyAwaitingReviewer(t);
  const edit = p.audit().find(e => e.type === 'change' && e.refs.join() === [INTAKE_DOC, 'clarify', 'edit', 'amends:intake'].join());
  assert.equal(settle(p).code, 2); assert.equal(p.state('clarify'), 'PENDING');
  const approved = p.decide('clarify'); assert.equal(approved.code, 0, approved.out);
  assert.equal(p.state('clarify'), 'APPROVED'); assert.equal(p.state('intake'), 'APPROVED');

  const reopened = p.run(); assert.equal(reopened.code, 2, reopened.out);
  assert.match(reopened.out, /Manual reviewer pending: review\/manual\/intake\.json/, reopened.out);
  assert.equal(p.state('intake'), 'PENDING'); assert.match(reopenNotes(p)[0]?.reason ?? '', new RegExp(`audit ${edit.id}`));
  assert.equal(settle(p).code, 2);
  const sealed = p.decide('intake'); assert.equal(sealed.code, 0, sealed.out);
  assert.equal(JSON.parse(fs.readFileSync(path.join(transitions(p), `amend-${edit.id}.json`), 'utf8')).decision, p.gate('intake').data.model.decision);
  assert.match(p.run().out, /Manual reviewer pending: review\/manual\/clarify\.json/);
  assert.equal(settle(p).code, 2); assert.equal(p.decide('clarify').code, 0);
  const done = p.run(); assert.equal(done.code, 0, done.out);
  assert.deepEqual([p.state('intake'), p.state('clarify')], ['APPROVED', 'APPROVED']);
});

test('(b) command reviewer: the amendment reopens the amended stage on the next run, as before', t => {
  const p = sharedLedgerProject(t, {amend: true}); p.mode({amend: true});
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  const second = p.run(); assert.equal(second.code, 2, second.out);
  assert.equal(p.state('clarify'), 'PENDING'); assert.equal(p.state('intake'), 'APPROVED', 'same-invocation settle does not reopen intake');
  assert.equal(reopenNotes(p).length, 0);
  const third = p.run(); assert.equal(third.code, 2, third.out);
  assert.equal(p.state('intake'), 'PENDING'); assert.equal(reopenNotes(p).length, 1);
  assert.match(fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8'), /answered by po@example\.test/);
});

test('(c) a --result that the next stage to run does not own is refused with exit 3 and spends no round', t => {
  const p = clarifyAwaitingReviewer(t);
  const before = {intake: rounds(p, 'intake'), clarify: rounds(p, 'clarify')};
  p.write('input/po-spec.txt', 'Original source and AC outcomes. Edited by PO.\n');   // reopens intake, which now runs before clarify
  const r = settle(p);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /review\/manual\/clarify\.json/); assert.match(r.out, /clarify/); assert.match(r.out, /intake/);
  assert.deepEqual(rounds(p, 'intake'), before.intake); assert.deepEqual(rounds(p, 'clarify'), before.clarify);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, 'review/manual/clarify.json'), 'utf8')).result, null, 'the checkpoint is still pending');
});

test('(d) manual writer and manual reviewer: the reviewer result reaches the amending stage, then intake reopens', t => {
  const p = sharedLedgerProject(t, {amend: true});
  p.config.agents.writer.command = 'manual'; p.config.agents.reviewer.command = 'manual'; p.save(); p.write('review.txt', REVIEW);
  const files = body => '```files\n' + JSON.stringify(body) + '\n```\n';
  const intakeDoc = 'Saved filters intake\nSource of Q-001: unclassified\n'; const amended = intakeDoc.replace('unclassified', 'answered by po@example.test');
  const ledger1 = '# Decisions\n| D-01 | Saved filters belong to one user |\n'; const ledger2 = `${ledger1}| D-02 | Shared filter links expire after 7 days |\n`;
  p.write('intake-writer.txt', files({[INTAKE_DOC]: intakeDoc, [LEDGER]: ledger1})); p.write('clarify-writer.txt', files({[LEDGER]: ledger2, [INTAKE_DOC]: amended}));
  assert.match(p.run().out, /Manual writer pending/);
  assert.match(p.run(['--result', 'intake-writer.txt']).out, /Manual reviewer pending/);
  assert.equal(settle(p).code, 2); assert.equal(p.decide('intake').code, 0);
  assert.match(p.run().out, /Manual writer pending: review\/manual\/clarify\.json/);
  const written = p.run(['--result', 'clarify-writer.txt']); assert.match(written.out, /Manual reviewer pending: review\/manual\/clarify\.json/, written.out);
  assert.equal(p.state('intake'), 'APPROVED');
  const intakeBefore = rounds(p, 'intake');
  const reviewed = settle(p); assert.equal(reviewed.code, 2, reviewed.out);
  assert.doesNotMatch(reviewed.out, /does not match the pending/, reviewed.out);
  assert.equal(p.state('clarify'), 'PENDING'); assert.equal(p.state('intake'), 'APPROVED'); assert.deepEqual(rounds(p, 'intake'), intakeBefore);
  const reopened = p.run(); assert.equal(reopened.code, 2, reopened.out);
  assert.equal(p.state('intake'), 'PENDING'); assert.equal(reopenNotes(p).length, 1);
  assert.match(reopened.out, /Manual writer pending: review\/manual\/intake\.json/, reopened.out);
});

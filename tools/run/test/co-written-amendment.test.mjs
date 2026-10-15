import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sharedLedgerProject, LEDGER, INTAKE_DOC} from '../../../fixtures/runner/shared-ledger-project.mjs';

const transitions = p => path.join(p.root, 'review/transitions');

test('(f) clarify editing intake text is a recorded amendment that intake keeps and the PO ratifies', t => {
  const p = sharedLedgerProject(t, {amend: true}); p.mode({amend: true});
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  const original = fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8');
  const second = p.run(); assert.equal(second.code, 2, second.out); assert.equal(p.state('clarify'), 'PENDING');

  // The edit is witnessed, the replaced text stays recoverable, and the PO has not yet been asked.
  const edit = p.audit().find(e => e.type === 'change' && e.refs.join() === [INTAKE_DOC, 'clarify', 'edit', 'amends:intake'].join());
  assert.ok(edit, 'amendment event naming the amended stage');
  assert.equal(fs.readFileSync(path.join(p.root, `review/co-written/${edit.before}.txt`), 'utf8'), original);
  const proposed = JSON.parse(fs.readFileSync(path.join(transitions(p), `amend-${edit.id}.json`), 'utf8'));
  assert.equal(proposed.decision, null, 'a proposal authorizes nothing: authority comes from the PO decision, never from the runner');
  assert.deepEqual([proposed.kind, proposed.authority, proposed.from.stage, proposed.to.stage], ['backward', 'po', 'clarify', 'intake']);
  assert.equal(p.audit().some(e => e.type === 'transition'), false);
  assert.equal(p.decide('clarify').code, 0);

  // G1 reopens with the amendment named; intake re-runs and receives the amended file through the request text.
  const third = p.run(); assert.equal(third.code, 2, third.out); assert.equal(p.state('intake'), 'PENDING');
  const reopened = p.audit().find(e => e.type === 'change' && e.refs[0] === 'intake' && /recorded amendment/.test(e.reason));
  assert.match(reopened?.reason ?? '', new RegExp(`recorded amendment: clarify edited ${INTAKE_DOC} \\(audit ${edit.id}\\)`));
  assert.match(fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8'), /answered by po@example\.test/, 'intake re-run kept the amendment');
  assert.match(p.ledger(), /D-01[\s\S]*D-02/, 'intake re-run kept the appended row');

  // The PO approval of the reopened gate is the authority row; it fills in and registers the transition record.
  const approved = p.decide('intake'); assert.equal(approved.code, 0, approved.out);
  assert.equal(p.state('intake'), 'APPROVED');
  const [file, ...rest] = fs.readdirSync(transitions(p)); assert.deepEqual(rest, []);
  const record = JSON.parse(fs.readFileSync(path.join(transitions(p), file), 'utf8'));
  assert.equal(record.id, `amend-${edit.id}`); assert.equal(record.kind, 'backward'); assert.equal(record.authority, 'po');
  assert.deepEqual([record.from.stage, record.to.stage, record.source], ['clarify', 'intake', edit.id]);
  assert.equal(record.decision, p.gate('intake').data.model.decision);
  const events = p.audit();
  const decision = events.find(e => e.id === record.decision);
  assert.equal(decision.type, 'decision'); assert.equal(decision.actor, 'po@example.test'); assert.ok(decision.refs.includes(record.id));
  const registered = events.find(e => e.type === 'transition'); assert.deepEqual(registered.refs, [record.id, record.decision]);
  assert.match(fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8'), /answered by po@example\.test/);
  // The dependent clarify gate was reopened with it and owes its re-run; it must not wait undecidable.
  const rerun = p.run(); assert.equal(rerun.code, 2, rerun.out); assert.equal(p.state('clarify'), 'PENDING');
  assert.equal(p.decide('clarify').code, 0);
  const done = p.run(); assert.equal(done.code, 0, done.out);
  assert.deepEqual([p.state('intake'), p.state('clarify')], ['APPROVED', 'APPROVED']);
  // Nothing is left open: no second transition was recorded.
  assert.equal(fs.readdirSync(transitions(p)).length, 1);
});

test('an amendment is not recorded when the later stage only appends', t => {
  const p = sharedLedgerProject(t, {amend: true});
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  assert.equal(p.run().code, 2); assert.equal(p.decide('clarify').code, 0);
  const r = p.run();
  assert.equal(p.state('intake'), 'APPROVED', r.out); assert.equal(r.code, 0, r.out);
  assert.ok(!p.audit().some(e => e.refs.some(ref => ref.startsWith('amends:'))));
  assert.match(p.ledger(), /D-02/); assert.equal(fs.existsSync(transitions(p)), false);
  assert.match(fs.readFileSync(path.join(p.root, LEDGER), 'utf8'), /D-01/);
});

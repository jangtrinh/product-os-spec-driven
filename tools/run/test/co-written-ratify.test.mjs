import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sharedLedgerProject, INTAKE_DOC} from '../../../fixtures/runner/shared-ledger-project.mjs';

const transitions = p => path.join(p.root, 'review/transitions');
const records = p => (fs.existsSync(transitions(p)) ? fs.readdirSync(transitions(p)) : []);
const writeDoc = (p, text) => fs.writeFileSync(path.join(p.root, INTAKE_DOC), text);

// intake approved, clarify amended the intake document and was approved, the next run reopened and re-ran intake.
function reopened(t, mode = {amend: true}, setup = () => {}) {
  const p = sharedLedgerProject(t, {amend: true}); setup(p); p.mode(mode);
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  assert.equal(p.run().code, 2); assert.equal(p.decide('clarify').code, 0);
  return p;
}

test('approving the reopened stage after its re-run reverted the amendment is refused and the proposal stays open', t => {
  const p = reopened(t);
  p.mode({amend: true, revertAmend: true});                       // the re-run of intake emits the pre-amendment bytes
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.equal(p.state('intake'), 'PENDING');
  const refused = p.decide('intake');
  assert.equal(refused.code, 3, refused.out);
  assert.match(refused.out, /cannot ratify amendment event-[\w-]+ of spec\/intake\.txt: the amended bytes .* are no longer in the file/);
  assert.equal(p.state('intake'), 'PENDING');
  assert.equal(p.audit().some(e => e.type === 'transition'), false);
  const [file] = records(p); assert.equal(JSON.parse(fs.readFileSync(path.join(transitions(p), file), 'utf8')).decision, null);
});

test('approval is refused when the gate under approval records different bytes than the amended file', t => {
  const p = reopened(t);
  assert.equal(p.run().code, 2); assert.equal(p.state('intake'), 'PENDING');
  const gate = p.gate('intake'); gate.data.outputs[INTAKE_DOC] = 'a'.repeat(64);
  fs.writeFileSync(path.join(p.root, 'review/gates/intake.md'), p.gate('intake').raw.replace(/```gate-data\n[\s\S]*?\n```/, () => '```gate-data\n' + JSON.stringify(gate.data) + '\n```'));
  const refused = p.decide('intake'); assert.equal(refused.code, 3, refused.out);
  assert.equal(p.audit().some(e => e.type === 'transition'), false);
});

test('two edits in one clarify run: only the latest is sealed, the older one is superseded and recorded', t => {
  const p = sharedLedgerProject(t, {amend: true});
  p.config.evals.clarify = [{run: p.config.evals.intake[0].run.replace('spec/intake.txt', INTAKE_DOC)}]; p.save();
  p.mode({twoEdits: true});
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  assert.equal(p.run().code, 2); assert.equal(p.decide('clarify').code, 0);
  const edits = p.audit().filter(e => e.refs[0] === INTAKE_DOC && e.refs[2] === 'edit'); assert.equal(edits.length, 2);
  assert.equal(records(p).length, 2, 'both proposals were written when the edits happened');
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  assert.deepEqual(records(p), [`amend-${edits[1].id}.json`]);
  const transition = p.audit().filter(e => e.type === 'transition'); assert.equal(transition.length, 1); assert.equal(transition[0].refs[0], `amend-${edits[1].id}`);
  const superseded = p.audit().find(e => e.refs[0] === `amend-${edits[0].id}`);
  assert.match(superseded.reason, /superseded by a later edit of the same file/); assert.deepEqual(superseded.refs, [`amend-${edits[0].id}`, `superseded-by:amend-${edits[1].id}`]);
  assert.match(fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8'), /answered final/);
});

test('a re-run of the amended stage that drops a ratified amendment fails with exit 3 and writes nothing', t => {
  const p = reopened(t, {amend: true}, q => { q.write('input/intake-notes.txt', 'notes\n'); q.config.stages.intake.context.push('input/intake-notes.txt'); q.save(); });
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);                    // amendment ratified
  assert.equal(p.run().code, 2); assert.equal(p.decide('clarify').code, 0);
  assert.equal(p.run().code, 0);
  const record = records(p)[0].replace(/\.json$/, '');
  const amended = fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8'); assert.match(amended, /answered by po@example\.test/);
  p.mode({amend: true, revertAmend: true});
  p.write('input/intake-notes.txt', 'notes, revised\n');
  const r = p.run();
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, new RegExp(`PO-approved amendment ${record} to spec/intake\\.txt was dropped`));
  assert.match(r.out, /not materialized/);
  assert.equal(fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8'), amended, 'previous bytes stay');
});

test('a re-run that keeps the ratified amendment and adds lines is accepted', t => {
  const p = reopened(t, {amend: true}, q => { q.write('input/intake-notes.txt', 'notes\n'); q.config.stages.intake.context.push('input/intake-notes.txt'); q.save(); });
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  assert.equal(p.run().code, 2); assert.equal(p.decide('clarify').code, 0);
  assert.equal(p.run().code, 0);
  writeDoc(p, `${fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8')}Intake note added by hand.\n`);   // hand edit reopens intake; its re-run carries the file
  p.write('input/intake-notes.txt', 'notes, revised\n');
  const r = p.run(); assert.equal(r.code, 2, r.out);
  assert.match(fs.readFileSync(path.join(p.root, INTAKE_DOC), 'utf8'), /answered by po@example\.test/);
});

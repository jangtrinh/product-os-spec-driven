import test from 'node:test';
import assert from 'node:assert/strict';
import { lintSpec } from '../index.mjs';
import { plant } from '../self-test.mjs';

const FILE = 'assets/records/transitions/repair-1.json';
function seeded(mutate, check) { const f = plant(t => t.json(FILE, mutate)); try { check(lintSpec(f.root, f.options)); } finally { f.cleanup(); } }
const transition = r => r.problems.list.filter(p => p.code === 'Q-TRANSITION');

test('a backward PO proposal with no decision yet is an open item (warning), not an error', () => seeded(j => { j.kind = 'backward'; j.authority = 'po'; j.decision = null; }, r => {
  const rows = transition(r);
  assert.deepEqual(rows.map(p => p.severity), ['warning'], JSON.stringify(rows));
  assert.match(rows[0].message, /open backward re-entry proposal/);
  assert.equal(r.problems.errors.some(p => p.code === 'Q-TRANSITION'), false);
}));

test('a sealed backward record (PO decision recorded) passes the existing checks', () => seeded(j => { j.kind = 'backward'; j.authority = 'po'; j.decision = 'D1'; }, r => {
  assert.deepEqual(transition(r), [], JSON.stringify(transition(r)));
}));

test('a backward record with no decision and no re-gates is still an error', () => seeded(j => { j.kind = 'backward'; j.decision = null; j.regates = []; }, r => {
  const rows = transition(r); assert.ok(rows.length >= 1 && rows.every(p => p.severity === 'error'), JSON.stringify(rows));
}));

test('a backward proposal that is not PO authority is still an error', () => seeded(j => { j.kind = 'backward'; j.authority = 'dev'; j.decision = null; }, r => {
  const rows = transition(r); assert.ok(rows.length >= 1 && rows.every(p => p.severity === 'error'), JSON.stringify(rows));
}));

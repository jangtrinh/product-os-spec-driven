import test from 'node:test';
import assert from 'node:assert/strict';
import {amendmentControls, absentVersionHeads, changedMemberHeads} from '../../../fixtures/runner/amendment-controls.mjs';
import {snapshot, put, witness} from '../../../fixtures/runner/evidence-head-controls.mjs';

for (const [name, setup] of amendmentControls) test(`${name} fails closed before mutation and restored control passes`, t => {
  const {p, red, restore, green} = setup(t); const before = snapshot(p);
  const rejected = red(); assert.equal(rejected.code, 2, rejected.out); assert.deepEqual(snapshot(p), before);
  restore(); const accepted = green(); assert.equal(accepted.code, 0, accepted.out);
});
for (const pin of ['evaluator', 'rules']) {
  test(`absent ${pin} pin keeps different review versions as two eligible heads`, t => {
    const {p, original, other, heads} = absentVersionHeads(t, pin); const selected = heads();
    assert.equal(selected.eligible, true, selected.reason); assert.deepEqual(new Set(selected.heads.map(row => row.id)), new Set([original.id, other.id]));
    p.rebuildBatch();
    assert.equal(p.importBatch().code, 0);
  });
  test(`absent ${pin} pin cannot launder review-version drift through supersession`, t => {
    const {p, original, other} = absentVersionHeads(t, pin); other.supersedes = [{id: original.id, reason: 'Cannot retire another evaluator key'}]; put(p, other); witness(p, other);
    const before = snapshot(p); const rejected = p.importBatch(); assert.equal(rejected.code, 2, rejected.out); assert.deepEqual(snapshot(p), before);
    delete other.supersedes; put(p, other); p.rebuildBatch(); assert.equal(p.importBatch().code, 0);
  });
}
test('a changed member retires its whole prior receipt before validating a retained member revision', t => {
  const {p, old, fresh, heads} = changedMemberHeads(t); const before = snapshot(p); const selected = heads();
  assert.equal(selected.eligible, true, selected.reason); assert.deepEqual(selected.heads.map(row => row.id), [fresh.id]);
  assert.equal(old.execution.result, 'FAIL'); assert.deepEqual(snapshot(p), before);
});

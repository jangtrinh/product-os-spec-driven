import test from 'node:test';
import assert from 'node:assert/strict';
import {headControls, headFixture, snapshot, failed, superseder, put, witness} from '../../../fixtures/runner/evidence-head-controls.mjs';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';

for (const [name, mutate] of headControls) test(`current evidence rejects ${name} without mutation; reverted field accepts`, t => {
  const embeddedOnly = name === 'embedded-only supersession';
  const {p, green} = headFixture(t, mutate, {embeddedOnly}); const before = snapshot(p);
  const red = p.importBatch(); assert.equal(red.code, embeddedOnly ? 3 : 2, red.out);
  assert.deepEqual(snapshot(p), before);
  green(); const good = p.importBatch(); assert.equal(good.code, 0, good.out);
});
test('two current PASS heads remain eligible without implicit retirement', t => {
  const p = batchFixture(t); const r = structuredClone(p.packet.evidence[0]); r.id = 'second-pass'; put(p, r);
  p.rebuildBatch();
  const result = p.importBatch(); assert.equal(result.code, 0, result.out);
});
test('explicit independently witnessed retirement accepts despite older superseder clock', t => {
  const p = batchFixture(t); put(p, failed(p)); const r = superseder(p); r.at = '1999-01-01T00:00:00.000Z'; put(p, r); witness(p, r);
  p.rebuildBatch();
  const result = p.importBatch(); assert.equal(result.code, 0, result.out);
});
test('retired receipts outgoing cycle is inert when a current witness explicitly names both', t => {
  const p = batchFixture(t); const a = superseder(p, 'inactive-b', 'inactive-a'); const b = superseder(p, 'inactive-a', 'inactive-b'); put(p, a); put(p, b);
  const c = superseder(p, a.id, 'current-root'); c.supersedes.push({id: b.id, reason: 'Explicit retirement of both contradicted historical branches'}); put(p, c); witness(p, c);
  p.rebuildBatch();
  const result = p.importBatch(); assert.equal(result.code, 0, result.out);
});

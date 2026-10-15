import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {snapshot} from '../../../fixtures/runner/evidence-head-controls.mjs';

for (const resident of [true, false]) test(`original source inputs are required for ${resident ? 'stored' : 'embedded'} import evidence`, t => {
  const p = batchFixture(t);
  p.packet.evidence[0].review.inputs = ['evidence/check.txt'];
  if (resident) {p.write('review/receipts/fixture-receipt.json', p.packet.evidence[0]); p.rebuildBatch();}
  else fs.unlinkSync(path.join(p.root, 'review/receipts/fixture-receipt.json'));
  p.saveBatch();
  const before = snapshot(p);
  const result = p.importBatch();
  assert.equal(result.code, resident ? 2 : 3, result.out);
  assert.deepEqual(snapshot(p), before);
  p.packet.evidence[0].review.inputs = Object.keys(p.packet.membership.members[0].artifacts);
  p.write('review/receipts/fixture-receipt.json', p.packet.evidence[0]);
  p.rebuildBatch();
  const green = p.importBatch();
  assert.equal(green.code, 0, green.out);
});

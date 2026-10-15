import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {loadEvidence, selectHeads} from '../evidence-heads.mjs';
import {currentFor} from '../receipt-keys.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {hashes, sha256} from '../../lib/config/path-selection.mjs';

function reviewedReceipt(t) {
  const p = projectFixture(t);
  const result = p.run();
  assert.equal(result.code, 2, result.out);
  const data = p.gate('prd').data;
  const context = loadEvidence(p.root, p.config);
  const receipt = context.records.get(data.model.receipts[0]);
  const manifest = JSON.parse(fs.readFileSync(path.join(p.root, `review/candidates/${receipt.pins.manifest}.json`)));
  const query = {member: manifest.members[0], pins: receipt.pins, domain: 'spec', reviewRequired: true};
  assert.equal(currentFor(context, receipt, query), true);
  assert.equal(selectHeads(context, query).eligible, true);
  return {p, context, receipt, query};
}
test('reviewer receipt pin covers the complete composed instruction files', t => {
  const {p, receipt} = reviewedReceipt(t);
  assert.equal(receipt.pins.prompt, sha256(canonical(hashes(p.root, ['prompts/_common.md', 'prompts/reviewer.md']))));
});
for (const file of ['prompts/_common.md', 'prompts/reviewer.md', 'rules/review-rubric.txt']) {
  test(`changed ${file} makes the reviewed receipt stale and ineligible; restoring bytes recovers`, t => {
    const {p, context, receipt, query} = reviewedReceipt(t);
    const before = fs.readFileSync(path.join(p.root, file), 'utf8');
    p.write(file, `${before}\nChanged review policy.\n`);
    assert.equal(currentFor(context, receipt, query), false);
    assert.equal(selectHeads(context, query).eligible, false);
    p.write(file, before);
    assert.equal(currentFor(context, receipt, query), true);
    assert.equal(selectHeads(context, query).eligible, true);
  });
}
test('unrelated file changes leave the reviewed receipt current and eligible', t => {
  const {p, context, receipt, query} = reviewedReceipt(t);
  p.write('unrelated-notes.txt', 'Unrelated local notes.\n');
  assert.equal(currentFor(context, receipt, query), true);
  assert.equal(selectHeads(context, query).eligible, true);
});

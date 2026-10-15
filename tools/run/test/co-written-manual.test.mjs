import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedLedgerProject, LEDGER, INTAKE_DOC} from '../../../fixtures/runner/shared-ledger-project.mjs';

const REVIEW = 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"original source compared with final output"}],"findings":[]}\n```\n';
const rows = {intake: '| D-01 | Saved filters belong to one user |', clarify: '| D-02 | Shared filter links expire after 7 days |'};

// Manual mode binds each pending step to the exact prompt text, which now carries the shared bytes.
test('manual writer and reviewer: a later stage appends the shared ledger and the earlier gate stays APPROVED', t => {
  const p = sharedLedgerProject(t);
  p.config.agents.writer.command = 'manual'; p.config.agents.reviewer.command = 'manual'; p.save();
  const ledger1 = `# Decisions\n${rows.intake}\n`; const ledger2 = `${ledger1}${rows.clarify}\n`;
  p.write('intake-writer.txt', '```files\n' + JSON.stringify({[INTAKE_DOC]: 'Saved filters intake\n', [LEDGER]: ledger1}) + '\n```\n');
  p.write('clarify-writer.txt', ledger2); p.write('review.txt', REVIEW);

  assert.match(p.run().out, /Manual writer pending/);
  assert.match(p.run(['--result', 'intake-writer.txt']).out, /Manual reviewer pending/);
  assert.equal(p.run(['--result', 'review.txt', '--independent-review']).code, 2); assert.equal(p.state('intake'), 'PENDING');
  assert.equal(p.decide('intake').code, 0);

  const pending = p.run(); assert.match(pending.out, /Manual writer pending/, pending.out);
  assert.match(pending.out, /--- CO-WRITTEN FILE: spec\/decisions\.txt ---\n# Decisions\n\| D-01 \|/, 'the prompt shows the owner bytes');
  const written = p.run(['--result', 'clarify-writer.txt']); assert.match(written.out, /Manual reviewer pending/, written.out);
  assert.doesNotMatch(written.out, /does not match the pending/);
  const reviewed = p.run(['--result', 'review.txt', '--independent-review']);
  assert.equal(reviewed.code, 2, reviewed.out); assert.doesNotMatch(reviewed.out, /does not match the pending/);
  assert.equal(p.state('clarify'), 'PENDING'); assert.equal(p.state('intake'), 'APPROVED');
  assert.equal(p.decide('clarify').code, 0);
  const done = p.run(); assert.equal(done.code, 0, done.out); assert.equal(p.state('intake'), 'APPROVED');
});

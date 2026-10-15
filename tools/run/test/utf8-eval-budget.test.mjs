import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {currentEvalEvidence} from '../current-eval-evidence.mjs';

for (const text of ['界'.repeat(5000), '😀'.repeat(3750), 'a界😀'.repeat(2000)]) test('Unicode eval excerpts respect per-log and total encoded budgets', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-unicode-eval-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const results = Array.from({length: 5}, (_, i) => {
    const report = `${i}.txt`; fs.writeFileSync(path.join(root, report), text);
    return {command: `eval-${i}`, exit_code: 0, report};
  });
  const rows = JSON.parse(currentEvalEvidence(root, results).trim().split('\n').at(-1));
  assert.ok(rows.every(row => Buffer.byteLength(row.excerpt) <= 2000));
  assert.ok(rows.reduce((n, row) => n + Buffer.byteLength(row.excerpt), 0) <= 8000);
  assert.ok(rows.every(row => !row.excerpt.includes('\uFFFD') && text.startsWith(row.excerpt)));
  assert.ok(rows.every(row => row.truncated && row.bytes === Buffer.byteLength(text) && row.sha256.length === 64));
});

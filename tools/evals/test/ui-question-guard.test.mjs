import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runEvalSuite} from '../run-evals.mjs';

test('ui-feature rejects an automatically settled unanswered question', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-ui-question-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const cases = path.join(root, 'cases');
  fs.cpSync('evals/cases/ui-feature', path.join(cases, 'ui-feature'), {recursive: true});
  const prd = path.join(cases, 'ui-feature/candidate/prd/PRD.md');
  fs.appendFileSync(prd, '\nThe unanswered question is settled automatically.\n');

  const {result, exit} = await runEvalSuite({
    fake: true,
    cases: ['ui-feature'],
    casesRoot: cases,
    results: path.join(root, 'results'),
  });
  const row = result.cases[0];
  assert.equal(exit, 1);
  assert.equal(row.expected.status, 'FAIL');
  assert.ok(row.expected.rows.some(item => item.text === 'The unanswered question is settled automatically.' && !item.passed));
  assert.equal(row.quality.status, 'BLOCKED');
});

import {STAGES} from '../../lib/config/config-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runEvalSuite} from '../run-evals.mjs';
import {observe, nodeCommand} from '../process-observation.mjs';
import {checkExpected, loadExpected} from '../expected-checks.mjs';
import {resultDiff} from '../result-accounting.mjs';

function options(t) {
  const results = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-results-'));
  t.after(() => fs.rmSync(results, {recursive: true, force: true}));
  return {fake: true, cases: ['baseline'], results};
}
test('baseline content harness records real checks with model/browser NOT_RUN', async t => {
  const o = options(t); const {result, exit} = await runEvalSuite(o);
  assert.equal(exit, 0); assert.equal(result.cases[0].status, 'PASS');
  assert.equal(result.cases[0].review.status, 'NOT_RUN');
  assert.equal(result.cases[0].browser.status, 'NOT_RUN');
  assert.equal(result.coverage.quality_ac.passed, 0);
  assert.ok(result.cases[0].coverage.ac.ids.length > 0);
  assert.ok(result.cases[0].commands.every(row => row.command && row.cwd && row.exit === 0));
  assert.ok(result.cases[0].red_controls.every(row => row.status === 'PASS'));
  assert.ok(fs.existsSync(result.result_path));
  const again = await runEvalSuite(o);
  assert.equal(again.exit, 0); assert.equal(again.result.diff.previous, result.result_path);
  assert.deepEqual(again.result.diff.new_findings, []);
});
test('planted unmet expected item makes case and CLI result red', async t => {
  const o = options(t); const copy = path.join(o.results, 'cases');
  fs.cpSync('evals/cases/baseline', path.join(copy, 'baseline'), {recursive: true});
  const file = path.join(copy, 'baseline/expected.md');
  const data = loadExpected(file); data.must_have.push({file: 'prd/prd.md', text: 'PLANTED_UNMET_REQUIREMENT'});
  fs.writeFileSync(file, `\`\`\`eval-expectations\n${JSON.stringify(data)}\n\`\`\`\n`);
  const {result, exit} = await runEvalSuite({...o, casesRoot: copy});
  assert.equal(exit, 1); assert.equal(result.cases[0].expected.status, 'FAIL');
  assert.ok(result.findings.some(row => row.includes('must_have')));
});
test('missing, failing and empty child observations cannot become PASS', async () => {
  const missing = await observe('absent-eval-child-command', process.cwd());
  assert.equal(missing.status, 'BLOCKED'); assert.equal(missing.exit, null);
  const failed = await observe(nodeCommand('-e', 'console.log("failed control");process.exit(7)'), process.cwd());
  assert.equal(failed.status, 'FAIL'); assert.equal(failed.exit, 7);
  const empty = await observe(nodeCommand('-e', 'process.exit(0)'), process.cwd());
  assert.equal(empty.status, 'BLOCKED'); assert.equal(empty.exit, 0);
});
test('expected checks cannot borrow another case files or pass on unreadable forbidden text', t => {
  const o = options(t); const a = path.join(o.results, 'case-a'), b = path.join(o.results, 'case-b');
  fs.mkdirSync(a); fs.mkdirSync(b); fs.writeFileSync(path.join(a, 'candidate.txt'), 'first case marker');
  fs.writeFileSync(path.join(b, 'candidate.txt'), 'second case marker');
  const data = {must_have: [{file: 'candidate.txt', text: 'first case marker'}], must_not_have: []};
  assert.equal(checkExpected(a, data).status, 'PASS'); assert.equal(checkExpected(b, data).status, 'FAIL');
  assert.equal(checkExpected(b, {must_have: [], must_not_have: [{file: 'missing.txt', text: 'forbidden'}]}).status, 'FAIL');
  assert.equal(checkExpected(b, {must_have: [{file: '../case-a/candidate.txt', text: 'first case marker'}]}).status, 'FAIL');
});
test('unconfigured agent preserves manual pending and never reports harness PASS', async t => {
  const {result, exit} = await runEvalSuite({...options(t), fake: false});
  assert.equal(exit, 2); assert.equal(result.cases[0].status, 'BLOCKED');
  assert.equal(result.cases[0].review.status, 'NOT_RUN');
});
test('missing configured agent persists failure result instead of losing the case', async t => {
  const {result, exit} = await runEvalSuite({...options(t), fake: false, agent: 'absent-eval-agent'});
  assert.equal(exit, 1); assert.equal(result.cases[0].status, 'BLOCKED');
  assert.equal(result.cases[0].commands[0].exit, 4);
  assert.deepEqual(result.cases[0].coverage.ac.ids,Array.from({length:6},(_,i)=>`US-01.AC-0${i+1}`));
  assert.equal(result.cases[0].coverage.quality_ac.denominator,6);
  assert.equal(result.coverage.quality_ac.denominator,6);
});
test('narrowed selection does not declare an omitted failed case resolved', () => {
  const before = {findings:['ui-feature: BLOCKED'],cases:[{id:'ui-feature',status:'BLOCKED'}],pins:{}};
  const after = {findings:[],cases:[{id:'baseline',status:'PASS'}],pins:{}};
  const diff = resultDiff(before,after);
  assert.deepEqual(diff.resolved_findings,[]);
  assert.deepEqual(diff.not_rechecked,['ui-feature']);
});
test('passing G4 refusal assertion preserves raw exit 2, pending UIUX and blocked quality', async t => {
  const {result,exit} = await runEvalSuite({...options(t),cases:['ui-feature']});
  assert.equal(exit,0);
  const row=result.cases[0];
  assert.equal(row.harness.status,'PASS'); assert.equal(row.status,'BLOCKED');
  assert.equal(row.pipeline.exit,2); assert.equal(row.pipeline.completed,false);
  assert.equal(row.quality.status,'BLOCKED'); assert.equal(row.review.status,'NOT_RUN');
  assert.equal(row.browser.status,'NOT_RUN'); assert.equal(row.coverage.scope.total,STAGES.length);
  assert.equal(result.coverage.cases.passed,0); assert.equal(result.coverage.harness_cases.passed,1);
  assert.equal(result.coverage.quality_ac.passed,0);
});
test('expected G4 refusal cannot hide a planted content failure', async t => {
  const o=options(t), copy=path.join(o.results,'cases');
  fs.cpSync('evals/cases/ui-feature',path.join(copy,'ui-feature'),{recursive:true});
  const file=path.join(copy,'ui-feature/expected.md'), data=loadExpected(file);
  data.must_have.push({file:'prd/PRD.md',text:'PLANTED_UI_CONTENT_FAILURE'});
  fs.writeFileSync(file,`\`\`\`eval-expectations\n${JSON.stringify(data)}\n\`\`\`\n`);
  const {result,exit}=await runEvalSuite({...o,cases:['ui-feature'],casesRoot:copy});
  assert.equal(exit,1); assert.equal(result.cases[0].harness.status,'FAIL');
  assert.equal(result.cases[0].pipeline.exit,2);
});

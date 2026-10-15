import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';

const result = 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"Source and current eval"}],"findings":[]}\n```\n';
for (const repair of [false, true]) test(`reviewer sees current eval bytes in prompt and fresh cwd${repair ? ' after repair' : ''}`, t => {
  const p = projectFixture(t, ['prd'], {writer: {badUntilFix: repair}});
  const capture = path.join(p.root, 'reviewer-input.json');
  p.write('evaluator.mjs', "import fs from 'node:fs';const bad=fs.readFileSync('spec/prd.txt','utf8').includes('defect');console.log(bad?'STALE-EVAL errors: 1 warnings: 0':'CURRENT-EVAL errors: 0 warnings: 2');process.exit(bad?1:0);");
  p.write('reviewer.mjs', `import fs from 'node:fs';const input=fs.readFileSync(0,'utf8');const log=/\"report\":\"([^\"]+)\"/.exec(input)?.[1];fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({input,log:log&&fs.readFileSync(log,'utf8')}));process.stdout.write(${JSON.stringify(result)});`);
  p.config.evals.prd = [{run: `${JSON.stringify(process.execPath)} evaluator.mjs`}];
  p.config.agents.reviewer.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(p.root, 'reviewer.mjs'))}`; p.save();
  const run = p.run(); assert.equal(run.code, 2, run.out);
  const observed = JSON.parse(fs.readFileSync(capture, 'utf8'));
  assert.match(observed.input, /RUNNER-OBSERVED CURRENT STAGE EVAL/);
  assert.match(observed.input, /CURRENT-EVAL/); assert.doesNotMatch(observed.input, /STALE-EVAL/);
  assert.match(observed.input, /"exit_code":0/); assert.match(observed.input, /"errors":0/); assert.match(observed.input, /"warnings":2/);
  assert.match(observed.log, /CURRENT-EVAL/);
  assert.ok(observed.input.trimEnd().split('\n').length <= 120);
});

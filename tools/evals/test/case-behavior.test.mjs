import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runEvalSuite} from '../run-evals.mjs';
import {observe, nodeCommand} from '../process-observation.mjs';

const cases = ['complete-scope-graph','incomplete-scope-graph','stale-semantic-propagation','repair-cap','role-toggle-manual','prototype-first','batch-packet','receiver-switch'];
test('selected control cases execute their required operations on their own pipeline project', async t => {
  const results=fs.mkdtempSync(path.join(os.tmpdir(),'eval-behavior-'));
  t.after(()=>fs.rmSync(results,{recursive:true,force:true}));
  const {result,exit}=await runEvalSuite({fake:true,cases,results});
  assert.equal(exit,0,JSON.stringify(result.findings));
  for(const row of result.cases) {
    assert.equal(row.behavior.status,'PASS',JSON.stringify(row.behavior));
    assert.equal(row.behavior.project.root,row.commands[0].cwd);
    assert.equal(row.behavior.project.case_id,row.id);
    assert.equal(row.behavior.project.source_sha256,row.pins.source);
    assert.ok(row.behavior.operations.length>=2);
    assert.ok(row.behavior.observations.length>=2);
    assert.ok(row.behavior.observations.every(item=>item.passed));
    assert.notDeepEqual(row.behavior.before,row.behavior.after);
    assert.equal(row.quality.status,'NOT_RUN');
  }
});
test('disabled or substituted required behavior refuses in the actual CLI', async t => {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eval-behavior-refusal-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const directory=path.join(temp,'cases/complete-scope-graph');
  fs.cpSync('evals/cases/complete-scope-graph',directory,{recursive:true});
  const meta=JSON.parse(fs.readFileSync(path.join(directory,'case.json')));
  for(const behavior of [null,'delivery']) {
    fs.writeFileSync(path.join(directory,'case.json'),JSON.stringify({...meta,behavior}));
    const r=await observe(nodeCommand('tools/evals/run-evals.mjs','--fake','--cases-root',path.join(temp,'cases'),'--case',meta.name,'--results',path.join(temp,'results')),process.cwd());
    assert.equal(r.exit,1,r.stdout+r.stderr);
    const result=JSON.parse(fs.readFileSync(r.stdout.trim().split('; ').at(-1)));
    assert.match(result.findings.join('\n'),/required behavior/i);
    assert.equal(result.coverage.harness_cases.passed,0);
    assert.equal(result.cases[0].pipeline.completed,true);
    assert.equal(result.coverage.cases.passed,1,'behavior refusal cannot erase actual pipeline completion');
  }
});

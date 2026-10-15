import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runEvalSuite} from '../run-evals.mjs';

const ac={baseline:Array.from({length:6},(_,i)=>`US-01.AC-0${i+1}`),'ui-feature':['US-01.AC-01','US-01.AC-02','US-02.AC-01','US-03.AC-01','US-03.AC-02']};
const scn={baseline:Array.from({length:6},(_,i)=>`US-01.SCN-01-0${i+1}`),'ui-feature':['US-01.SCN-01-01','US-01.SCN-01-02','US-02.SCN-02-01','US-03.SCN-03-01','US-03.SCN-03-02']};
test('blocked and unverified members retain exact independent per-case and suite denominators',async t=>{
  const results=fs.mkdtempSync(path.join(os.tmpdir(),'eval-denominators-'));
  t.after(()=>fs.rmSync(results,{recursive:true,force:true}));
  const {result,exit}=await runEvalSuite({fake:true,cases:['baseline','ui-feature'],results});
  assert.equal(exit,0);
  for(const row of result.cases) {
    assert.deepEqual(row.coverage.ac.ids,ac[row.id]);
    assert.deepEqual(row.coverage.scenarios.items.map(item=>item.id),scn[row.id]);
    assert.equal(row.coverage.ac.total,ac[row.id].length);
    assert.equal(row.coverage.ac.selected,ac[row.id].length);
    assert.equal(row.coverage.scenarios.total,scn[row.id].length);
    assert.equal(row.coverage.scenarios.selected,scn[row.id].length);
    assert.equal(row.coverage.quality_ac.denominator,ac[row.id].length);
    assert.deepEqual(row.coverage.quality_ac.passed_ids,[]);
  }
  assert.equal(result.coverage.quality_ac.denominator,11);
  assert.equal(result.coverage.cases.selected,2);
  assert.equal(result.coverage.cases.passed,1);
  const ui=result.cases.find(row=>row.id==='ui-feature');
  assert.equal(ui.quality.status,'BLOCKED');
  assert.equal(ui.pipeline.exit,2);
  assert.equal(ui.gates.find(row=>row.stage==='uiux').states.human,'PENDING');
  assert.equal(ui.browser.status,'NOT_RUN');
});
test('unreadable selected candidate membership is UNKNOWN rather than a zero denominator',async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eval-unknown-membership-'));
  t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
  const casesRoot=path.join(temp,'cases');
  fs.cpSync('evals/cases/baseline',path.join(casesRoot,'baseline'),{recursive:true});
  fs.rmSync(path.join(casesRoot,'baseline/candidate'),{recursive:true});
  const {result,exit}=await runEvalSuite({fake:true,cases:['baseline'],casesRoot,results:path.join(temp,'results')});
  assert.equal(exit,1);
  assert.equal(result.cases[0].status,'BLOCKED');
  assert.equal(result.cases[0].coverage.status,'UNKNOWN');
  assert.equal(result.coverage.quality_ac.denominator,null);
  assert.equal(result.execution_inputs.cases.baseline.candidate,null);
});

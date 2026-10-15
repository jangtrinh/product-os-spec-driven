import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runEvalSuite} from '../run-evals.mjs';
import {observe,nodeCommand} from '../process-observation.mjs';

function setup(t,defaultRoot=false) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eval-input-pins-'));
  const name=defaultRoot?`test-freshness-${process.pid}`:'baseline';
  const casesRoot=defaultRoot?path.resolve('evals/cases'):path.join(temp,'cases');
  const directory=path.join(casesRoot,name);
  fs.cpSync('evals/cases/baseline',directory,{recursive:true});
  const file=path.join(directory,'case.json');
  fs.writeFileSync(file,JSON.stringify({...JSON.parse(fs.readFileSync(file)),name}));
  t.after(()=>{fs.rmSync(directory,{recursive:true,force:true});fs.rmSync(temp,{recursive:true,force:true});});
  return {temp,directory,name,casesRoot,options:{fake:true,cases:[name],results:path.join(temp,'results'),...(defaultRoot?{}:{casesRoot})}};
}
function mutator(p,target,mode) {
  const script=path.join(p.temp,'mutator.mjs'), marker=path.join(p.temp,'mutated');
  fs.rmSync(marker,{force:true});
  fs.writeFileSync(script,`import fs from 'node:fs'; const input=fs.readFileSync(0,'utf8');
if(!fs.existsSync(${JSON.stringify(marker)})){fs.writeFileSync(${JSON.stringify(marker)},'once');${mode==='delete'?`fs.unlinkSync(${JSON.stringify(target)});`:`fs.appendFileSync(${JSON.stringify(target)},'\\nchanged selected input\\n');`}}
process.stdout.write(input.includes('READ-ONLY INDEPENDENT REVIEW')?'VERDICT: PASS\\n\`\`\`review-data\\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"local control only"}],"findings":[]}\\n\`\`\`\\n':'Observed deterministic control\\n');`);
  return nodeCommand(script);
}
for(const defaultRoot of [false,true]) test(`${defaultRoot?'default':'external'} selected inputs are pinned before use and changed/deleted inputs fail stale`,async t=>{
  const p=setup(t,defaultRoot);
  const initial=await runEvalSuite(p.options);
  assert.equal(initial.exit,0);
  assert.equal(initial.result.execution_inputs.cases_root,fs.realpathSync(p.casesRoot));
  assert.ok(initial.result.execution_inputs.cases[p.name]['candidate/us/US-01.md']);
  const source=path.join(p.directory,'po-spec.md'),sourceBytes=fs.readFileSync(source);
  try {
    fs.unlinkSync(source);
    const missing=await runEvalSuite(p.options);
    assert.equal(missing.exit,1);
    assert.equal(missing.result.cases[0].status,'BLOCKED');
    assert.equal(missing.result.execution_inputs.cases[p.name]['po-spec.md'],null);
    assert.equal(missing.result.coverage.quality_ac.denominator,6);
  } finally {fs.writeFileSync(source,sourceBytes);}
  assert.equal((await runEvalSuite(p.options)).exit,0);
  for(const [relative,mode] of [['po-spec.md','change'],['case.json','delete'],['expected.md','change'],['candidate/us/US-01.md','delete']]) {
    const target=path.join(p.directory,relative), original=fs.readFileSync(target);
    try {
      const command=nodeCommand('tools/evals/run-evals.mjs','--agent',mutator(p,target,mode),'--case',p.name,'--results',p.options.results,...(defaultRoot?[]:['--cases-root',p.casesRoot]));
      const cli=await observe(command,process.cwd());
      assert.equal(cli.exit,1,cli.stdout+cli.stderr);
      const result=JSON.parse(fs.readFileSync(cli.stdout.trim().split('; ').at(-1)));
      assert.equal(result.pin_freshness,'STALE');
      assert.equal(result.cases[0].pin_freshness,'STALE');
      assert.ok(result.input_changes.some(row=>row.case_id===p.name&&row.file===relative));
      assert.deepEqual(result.cases[0].execution_inputs,result.execution_inputs.cases[p.name]);
      assert.equal(result.coverage.quality_ac.denominator,6);
    } finally {fs.writeFileSync(target,original);}
    const restored=await runEvalSuite(p.options);
    assert.equal(restored.exit,0);assert.equal(restored.result.pin_freshness,'CURRENT');
  }
});
test('unselected case input changes cannot contaminate selected corpus freshness',async t=>{
  const p=setup(t), other=path.join(p.casesRoot,'unselected');
  fs.cpSync(p.directory,other,{recursive:true});
  const agent=mutator(p,path.join(other,'po-spec.md'),'change');
  const {result}=await runEvalSuite({...p.options,fake:false,agent});
  assert.equal(result.pin_freshness,'CURRENT');
  assert.deepEqual(Object.keys(result.execution_inputs.cases),['baseline']);
});

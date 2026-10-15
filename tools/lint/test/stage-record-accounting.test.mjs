import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {lintSpec} from '../index.mjs';
import {recordAccounting} from '../record-accounting.mjs';
import {Problems} from '../problems.mjs';
const minimum=fileURLToPath(new URL('../../../fixtures/v2/minimal/',import.meta.url));
test('intake lint does not require records that intake has yet to produce',()=>{
 const result=lintSpec(minimum,{stage:'intake',pipelineConfig:{stages:{intake:{enabled:true}}}});
 assert.equal(result.exitCode,0,JSON.stringify(result.problems.list));
 assert.equal(result.stats.qRecords.checks['Q-STATE'].status,'NOT_RUN');
});
test('stage lint defers missing mandatory record inputs of current/later definitions',()=>{
 for(const stage of ['intake','us','handoff']) {
  const model={options:{stage:'intake'},records:{definitions:[{file:'definitions/'+stage,value:{stage,checks:[{id:'Q-STATE',mandatory:true},{id:'Q-ROUNDS',mandatory:true},{id:'Q-DECISION',mandatory:true}]}}]}};
  const problems=new Problems(); recordAccounting(model,problems,'records',[]);
  assert.equal(problems.errors.length,0,JSON.stringify(problems.list));
 }
});
test('export and prior-stage mandatory record inputs remain required',()=>{
 for(const options of [{},{stage:'us'}]) {
  const model={options,records:{definitions:[{file:'definitions/intake',value:{stage:'intake',checks:[{id:'Q-STATE',mandatory:true}]}}]}};
  const problems=new Problems();recordAccounting(model,problems,'records',[]);
  assert.ok(problems.errors.some(row=>row.code==='Q-STATE'));
 }
});
test('existing gates still require their candidate, definition, rounds and decision records in stage mode',()=>{
 const model={options:{stage:'intake'},records:{gates:[{file:'records/gates/intake.json',value:{decision:'missing',states:{human:'APPROVED'}}}],decisions:[]}};
 const problems=new Problems();recordAccounting(model,problems,'records',[]);
 for(const code of ['Q-DEFINITION','Q-SCOPE','Q-ROUNDS','Q-DECISION','Q-PACKET'])assert.ok(problems.errors.some(row=>row.code===code),code);
});

// The PRD "US" column cannot be filled before the stage that produces stories has run:
// the column-versus-trace comparison is deferred until that stage (derived from declared outputs) or until stories exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lintSpec} from '../index.mjs';
const FULL=fileURLToPath(new URL('../../../fixtures/v2/full/',import.meta.url));
function project(t,{stories=true}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'prd-us-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.cpSync(FULL,root,{recursive:true});
  if(!stories) fs.rmSync(path.join(root,'us'),{recursive:true});
  return root;
}
const column=(root,stage)=>lintSpec(root,{stage}).problems.errors.filter(e=>e.code==='S-US-INDEX'&&/PRD US column/.test(e.message)).map(e=>e.message);
test('with stories present the PRD US column agrees with trace.req (baseline)',t=>{
  assert.deepEqual(column(project(t),'prd'),[]);
});
test('before stories exist, a filled PRD US column is not compared at stage prd',t=>{
  assert.deepEqual(column(project(t,{stories:false}),'prd'),[]);
});
test('the deferral covers every stage before the one that produces stories',t=>{
  const root=project(t,{stories:false});
  assert.deepEqual(['intake','clarify','contract','prd'].map(s=>column(root,s).length),[0,0,0,0]);
});
test('at the stage that produces stories the column is compared even when no story exists yet',t=>{
  assert.ok(column(project(t,{stories:false}),'us').length>0);
});
test('without --stage a whole-bundle lint still compares the column',t=>{
  assert.ok(column(project(t,{stories:false}),undefined).length>0);
});
test('once stories exist a disagreeing column fails even at stage prd',t=>{
  const root=project(t),file=path.join(root,'prd/PRD.md');
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('contract SC-01 | 1 |','contract SC-01 | 3 |'));
  assert.deepEqual(column(root,'prd').length,1);
});

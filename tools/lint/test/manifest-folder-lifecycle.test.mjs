// A planned artifact (no folder) adopts the top-level folder named like its id once documents appear;
// an empty declared folder is deferred only while the current stage precedes the stage whose prompt declares its output.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lintSpec} from '../index.mjs';
const FIXTURE=fileURLToPath(new URL('../../../fixtures/runner/intake-state-planned/',import.meta.url));
function project(t,edit=j=>j) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lifecycle-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.cpSync(FIXTURE,root,{recursive:true});
  const file=path.join(root,'spec.manifest.json');
  fs.writeFileSync(file,JSON.stringify(edit(JSON.parse(fs.readFileSync(file,'utf8'))),null,2));
  return root;
}
const write=(root,rel,text)=>{fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),text);};
const doc=(id,type)=>`---\nid: ${id}\ntype: ${type}\ntitle: "Doc"\nupdated: "2026-10-14"\nstatus: draft\n---\n\n## Metadata\nChờ nguồn.\n`;
const codes=(root,stage)=>lintSpec(root,{stage}).problems.errors.map(e=>`${e.code}:${e.file}`);
const only=(list,code)=>list.filter(c=>c.startsWith(code+':'));
const declareFolders=(...ids)=>j=>{for(const a of j.artifacts)if(ids.includes(a.id))a.folder=a.id;return j;};

test('baseline: the intake-state fixture is lint-clean at intake',t=>{
  assert.deepEqual(codes(project(t),'intake'),[]);
});
test('a planned artifact (no folder) adopts the folder named like its id: contract/contract.md places at stage contract',t=>{
  const root=project(t);write(root,'contract/contract.md',doc('ask-contract','contract'));
  assert.deepEqual(only(codes(root,'contract'),'D-PLACEMENT'),[]);
});
test('adoption does not depend on --stage',t=>{
  const root=project(t);write(root,'prd/prd.md',doc('ask-prd','prd'));
  assert.deepEqual(only(codes(root,undefined),'D-PLACEMENT'),[]);
});
test('a planned artifact whose id differs from the folder is not adopted',t=>{
  const root=project(t);write(root,'stories/us-01.md',doc('us-01','us'));
  assert.deepEqual(only(codes(root,'us'),'D-PLACEMENT'),['D-PLACEMENT:stories/us-01.md']);
});
test('folders owned by later stages may be declared and empty at intake',t=>{
  const root=project(t,declareFolders('contract','prd','us','delivery','ux','reviews'));
  assert.deepEqual(only(codes(root,'intake'),'M-ARTIFACT-EMPTY'),[]);
});
test('the owner stage comes from the prompts: ux is owned by design, delivery by handoff',t=>{
  const root=project(t,declareFolders('ux','delivery')),empty=stage=>only(codes(root,stage),'M-ARTIFACT-EMPTY').length;
  assert.deepEqual([empty('clarify'),empty('design'),empty('handoff')],[0,1,2]);
});
test('a declared folder must have files once its owning stage is the current stage',t=>{
  const root=project(t,declareFolders('contract'));
  assert.deepEqual(only(codes(root,'contract'),'M-ARTIFACT-EMPTY'),['M-ARTIFACT-EMPTY:spec.manifest.json']);
});
test('without --stage an empty declared folder is still an error',t=>{
  const root=project(t,declareFolders('contract'));
  assert.deepEqual(only(codes(root,undefined),'M-ARTIFACT-EMPTY'),['M-ARTIFACT-EMPTY:spec.manifest.json']);
});
test('a folder no stage owns gets no deferral',t=>{
  const root=project(t,j=>{j.artifacts.push({id:'extra',name:'Extra',folder:'extra'});return j;});
  assert.deepEqual(only(codes(root,'intake'),'M-ARTIFACT-EMPTY'),['M-ARTIFACT-EMPTY:spec.manifest.json']);
});
test('a document in an undeclared, unplanned folder still fails placement',t=>{
  const root=project(t);write(root,'stray/doc.md',doc('stray-doc','contract'));
  assert.ok(codes(root,'contract').some(c=>c.startsWith('D-PLACEMENT:stray/')));
});

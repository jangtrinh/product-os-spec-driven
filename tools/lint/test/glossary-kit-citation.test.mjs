// Glossary Source may cite "<file> §<n>[, §<n>]" when <file> exists under the project root (parent of spec/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lintSpec} from '../index.mjs';
const FIXTURE=fileURLToPath(new URL('../../../fixtures/runner/template-glossary-sources/',import.meta.url));
function project(t,{cited=true}={}) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'gloss-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  fs.cpSync(FIXTURE,path.join(base,'spec'),{recursive:true});
  if(cited)for(const f of ['SPEC.md','format/gate-model.md']){fs.mkdirSync(path.dirname(path.join(base,f)),{recursive:true});fs.writeFileSync(path.join(base,f),'# cited\n');}
  return base;
}
const edit=(base,from,to)=>{const g=path.join(base,'spec/glossary.md');fs.writeFileSync(g,fs.readFileSync(g,'utf8').replace(from,to));};
const refs=base=>lintSpec(path.join(base,'spec'),{stage:'intake'}).problems.errors.filter(e=>e.code==='G-TERM-REF').map(e=>e.message);
test('template Source cells resolve when the cited files exist in the project root',t=>{
  assert.deepEqual(refs(project(t)),[]);
});
test('a section list "<file> §a, §b" resolves',t=>{
  const base=project(t);edit(base,'SPEC.md §2','SPEC.md §2, §3.1');
  assert.deepEqual(refs(base),[]);
});
test('a citation naming a file absent from the project root is still unresolved',t=>{
  const found=refs(project(t,{cited:false}));
  assert.ok(found.length>=10,JSON.stringify(found));
});
test('a citation cannot point outside the project root',t=>{
  const base=project(t);edit(base,'SPEC.md §2','../outside.md §2');
  assert.ok(refs(base).some(m=>m.includes('../outside.md')));
});
test('an absolute citation path stays unresolved',t=>{
  const base=project(t);edit(base,'SPEC.md §2','/etc/hosts §1');
  assert.ok(refs(base).some(m=>m.includes('/etc/hosts')));
});
test('a directory is not a cited file',t=>{
  const base=project(t);fs.mkdirSync(path.join(base,'format/dir'));edit(base,'SPEC.md §2','format/dir §1');
  assert.ok(refs(base).some(m=>m.includes('format/dir')));
});
test('an unknown decision id stays RED',t=>{
  const base=project(t);edit(base,'SPEC.md §7.3','D999');
  assert.ok(refs(base).some(m=>m.includes('D999')));
});

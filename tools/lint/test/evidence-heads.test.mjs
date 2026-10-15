import test from 'node:test';
import assert from 'node:assert/strict';
import { plant } from '../self-test.mjs';
import { lintSpec } from '../index.mjs';
import { evidenceHeadCases,refreshPacket,read } from '../controls-evidence-heads.mjs';
import {canonical} from '../../lib/digests.mjs';
for(const c of evidenceHeadCases) {
 test(`evidence heads case ${c.id}: ${c.name}`,()=>{
  const f=plant(t=>{
   c.plant(t);
   if(c.id===8) {
    const pass=read(t,t.files().find(f=>f.endsWith('/packet-data.json'))).evidence[0],manifest=read(t,'spec.manifest.json');
    const files=[...manifest.gate_model.receipts,...manifest.design.evidence];
    assert.ok(files.every(file=>canonical(read(t,file))!==canonical(pass)));
    assert.ok(files.some(file=>read(t,file).execution.result==='FAIL'));
    assert.ok(t.files().includes('assets/records/audit.jsonl'));
   }
   if(c.id===12)assert.equal(read(t,'assets/receipt.json').execution.result,'PASS');
  });
  try {
   const r=lintSpec(f.root),errors=r.problems.errors;
   if(c.code) {
    assert.equal(r.exitCode,1,JSON.stringify(r.problems.list));
    assert.ok(errors.some(x=>x.code===c.code),JSON.stringify(r.problems.list));
   }else assert.equal(r.exitCode,0,JSON.stringify(r.problems.list));
   if(c.id===8) {
    assert.ok(errors.some(e=>e.code==='Q-RECEIPT'&&e.message.includes('not store-resident')),JSON.stringify(r.problems.list));
    assert.equal(r.model.validSupersessions.size,0);
   }
  }finally{f.cleanup();}
 });
 if(c.code)test(`evidence heads case ${c.id}: repaired negative control removes ${c.code}`,()=>{
  const f=plant(t=>{c.plant(t);c.repair(t);refreshPacket(t);});
  try {const r=lintSpec(f.root);assert.equal(r.exitCode,0,JSON.stringify(r.problems.list));assert.ok(!r.problems.errors.some(x=>x.code===c.code),JSON.stringify(r.problems.list));}
  finally{f.cleanup();}
 });
}
test('packet-only removal cannot discard a resident failed head',()=>{
 const f=plant(t=>{
  evidenceHeadCases.find(c=>c.id===2).plant(t);
  t.packet(p=>p.evidence.pop());refreshPacket(t);
  assert.ok(read(t,'spec.manifest.json').gate_model.receipts.some(file=>read(t,file).id==='receipt-current-failure'));
 });
 try {
  const r=lintSpec(f.root);
  assert.equal(r.exitCode,1,JSON.stringify(r.problems.list));
  assert.ok(r.problems.errors.some(e=>e.code==='Q-DECISION'),JSON.stringify(r.problems.list));
 } finally {f.cleanup();}
});

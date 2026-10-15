import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plant,receiptSelectionGuard } from '../self-test.mjs';
import { lintSpec } from '../index.mjs';
import { approvePacket } from '../controls-v3.mjs';
import { currentFailure } from '../controls-current-receipts.mjs';
import { retirement,store,witness,read,refreshPacket } from '../controls-evidence-heads.mjs';
const red=(r,code)=>{assert.equal(r.exitCode,1,JSON.stringify(r.problems.list));assert.ok(r.problems.errors.some(e=>e.code===code),JSON.stringify(r.problems.list));};
const CLI=fileURLToPath(new URL('../lint.mjs',import.meta.url));
function seeded(mutate,check){const f=plant(mutate);try{check(lintSpec(f.root),f);}finally{f.cleanup();}}
const controls=[
 ['self reference',t=>retirement(t,(p,r)=>{r.supersedes[0].id=r.id;store(t,r,'assets/receipt.json');}),t=>t.json('assets/receipt.json',r=>r.supersedes[0].id='receipt-current-failure')],
 ['cycle',t=>retirement(t,(p,r,f)=>{f.supersedes=[{id:r.id,reason:'Cycle'}];store(t,f);}),t=>t.json('assets/heads/receipt-current-failure.json',f=>delete f.supersedes)],
 ['empty reason',t=>retirement(t,(p,r)=>{r.supersedes[0].reason='';store(t,r,'assets/receipt.json');}),t=>t.json('assets/receipt.json',r=>r.supersedes[0].reason='Independent rerun')],
 ['whitespace reason',t=>retirement(t,(p,r)=>{r.supersedes[0].reason=' ';store(t,r,'assets/receipt.json');}),t=>t.json('assets/receipt.json',r=>r.supersedes[0].reason='Independent rerun')],
 ['wrong domain',t=>retirement(t,(p,r,f)=>{f.domain='local-ci';store(t,f);}),t=>t.json('assets/heads/receipt-current-failure.json',f=>f.domain='spec')],
 ['schema-invalid superseder',t=>retirement(t,(p,r)=>{r.at='2026-01-09T00:00:00.1234567Z';store(t,r,'assets/receipt.json');}),t=>t.json('assets/receipt.json',r=>r.at='2026-01-09T00:00:00.123Z')],
 ['wrong witness type',t=>retirement(t,()=>t.edit('assets/records/audit.jsonl',s=>{const lines=s.trim().split('\n'),e=JSON.parse(lines[1]);e.type='decision';return lines[0]+'\n'+JSON.stringify(e)+'\n';})),t=>witness(t,'receipt-spec','receipt-current-failure')],
 ['missing witness refs',t=>retirement(t,()=>t.edit('assets/records/audit.jsonl',s=>{const lines=s.trim().split('\n'),e=JSON.parse(lines[1]);e.refs=['receipt-spec'];return lines[0]+'\n'+JSON.stringify(e)+'\n';})),t=>witness(t,'receipt-spec','receipt-current-failure')],
 ['invalid audit chain',t=>retirement(t,()=>t.edit('assets/records/audit.jsonl',s=>{const lines=s.trim().split('\n'),e=JSON.parse(lines[1]);e.previous_sha256=null;return lines[0]+'\n'+JSON.stringify(e)+'\n';})),t=>t.edit('assets/records/audit.jsonl',s=>s.split('\n')[0]+'\n')],
];
for(const [name,mutate,repair] of controls){
 test(`supersession rejects ${name}`,()=>seeded(mutate,r=>red(r,'Q-RECEIPT')));
 test(`supersession ${name} negative control`,()=>seeded(t=>{mutate(t);repair(t);if(name==='invalid audit chain')witness(t,'receipt-spec','receipt-current-failure');refreshPacket(t);},r=>assert.ok(!r.problems.errors.some(x=>x.code==='Q-RECEIPT'),JSON.stringify(r.problems.list))));
}
test('historical sub-ms precision reproduction rejects both schema and approval',()=>seeded(t=>approvePacket(t,(p,r)=>{r.at='2026-01-09T00:00:00.1231Z';currentFailure(p,r,{id:'aa-failure',at:'2026-01-09T00:00:00.1239Z'});}),r=>{red(r,'Q-DECISION');red(r,'Q-RECEIPT');}));
test('foreign seven-digit receipt timestamp is a schema error',()=>seeded(t=>t.json('assets/receipt.json',r=>r.at='2026-01-09T00:00:00.1234567Z'),r=>red(r,'Q-RECEIPT')));
test('foreign timestamp negative control restores milliseconds',()=>seeded(t=>t.json('assets/receipt.json',r=>r.at='2026-01-09T00:00:00.123Z'),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('no exported audit never witnesses retirement and discloses NOT RUN',()=>seeded(t=>{retirement(t);t.json('spec.manifest.json',m=>delete m.gate_model.records);},(r,f)=>{red(r,'Q-RECEIPT');assert.equal(r.stats.qRecords.checks['Q-RECEIPT'].witness.status,'NOT_RUN');assert.equal(r.stats.qRecords.checks['Q-RECEIPT'].witness.reason,'no gate_model.records');const cli=spawnSync(process.execPath,[CLI,f.root],{encoding:'utf8'});assert.equal(cli.status,1);assert.match(cli.stdout,/Q-RECEIPT witness: NOT RUN \(no gate_model.records\)/);}));
test('no audit negative control exports the witness',()=>seeded(t=>retirement(t),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('duplicate id with identical canonical content is harmless',()=>seeded(t=>store(t,read(t,'assets/receipt.json'),'assets/heads/same-copy.json'),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('CURRENT overlay cannot resurrect a STALE failed receipt',()=>seeded(t=>{approvePacket(t,(p,r)=>currentFailure(p,r,{freshness:'STALE'}));t.write('review/freshness/receipt-current-failure.json',JSON.stringify({id:'receipt-current-failure',freshness:'CURRENT'}));},r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('malformed overlay fails closed',()=>seeded(t=>{approvePacket(t);t.write('review/freshness/receipt-spec.json','{');},r=>{red(r,'Q-RECEIPT');red(r,'Q-DECISION');}));
test('receipt selector contains no timestamp reads or parsing',()=>assert.equal(receiptSelectionGuard(),true));
for(const reverse of [false,true])test(`retirement independent of receipt file/array order reverse=${reverse}`,()=>seeded(t=>{retirement(t);if(reverse){t.packet(p=>p.evidence.reverse());t.json('spec.manifest.json',m=>m.gate_model.receipts.reverse());refreshPacket(t);}},r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));

test('STALE supersession is inert and cannot retire a CURRENT FAIL',()=>seeded(t=>retirement(t,(p,r)=>{r.freshness='STALE';store(t,r,'assets/receipt.json');}),r=>{red(r,'Q-DECISION');assert.ok(!r.problems.errors.some(e=>e.code==='Q-RECEIPT'),JSON.stringify(r.problems.list));}));
test('STALE supersession negative control restores CURRENT',()=>seeded(t=>retirement(t),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
for(const both of [false,true])test(`chain retirement is direct; final receipt names both=${both}`,()=>seeded(t=>{
 retirement(t,(p,r,f)=>{const next=structuredClone(r);next.id='third-pass';next.supersedes=[{id:r.id,reason:'Latest independent rerun'},...both?[{id:f.id,reason:'Independent rerun of original failure'}]:[]];store(t,next);witness(t,next.id,r.id,f.id);p.evidence.push(next);p.change.propagation.forEach(x=>x.evidence=[next.id]);});
},r=>{assert.ok(!r.problems.errors.some(e=>e.code==='Q-RECEIPT'),JSON.stringify(r.problems.list));if(both)assert.equal(r.exitCode,0,JSON.stringify(r.problems.list));else red(r,'Q-DECISION');}));

test('retired quality FAIL on an executed PASS no longer blocks',()=>seeded(t=>retirement(t,(p,r,f)=>{f.execution.result='PASS';f.execution.exit=0;store(t,f);}),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('unretired quality FAIL on an executed PASS still blocks',()=>seeded(t=>{retirement(t,(p,r,f)=>{f.execution.result='PASS';f.execution.exit=0;store(t,f);delete r.supersedes;store(t,r,'assets/receipt.json');});},r=>{red(r,'Q-REVIEW');red(r,'Q-DECISION');}));

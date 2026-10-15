import { retirement,store,witness } from '../controls-evidence-heads.mjs';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { digest,hash } from '../../lib/digests.mjs';
import assert from 'node:assert/strict';
import { plant } from '../self-test.mjs';
import { lintSpec } from '../index.mjs';
import { approvePacket } from '../controls-v3.mjs';
import { currentFailure,unrelatedSource,currentReceiptControls } from '../controls-current-receipts.mjs';
function seeded(mutate,check) {
  const f=plant(mutate);
  try{check(lintSpec(f.root,f.options));}finally{f.cleanup();}
}
const red=(r,code)=>assert.ok(r.problems.errors.some(p=>p.code===code),JSON.stringify(r.problems.list));
const green=r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list));
for(const [i,[code,mutate]] of currentReceiptControls.entries())test(`current receipt attack ${i+1} refuses with ${code}`,()=>seeded(mutate,r=>red(r,code)));
for(const def of ['defer','changes-requested','approve'])test(`newer mandatory failure blocks approval under ${def}`,()=>seeded(t=>approvePacket(t,(p,r)=>currentFailure(p,r),def),r=>red(r,'Q-DECISION')));
test('latest ordering ignores receipt array order',()=>seeded(t=>approvePacket(t,(p,r)=>{currentFailure(p,r);p.evidence.reverse();}),r=>red(r,'Q-DECISION')));
test('equal receipt time uses greatest id as deterministic tie break',()=>seeded(t=>approvePacket(t,(p,r)=>currentFailure(p,r,{at:r.at,id:'zz-failure'})),r=>red(r,'Q-DECISION')));
test('newer PASS cannot retire an older failed review',()=>seeded(t=>approvePacket(t,(p,r)=>currentFailure(p,r,{at:'2026-01-08T00:00:00Z'})),r=>red(r,'Q-DECISION')));
test('equal receipt time with lower failed id still blocks',()=>seeded(t=>approvePacket(t,(p,r)=>currentFailure(p,r,{at:r.at,id:'aa-failure'})),r=>red(r,'Q-DECISION')));
test('STALE failure cannot supersede a CURRENT PASS',()=>seeded(t=>approvePacket(t,(p,r)=>currentFailure(p,r,{freshness:'STALE'})),green));
test('wrong candidate pins cannot supersede exact CURRENT review',()=>seeded(t=>approvePacket(t,(p,r)=>{const f=currentFailure(p,r);f.pins.head='old-head';}),green));
test('a PASS in another domain cannot hide a latest mandatory failure',()=>seeded(t=>approvePacket(t,(p,r)=>currentFailure(p,r,{domain:'local-ci'})),r=>red(r,'Q-DECISION')));
test('additional log output cannot hide latest review of the same source',()=>seeded(t=>approvePacket(t,(p,r)=>{const f=currentFailure(p,r);f.artifacts['README.md']=hash(requireRead(t,'README.md')); f.review.inputs.push('README.md');}),r=>red(r,'Q-DECISION')));
for(const kind of ['ac','scn'])test(`unrelated bytes cannot establish ${kind} RED history`,()=>seeded(t=>{t.json('assets/red-receipt.json',r=>unrelatedSource(t,r));if(kind==='scn')t.json('assets/records/expected/XC-001.json',e=>e.target={kind,id:'US-03.SCN-03-01'});},r=>red(r,'Q-EXPECTED')));
for(const part of ['artifacts','inputs'])test(`target RED requires source ${part}`,()=>seeded(t=>t.json('assets/red-receipt.json',r=>{if(part==='artifacts')r.artifacts={};else r.review.inputs=['README.md'];}),r=>red(r,'Q-EXPECTED')));
test('correct target-bound RED receipt remains eligible',()=>seeded(()=>{},green));
function exportFailure(t,changes={}) {
  const r=JSON.parse(requireRead(t,'assets/receipt.json')),p={evidence:[]},f=currentFailure(p,r,changes);
  t.write('assets/newer-receipt.json',JSON.stringify(f));
  t.json('spec.manifest.json',m=>m.gate_model.receipts.push('assets/newer-receipt.json'));
}
function acceptGate(t) {
  approvePacket(t,'valid','approve');
  t.json('assets/records/gates/story.json',g=>{g.states.human='APPROVED';g.states.progress='accepted';g.decision='decision-1';});
}
function terminalChange(t) {
  approvePacket(t,'valid','approve');
  const p=JSON.parse(requireRead(t,t.files().find(x=>x.endsWith('/packet-data.json'))));
  t.json('assets/change.json',c=>{c.state='Approved';c.scope=p.scope;c.candidate=p.candidate;c.packet=t.files().find(x=>x.endsWith('/packet-data.json')).split('/').at(-2);c.po_decision='decision-1';c.propagation[0].status='verified';c.propagation[0].evidence=['receipt-spec'];});
}
const requireRead=(t,rel)=>fs.readFileSync(path.join(t.root,rel),'utf8');
test('accepted gate cannot ignore newer exact source mandatory failure',()=>seeded(t=>{acceptGate(t);exportFailure(t);},r=>red(r,'Q-REVIEW')));
test('valid source-bound accepted gate passes',()=>seeded(acceptGate,green));
test('terminal propagation cannot cite old PASS over latest failed review',()=>seeded(t=>{terminalChange(t);exportFailure(t);},r=>red(r,'Q-PROPAGATION')));
test('valid source-bound terminal propagation passes',()=>seeded(terminalChange,green));
test('aggregate check cannot cite superseded PASS',()=>seeded(t=>approvePacket(t,(p,r)=>{currentFailure(p,r);p.aggregate_checks=[r.id];}),r=>red(r,'Q-DECISION')));
test('forged membership plus receipt README hashes cannot approve original AC',()=>seeded(t=>approvePacket(t,(p,r)=>{unrelatedSource(t,r);p.membership.members[0].artifacts=r.artifacts;const m=p.membership.members[0];m.revision=digest(m.artifacts);p.candidate.manifest=digest(p.membership);p.scope.revision=digest(p.membership.members);r.scope.revision=p.scope.revision;r.pins={...p.candidate};}),r=>red(r,'Q-DECISION')));
test('duplicate receipt ids cannot make time/id ordering depend on array order',()=>seeded(t=>approvePacket(t,(p,r)=>currentFailure(p,r,{at:r.at,id:r.id})),r=>red(r,'Q-RECEIPT')));
test('duplicate exported receipt ids fail closed',()=>seeded(t=>exportFailure(t,{id:'receipt-spec'}),r=>red(r,'Q-RECEIPT')));
test('validly retired PASS cannot remain a propagation reference',()=>seeded(t=>approvePacket(t,(p,r)=>{const next=structuredClone(r);next.id='new-pass';next.supersedes=[{id:r.id,reason:'Independent rerun'}];p.evidence.push(next);store(t,next);witness(t,next.id,r.id);}),r=>red(r,'Q-DECISION')));
test('propagation citing latest source-bound PASS remains green',()=>seeded(t=>approvePacket(t,(p,r)=>{const latest=structuredClone(r);latest.id='new-pass';latest.at='2026-01-10T00:00:00Z';p.evidence.push(latest);p.change.propagation[0].evidence=[latest.id];}),green));
test('legitimate RED test/log artifacts may accompany original source pins',()=>seeded(t=>t.json('assets/red-receipt.json',r=>{r.artifacts['README.md']=hash(requireRead(t,'README.md'));r.review.inputs.push('README.md');}),green));
test('original input without its hash cannot establish target RED',()=>seeded(t=>t.json('assets/red-receipt.json',r=>{r.artifacts={'README.md':hash(requireRead(t,'README.md'))};}),r=>red(r,'Q-EXPECTED')));
test('accepted gate receipt scope label cannot replace exact revision',()=>seeded(t=>{acceptGate(t);t.json('assets/receipt.json',r=>r.scope.revision='invented');},r=>red(r,'Q-REVIEW')));
test('newer exported failure blocks approval of an older packet snapshot',()=>seeded(t=>{approvePacket(t);exportFailure(t);},r=>red(r,'Q-DECISION')));
test('newer packet failure blocks accepted gate citing older export',()=>seeded(t=>{acceptGate(t);approvePacket(t,(p,r)=>currentFailure(p,r),'approve');},r=>red(r,'Q-REVIEW')));
test('terminal propagation sees newer packet review despite deferred packet decision',()=>seeded(t=>{terminalChange(t);approvePacket(t,(p,r)=>currentFailure(p,r));t.json('assets/records/decisions/decision-1.json',d=>d.overrides=[]);},r=>red(r,'Q-PROPAGATION')));
test('terminal propagation cannot substitute packet PASS for wrong-pinned export',()=>seeded(t=>{terminalChange(t);t.json('assets/receipt.json',r=>r.pins.head='old-head');},r=>red(r,'Q-PROPAGATION')));

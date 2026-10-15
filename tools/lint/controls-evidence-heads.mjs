import fs from 'node:fs';
import path from 'node:path';
import { digest,hash,canonical } from '../lib/digests.mjs';
import { approvePacket } from './controls-v3.mjs';
import { currentFailure } from './controls-current-receipts.mjs';
export const read=(t,file)=>JSON.parse(fs.readFileSync(path.join(t.root,file),'utf8'));
export function store(t,r,file=`assets/heads/${r.id}.json`) {
  t.write(file,JSON.stringify(r));
  if(!read(t,'spec.manifest.json').gate_model.receipts.includes(file))t.json('spec.manifest.json',m=>m.gate_model.receipts.push(file));
}
export function witness(t,...ids) {
  const file='assets/records/audit.jsonl',lines=fs.readFileSync(path.join(t.root,file),'utf8').trim().split('\n');
  const event={...JSON.parse(lines[0]),id:`eval-${lines.length}`,type:'eval',refs:ids,previous_sha256:hash(lines[lines.length-1]),scope:{kind:'ac',ids:['US-01.AC-01'],revision:'receipt-rerun'}};
  t.write(file,lines.join('\n')+'\n'+JSON.stringify(event)+'\n');
}
export function retirement(t,modify=()=>{},options) {
  approvePacket(t,(p,r)=>{
    const f=currentFailure(p,r,{at:'2026-01-08T00:00:00Z'});
    r.supersedes=[{id:f.id,reason:'Harness error independently re-observed'}];
    store(t,f);store(t,r,'assets/receipt.json');witness(t,r.id,f.id);
    modify(p,r,f);
  },'defer',options);
}
const conflict=(changes={})=>t=>approvePacket(t,(p,r)=>currentFailure(p,r,changes));
// Reconstruct removal-based fixture controls; runtime retirement still requires
// an independent superseder and witness, with the failed observation retained.
function removeIntroducedObservation(t) {
  t.packet(p=>{
    const receipt=p.evidence.pop();
    for(const {file,receipt:bytes} of t.introducedReceiptFiles??[])if(bytes===canonical(receipt)) {
      t.remove(file);t.json('spec.manifest.json',m=>m.gate_model.receipts=m.gate_model.receipts.filter(f=>f!==file));
    }
  });
}
export const evidenceHeadCases=[
 {id:1,name:'normalized-ms twin retains a FAIL',code:'Q-DECISION',plant:t=>approvePacket(t,(p,r)=>{r.at='2026-01-09T00:00:00.123Z';store(t,r,'assets/receipt.json');currentFailure(p,r,{at:'2026-01-09T00:00:00.123Z',id:'aa-failure'});}),repair:removeIntroducedObservation},
 {id:2,name:'clock-skew FAIL remains a head',code:'Q-DECISION',plant:conflict({at:'2026-01-08T00:00:00Z'}),repair:removeIntroducedObservation},
 {id:3,name:'equal-time conflicting result blocks',code:'Q-DECISION',plant:conflict({at:'2026-01-09T00:00:00Z',id:'aa-failure'}),repair:removeIntroducedObservation},
 {id:4,name:'fork retirement leaves an unrelated FAIL head',code:'Q-DECISION',plant:t=>retirement(t,(p,r,f)=>{const third=structuredClone(f);third.id='third-pass';third.execution=r.execution;third.review=r.review;store(t,third);r.supersedes[0].id=third.id;store(t,r,'assets/receipt.json');witness(t,r.id,third.id);}),repair:t=>t.json('assets/receipt.json',r=>r.supersedes[0].id='receipt-current-failure')},
 {id:5,name:'bound source hash drift invalidates supersession',code:'Q-RECEIPT',plant:t=>retirement(t,(p,r,f)=>{f.artifacts['us/US-01.md']='0'.repeat(64);store(t,f);}),repair:t=>t.json('assets/heads/receipt-current-failure.json',f=>f.artifacts=read(t,'assets/receipt.json').artifacts)},
 {id:6,name:'rules pin drift invalidates supersession',code:'Q-RECEIPT',plant:t=>retirement(t,(p,r,f)=>{f.pins.rules='old-rules';store(t,f);}),repair:t=>t.json('assets/heads/receipt-current-failure.json',f=>delete f.pins.rules)},
 {id:7,name:'dangling supersession',code:'Q-RECEIPT',plant:t=>retirement(t,(p,r)=>{r.supersedes[0].id='absent';store(t,r,'assets/receipt.json');}),repair:t=>t.json('assets/receipt.json',r=>r.supersedes[0].id='receipt-current-failure')},
 {id:8,name:'embedded-only PASS cannot retire store FAIL',code:'Q-DECISION',plant:t=>{
   let embedded;
   retirement(t,(p,r,f)=>{embedded=r;r.id='embedded-pass';p.change.propagation.forEach(x=>x.evidence=[r.id]);witness(t,r.id,f.id);t.json('assets/receipt.json',x=>delete x.supersedes);},{resident:receipt=>receipt!==embedded});
 },repair:t=>store(t,read(t,t.files().find(f=>f.endsWith('/packet-data.json'))).evidence[0])},
 {id:9,name:'missing eval audit witness invalidates retirement',code:'Q-RECEIPT',plant:t=>retirement(t,()=>t.edit('assets/records/audit.jsonl',s=>s.split('\n')[0]+'\n')),repair:t=>witness(t,'receipt-spec','receipt-current-failure')},
 {id:10,name:'migrated CURRENT FAIL with no sequence blocks',code:'Q-DECISION',plant:conflict({at:'2026-01-01T00:00:00Z'}),repair:removeIntroducedObservation},
 {id:11,name:'freshness overlay excludes an immutable CURRENT PASS',code:'Q-DECISION',plant:t=>{approvePacket(t);t.write('review/freshness/receipt-spec.json',JSON.stringify({id:'receipt-spec',freshness:'STALE',reason:'Impact invalidation',at:'2026-01-10T00:00:00Z'}));},repair:t=>t.json('review/freshness/receipt-spec.json',r=>r.freshness='CURRENT')},
 {id:12,name:'duplicate id with different content',code:'Q-RECEIPT',plant:t=>approvePacket(t,(p,r)=>currentFailure(p,r,{id:r.id,at:r.at})),repair:removeIntroducedObservation},
 {id:13,name:'superseder reviewer is the builder',code:'Q-DECISION',plant:t=>retirement(t,(p,r)=>{r.review.reviewer=r.review.builder;store(t,r,'assets/receipt.json');}),repair:t=>t.json('assets/receipt.json',r=>r.review.reviewer='QC')},
 {id:14,name:'new source bytes retire old FAIL without supersedes',plant:t=>{
   const old=read(t,'assets/receipt.json');old.id='old-byte-failure';old.freshness='CURRENT';old.execution.result='FAIL';old.execution.exit=1;old.review.verdict='FAIL';old.review.criteria[0].score=0;store(t,old);
   t.edit('us/US-01.md',s=>s+'\nRepair preserves the confirmation requirement.\n');
   const artifacts={'us/US-01.md':hash(fs.readFileSync(path.join(t.root,'us/US-01.md')))},member={kind:'ac',id:'US-01.AC-01',artifacts,revision:digest(artifacts)},membership={version:'1',members:[member]};
   t.json('assets/receipt.json',r=>{r.artifacts=artifacts;r.scope.revision=digest([member]);r.pins.manifest=digest(membership);});
   t.json('assets/records/gates/story.json',g=>{g.candidate.manifest=digest(membership);});
   const candidate=t.files().find(f=>f.includes('/candidates/'));t.remove(candidate);t.write(`assets/records/candidates/${digest(membership)}.json`,JSON.stringify(membership));
   approvePacket(t,(p,r)=>{p.membership=membership;p.scope.revision=digest([member]);p.candidate.manifest=digest(membership);r.pins={...p.candidate};});
 }},
 {id:15,name:'explicit witnessed independent retirement approves',plant:t=>retirement(t)},
 {id:16,name:'two agreeing PASS heads approve',plant:t=>approvePacket(t,(p,r)=>{const second=structuredClone(r);second.id='second-pass';p.evidence.push(second);})},
];
export function refreshPacket(t) {
  const file=t.files().find(f=>f.endsWith('/packet-data.json')),p=read(t,file);
  // Keep fixture store/embedded copies equal when repairing a store field.
  for(let i=0;i<p.evidence.length;i++) {
    const r=p.evidence[i],manifest=read(t,'spec.manifest.json');
    const files=[...new Set([...(manifest.gate_model.receipts??[]),...(manifest.design?.evidence??[])])].filter(file=>read(t,file).id===r.id);
    if(files.length) {
      const observations=files.map(file=>read(t,file));
      if(new Set(observations.map(canonical)).size!==1)throw Error(`Conflicting fixture copies require explicit repair: ${r.id}`);
      p.evidence[i]=observations[0];
    }
  }
  const id='packet-'+digest(p);t.remove(path.dirname(file));t.write(`assets/records/packets/${id}/packet-data.json`,JSON.stringify(p));
  const decision=read(t,'assets/records/decisions/decision-1.json');decision.packet_id=id;decision.data_sha256=digest(p);t.write('assets/records/decisions/decision-1.json',JSON.stringify(decision));
}
export const evidenceHeadControls=evidenceHeadCases.filter(c=>c.code).map(c=>[c.code,c.plant]);

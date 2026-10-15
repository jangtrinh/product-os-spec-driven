import fs from 'node:fs';
import path from 'node:path';
import { digest,hash,canonical } from '../lib/digests.mjs';
const ROOT='assets/records',XC=`${ROOT}/expected/XC-001.json`,Q=`${ROOT}/clarify/Q-001.json`;
export function approvePacket(t,kind='valid',defaultDecision='defer',{resident=()=>true}={}) {
  const old=t.files().find(f=>f.endsWith('/packet-data.json'));
  const p=JSON.parse(fs.readFileSync(path.join(t.root,old),'utf8'));
  const r=JSON.parse(fs.readFileSync(path.join(t.root,'assets/receipt.json'),'utf8'));
  const originalId=r.id;
  p.evidence=[r];p.change.propagation.forEach(x=>{x.status='verified';x.evidence=[r.id];});
  if(kind==='mandatory')r.review.criteria[0].score=0;
  if(kind==='open')p.open[0].blocking=true;
  if(kind==='propagation')p.change.propagation.forEach(x=>x.status='not-run');
  if(kind==='stale')r.freshness='STALE';
  if(kind==='source')r.review.inputs=['missing-original.md'];
  if(kind==='scope'){r.scope.ids=['US-02.AC-01'];r.coverage.ac=['US-02.AC-01'];}
  if(kind==='pins')r.pins.head='old-head';
  if(typeof kind==='function')kind(p,r);
  t.introducedReceiptFiles=[];
  for(const [index,receipt] of p.evidence.entries()) {
    if(!resident(receipt,index))continue;
    const manifest=JSON.parse(fs.readFileSync(path.join(t.root,'spec.manifest.json'),'utf8'));
    const declared=[...new Set([...(manifest.gate_model.receipts??[]),...(manifest.design?.evidence??[])])];
    if(declared.some(file=>canonical(JSON.parse(fs.readFileSync(path.join(t.root,file),'utf8')))===canonical(receipt)))continue;
    let file=index===0&&receipt.id===originalId?'assets/receipt.json':`assets/receipts/${receipt.id}.json`;
    if(index!==0&&fs.existsSync(path.join(t.root,file)))file=`assets/receipts/${receipt.id}-${digest(receipt)}.json`;
    if(!fs.existsSync(path.join(t.root,file)))t.introducedReceiptFiles.push({file,receipt:canonical(receipt)});
    t.write(file,JSON.stringify(receipt,null,2)+'\n');
    if(!manifest.gate_model.receipts.includes(file))t.json('spec.manifest.json',m=>m.gate_model.receipts.push(file));
  }
  t.write(`${ROOT}/candidates/${digest(p.membership)}.json`,JSON.stringify(p.membership,null,2)+'\n');
  const id='packet-'+digest(p);t.remove(path.dirname(old));t.write(`${ROOT}/packets/${id}/packet-data.json`,JSON.stringify(p,null,2)+'\n');
  t.json(`${ROOT}/decisions/decision-1.json`,d=>{d.packet_id=id;d.data_sha256=digest(p);d.scope=p.scope;d.pins=p.candidate;d.default=defaultDecision;d.overrides=defaultDecision==='approve'?[]:[{id:'US-01.AC-01',decision:'approve',reason:'Approve subset'}];});
}
export const v3Controls=[
 ['Q-DEFINITION',t=>t.remove(`${ROOT}/definitions`)],
 ['Q-STATE',t=>{t.remove(`${ROOT}/gates`);t.json(`${ROOT}/definitions/story/1.json`,d=>d.checks.push({id:'Q-STATE',command:'record lint',mandatory:true,blocker_policy:'Prior stage records required'}));t.options.stage='handoff';}],
 ['Q-REVIEW',t=>approvePacket(t,'mandatory','approve')],
 ['Q-DECISION',t=>approvePacket(t,'open')],
 ['Q-DECISION',t=>approvePacket(t,'propagation')],
 ['Q-DECISION',t=>approvePacket(t,'stale','changes-requested')],
 ['Q-REVIEW',t=>approvePacket(t,'source')],
 ['Q-DECISION',t=>approvePacket(t,'scope')],
 ['Q-DECISION',t=>approvePacket(t,'pins')],
 ['Q-EXPECTED',t=>t.json(XC,j=>j.target.id='US-99.AC-99')],
 ['Q-EXPECTED',t=>t.json(XC,j=>j.amendment_ref='fc-001.A-02')],
 ['Q-EXPECTED',t=>t.json('assets/red-receipt.json',j=>j.scope.ids=['US-02.AC-01'])],
 ['Q-EXPECTED',t=>{t.json(XC,j=>j.red_history[0].result='BLOCKED');t.json('assets/red-receipt.json',r=>{r.freshness='MISSING';r.execution.result='BLOCKED';r.execution.exit=null;r.execution.selected=0;r.review.verdict='BLOCKED';});}],
 ['Q-CLARIFY',t=>t.json(Q,j=>j.decision_ref='D999')],
 ['Q-CLARIFY',t=>t.json(Q,j=>{j.status='superseded';j.superseded_by='Q-999';j.reason='Replaced';})],
 ['Q-CLARIFY',t=>t.json(Q,j=>j.duplicate_of='Q-999')],
 ['Q-CLARIFY',t=>t.json(Q,j=>j.depends_on=['US-99.AC-99'])],
 ['E-INPUT',t=>{fs.mkdirSync(path.join(t.root,'tests'),{recursive:true});fs.symlinkSync('/etc/hosts',path.join(t.root,'tests/escape.txt'));}],
 ['D-FRONTMATTER-YAML',t=>t.edit('us/US-03.md',s=>s.replace(/^updated: .*$/m,x=>x+'\nupdated: 2026-01-07'))],
 ['U-CONTRACT-DESIGN',t=>t.json('assets/inventory.json',j=>j.screens.find(x=>x.screen==='S03' && x.state==='normal').roles=['Owner'])],
 ['Q-AUDIT',t=>t.edit(`${ROOT}/audit.jsonl`,s=>{const e=JSON.parse(s.trim());e.at='2026-01-10T00:00:00Z';e.previous_sha256=hash(s.trim());return s+JSON.stringify(e)+'\n';})],
 ['DS-AUTHORITY',t=>{t.write('assets/rulings.json',JSON.stringify({version:'1',adapter:'example',items:[{id:'R1',subject:'copy',scope:'S01',date:'2026-01-09',status:'active',text_ref:'README.md'},{id:'R2',subject:'copy',scope:'S02',date:'2026-01-09',status:'active',text_ref:'README.md',supersedes:['R1']}]}));t.json('assets/profile.json',j=>j.authority.push({id:'rulings',kind:'ruling',path:'assets/rulings.json',revision:'fixture-rulings',non_waivable:true}));}],
];

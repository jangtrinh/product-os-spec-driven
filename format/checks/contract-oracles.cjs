// Bounded verification oracles for normative contracts; not production reader/runner code.
const {createHash}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const order=(a,b)=>a<b?-1:a>b?1:0;
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort(order).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>hash(canonical(value));
function packetErrors(packet,decision,current,root){
 const errors=[],same=(a,b)=>canonical(a)===canonical(b);
 if(decision.data_sha256!==digest(packet)||decision.packet_id!=='packet-'+digest(packet))errors.push('Q-DECISION digest');
 if(!same(packet.baseline,current.baseline)||!same(packet.candidate,current.candidate)||!same(decision.pins,packet.candidate))errors.push('Q-FRESHNESS pins');
 if(!same(decision.scope,packet.scope)||!same(packet.scope,current.scope))errors.push('Q-SCOPE scope');
 if(packet.candidate.manifest!==digest(packet.membership)||!same(packet.membership,current.membership))errors.push('Q-SCOPE manifest');
 const members=packet.membership.members,selected=members.filter(x=>x.kind===packet.scope.kind&&packet.scope.ids.includes(x.id));
 if(selected.length!==packet.scope.ids.length||digest(selected)!==packet.scope.revision)errors.push('Q-SCOPE membership');
 if(new Set(members.map(x=>x.kind+':'+x.id)).size!==members.length)errors.push('Q-SCOPE duplicate');
 for(const m of members){
  if(m.revision!==digest(m.artifacts))errors.push('Q-SCOPE revision');
  for(const [f,sha] of Object.entries(m.artifacts))if(hash(fs.readFileSync(path.join(root,f)))!==sha)errors.push('Q-FRESHNESS artifact');
 }
 if(!same(packet.requests.map(x=>x.id),packet.scope.ids))errors.push('Q-PACKET requests');
 for(const item of decision.overrides){
  const known=packet.scope.ids.includes(item.id)||packet.scope.ids.some(x=>x.startsWith(item.id+'.AC-'));
  if(!known)errors.push('Q-DECISION override');
 }
 if(new Set(decision.overrides.map(x=>x.id)).size!==decision.overrides.length)errors.push('Q-DECISION duplicate override');
 for(const id of packet.aggregate_checks)if(!packet.evidence.some(x=>x.id===id))errors.push('Q-PACKET receipt join');
 for(const row of packet.change.propagation)if(row.evidence.some(id=>!packet.evidence.some(x=>x.id===id)))errors.push('Q-PROPAGATION receipt join');
 for(const r of packet.evidence)for(const [f,sha] of Object.entries(r.artifacts))if(hash(fs.readFileSync(path.join(root,f)))!==sha)errors.push('Q-RECEIPT artifact');
 if(packet.change.closure.complete?packet.change.closure.fallback!==null:packet.change.closure.fallback===null)errors.push('Q-IMPACT fallback');
 return errors;
}
const cellKey=(v,scn)=>canonical([v.screen,v.state,v.role,v.scope,scn,v.width,v.height,v.mode,v.locale,v.fixture]);
function coversCell(receipt,cell){
 return receipt.domain==='visual'&&receipt.freshness==='CURRENT'&&receipt.execution.result==='PASS'&&
 receipt.visual.scenarios.some(scn=>cellKey(receipt.visual,scn)===cellKey(cell,cell.scenario));
}
function verdict(criteria,findings=[]){
 const applicable=criteria.filter(x=>(x.applicability||'applicable')==='applicable');
 const remaining=findings.filter(x=>['open','accepted-minor'].includes(x.disposition));
 const result=!applicable.length?'NOT_RUN':applicable.some(x=>x.score===0)?'FAIL':applicable.some(x=>x.score===1)||remaining.length?'NEEDS_CHANGES':'PASS';
 return {result,applicable:applicable.length,passed:applicable.filter(x=>x.score===2).length,na:criteria.length-applicable.length};
}
module.exports={canonical,hash,digest,packetErrors,cellKey,coversCell,verdict};

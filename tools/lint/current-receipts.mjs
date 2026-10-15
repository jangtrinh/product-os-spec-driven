import { evidenceKey,handoffReceipt,candidatePinsMatch,reviewVersionsMatch } from './receipt-evidence-key.mjs';
import { canonical,digest } from '../lib/digests.mjs';
import { effectiveFreshness } from './receipt-supersession.mjs';
import { receiptCovers,targetArtifactsMatch } from './record-targets.mjs';
// Every unretired CURRENT observation counts; provenance never chooses a winner.
export function headReceipts(model,receipts,kind,id,pins,artifacts={}) {
  const groups=new Map();
  for(const r of receipts) {
    if(!reviewVersionsMatch(r) || effectiveFreshness(model,r)!=='CURRENT' || !candidatePinsMatch(model,r,kind,id,pins,handoffReceipt(model,r)) || !receiptCovers(model,r,kind,id) || !Object.entries(artifacts).every(([rel,sha])=>r.artifacts?.[rel]===sha && r.review?.inputs?.includes(rel)))continue;
    const key=evidenceKey(model,r,kind,id);
    const group=groups.get(key) || [];group.push(r);groups.set(key,group);
  }
  return [...groups.values()].flatMap(group=>group.filter(r=>!group.some(other=>model.validSupersessions?.get(canonical(other))?.has(r.id))));
}
// Packet snapshots and exported records retain every matching observation.
export function reviewReceipts(model,embedded=[]) {
  const unique=new Map();
  for(const r of [...embedded,...(model.receipts || []).map(x=>x.value),...(model.records?.packets || []).flatMap(x=>x.value.evidence)]) {
    const key=canonical(r);if(!unique.has(key))unique.set(key,r);
  }
  return [...unique.values()];
}
export function approvalEligible(r,valid) {
  const review=r.review,applicable=review?.criteria?.filter(c=>(c.applicability || 'applicable')==='applicable') || [];
  return valid?.get(r)!==false && r.execution.result==='PASS' && r.execution.exit===0 && r.execution.selected>0 && review?.independent && review.builder!==review.reviewer && ['PASS','NEEDS_CHANGES'].includes(review.verdict) && applicable.length>0 && applicable.every(c=>!c.mandatory || c.score===2) && (review.findings || []).every(f=>!['open','accepted-minor'].includes(f.disposition) || f.severity==='Minor' && f.disposition==='accepted-minor' && f.accepted_by && f.reason && f.follow_up);
}
export function eligibleCurrentReceipts(model,receipts,kind,id,pins,artifacts,valid,context={}) {
  const membership=context.membership || model.records?.candidates?.find(c=>digest(c.value)===pins?.manifest)?.value || model.records?.packets?.find(p=>canonical(p.value.candidate)===canonical(pins) && canonical(p.value.scope)===canonical(context.scope))?.value.membership;
  const us=id.split('.')[0],scenario=kind==='scn'?model.stories.find(s=>s.doc.id===us)?.doc.fm.scenarios?.find(s=>`${us}.${s.id}`===id):null;
  const member=membership?.members?.find(m=>m.kind===kind && m.id===id) || (['ac','scn'].includes(kind)?membership?.members?.find(m=>m.kind==='us' && m.id===us):null) || (scenario?membership?.members?.find(m=>m.kind==='ac' && scenario.ac.includes(m.id.slice(us.length+1)) && m.id.startsWith(us+'.')):null);
  if(!member || !context.scope || !receiptRevisionMatches({scope:context.scope},membership,context.scope) || digest(membership)!==pins?.manifest || member.revision!==digest(member.artifacts) || !targetArtifactsMatch(model,member.artifacts,member.kind,member.id))return [];
  const heads=headReceipts(model,receipts,kind,id,pins,artifacts || member.artifacts);
  return heads.length && heads.every(r=>receiptRevisionMatches(r,membership,context.scope) && approvalEligible(r,valid))?heads:[];
}
export function receiptRevisionMatches(r,membership,scope) {
  const selected=(membership?.members || []).filter(m=>m.kind===r.scope.kind && r.scope.ids.includes(m.id)).sort((a,b)=>a.id.localeCompare(b.id,'en'));
  return ['ac','us'].includes(r.scope.kind)?selected.length===r.scope.ids.length && digest(selected)===r.scope.revision:r.scope.revision===scope?.revision;
}

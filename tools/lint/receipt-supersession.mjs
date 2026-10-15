import { reviewRules } from './rules-review.mjs';
import { evidenceKey } from './receipt-evidence-key.mjs';
import { keyPins,handoffReceipt } from './receipt-evidence-key.mjs';
import fs from 'node:fs';
import { canonical,hash } from '../lib/digests.mjs';
import { parseJson } from '../lib/json-strict.mjs';
import { localPath } from '../lib/local-path.mjs';
import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
import { targetSources,receiptScopeCovers } from './record-targets.mjs';
import { receiptRules } from './rules-receipts.mjs';
export const effectiveFreshness=(model,r)=>r.freshness!=='CURRENT'?r.freshness:model.receiptFreshness?.get(r.id) || r.freshness;
function members(model,r) {
  const scope=r.scope || {},coverage=r.coverage || {};
  const pairs=[...(coverage.ac || []).map(id=>['ac',id]),...(coverage.scenarios || []).map(id=>['scn',id]),...(scope.kind==='us'?(scope.ids || []).map(id=>['us',id]):[])];
  return pairs.filter(([kind,id])=>receiptScopeCovers(model,r,kind,id));
}
function sameBoundSources(model,a,b) {
  const shared=members(model,a).filter(([kind,id])=>members(model,b).some(([k,i])=>k===kind && i===id));
  return shared.length>0 && shared.every(([kind,id])=>{
    const sources=targetSources(model,kind,id);
    return sources.length>0 && sources.every(d=>a.artifacts?.[d.rel] && a.artifacts[d.rel]===b.artifacts?.[d.rel] && a.review?.inputs?.includes(d.rel) && b.review?.inputs?.includes(d.rel));
  });
}
export function prepareReceiptHeads(model,P) {
  const entries=[...(model.receipts || []),...(model.records?.packets || []).flatMap(({file,value:p})=>(p.evidence || []).map(value=>({file,value})))];
  const resident=new Set((model.receipts || []).map(r=>canonical(r.value))),byId=new Map(),valid=model.receiptValidity ||= new Map();
  model.receiptFreshness=new Map();model.validSupersessions=new Map();
  const add=(file,msg)=>P.add('Q-RECEIPT',file,1,msg,'restore a resident CURRENT independent receipt and an exact same-key eval audit witness');
  for(const {file,value:r} of entries) {
    const list=byId.get(r.id) || [];list.push({file,value:r});byId.set(r.id,list);
    const changed=members(model,r).some(([kind,id])=>targetSources(model,kind,id).some(d=>r.artifacts?.[d.rel] && r.artifacts[d.rel]!==hash(d.raw)));
    if(changed)model.receiptFreshness.set(r.id,'STALE');
  }
  for(const [id,list] of byId) {
    const overlay=`review/freshness/${id}.json`;
    if(model.spec.files.includes(overlay))try {
      const value=parseJson(fs.readFileSync(localPath(model.spec.root,overlay),'utf8'));
      if(value.id!==id || !['CURRENT','STALE','MISSING'].includes(value.freshness))throw new Error('overlay id/freshness invalid');
      if(value.freshness!=='CURRENT')model.receiptFreshness.set(id,value.freshness);
    }catch(e){add(overlay,e.message);model.receiptFreshness.set(id,'STALE');}
  }
  for(const {file,value:r} of entries) {
    const schemaErrors=validate(r,loadSchema('evidence-receipt.schema.json'));
    for(const e of schemaErrors)add(file,`${e.path} ${e.message}`);
    const semantic=receiptRules(model,P,file,r);
    valid.set(r,!schemaErrors.length && semantic);
  }
  for(const [id,list] of byId)if(new Set(list.map(x=>canonical(x.value))).size>1)for(const {file,value:r} of list){add(file,`duplicate receipt id with different canonical content: ${id}`);valid.set(r,false);}
  const candidates=new Map();
  for(const {file,value:r} of entries) {
    if(!Array.isArray(r.supersedes) || effectiveFreshness(model,r)!=='CURRENT')continue;
    const reasons=[];
    if(!resident.has(canonical(r)))reasons.push('superseding receipt is not store-resident');
    if(effectiveFreshness(model,r)!=='CURRENT' || valid.get(r)===false)reasons.push('superseding receipt is not CURRENT and valid');
    if(!r.review?.independent || r.review.builder===r.review.reviewer)reasons.push('superseding review is not independent');
    const ids=new Set();
    for(const link of r.supersedes) {
      if(typeof link?.reason!=='string' || !link.reason.trim() || !link.id || ids.has(link.id))reasons.push('supersedes ids/reasons are not nonempty and unique');ids.add(link?.id);
      if(!link || typeof link.id!=='string')continue;
      const target=byId.get(link.id)?.[0]?.value;
      if(target && new Set(byId.get(link.id).map(x=>canonical(x.value))).size>1)reasons.push(`ambiguous supersedes id ${link.id}`);
      if(!target)reasons.push(`dangling supersedes ${link.id}`);
      else if(target.id===r.id)reasons.push('receipt supersedes itself');
      else if(r.domain!==target.domain || canonical(keyPins(r,handoffReceipt(model,r) || handoffReceipt(model,target)))!==canonical(keyPins(target,handoffReceipt(model,r) || handoffReceipt(model,target))) || !sameBoundSources(model,r,target))reasons.push(`supersedes evidence key differs: ${link.id}`);
      if(!model.auditWitnessEvents?.some(e=>e.type==='eval' && e.refs.includes(r.id) && e.refs.includes(link.id)))reasons.push(`missing eval witness for ${r.id} and ${link.id}`);
    }
    candidates.set(r.id,{file,receipt:r,ids,reasons});
  }
  // Settle roots first. A retired observation's outgoing links are inert,
  // so a valid chain never grants transitive retirement authority.
  const remaining=new Map([...candidates].filter(([,c])=>!c.reasons.length)),retired=new Set();
  const reaches=(start,node,seen=new Set())=>{
    if(seen.has(node))return false;seen.add(node);
    return [...(remaining.get(node)?.ids || [])].some(id=>id===start || reaches(start,id,seen));
  };
  while(remaining.size) {
    const roots=[...remaining].filter(([id])=>![...remaining.values()].some(c=>c.ids.has(id)));
    if(!roots.length) {
      const cycles=[...remaining].filter(([id])=>reaches(id,id));
      for(const [id,c] of cycles) {
        add(c.file,'CURRENT supersession forms a cycle');for(const {value:r} of byId.get(id))valid.set(r,false);remaining.delete(id);
      }
      continue;
    }
    for(const [id,c] of roots){model.validSupersessions.set(canonical(c.receipt),c.ids);remaining.delete(id);for(const target of c.ids)retired.add(target);}
    for(const id of retired)remaining.delete(id);
  }
  for(const [id,c] of candidates)if(c.reasons.length && !retired.has(id)){add(c.file,c.reasons.join('; '));for(const {value:r} of byId.get(id))valid.set(r,false);}
  for(const {file,value:r} of entries)if(effectiveFreshness(model,r)==='CURRENT' && r.execution?.result==='PASS') {
    const targets=members(model,r),head=!targets.length || targets.some(([kind,id])=>![...model.validSupersessions].some(([source,ids])=>{
      if(!ids.has(r.id))return false;
      const superseder=entries.find(e=>canonical(e.value)===source)?.value;
      return superseder && receiptScopeCovers(model,superseder,kind,id) && evidenceKey(model,superseder,kind,id)===evidenceKey(model,r,kind,id);
    }));
    if(head){const before=P.errors.length;reviewRules(P,file,r.review,true);if(P.errors.length!==before)valid.set(r,false);}
  }
  model.receiptWitness={status:model.auditWitnessEvents?.length?'CHECKED':'NOT_RUN',checked:model.auditWitnessEvents?.length || 0,reason:model.auditWitnessEvents?.length?null:!model.manifest.gate_model?.records?'no gate_model.records':'exported audit history absent or empty'};
}

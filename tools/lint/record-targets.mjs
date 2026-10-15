import { hash } from '../lib/digests.mjs';
import { parseAcTable } from '../lib/structure.mjs';
export function targetExists(model,kind,id) {
  return targetSources(model,kind,id).length>0;
}
export function referenceExists(model,records,id) {
  return model.decisions.some(d=>d.id===id) || model.docs.some(d=>d.id===id) || ['ac','scn','us','req'].some(k=>targetExists(model,k,id)) || Object.values(records).flat().some(r=>r.value.id===id);
}
export function targetSources(model,kind,id) {
  const us=id.split('.')[0];
  if(kind==='ac')return [...model.stories.filter(s=>s.ac.rows.some(a=>`${s.doc.id}.${a.id}`===id)).map(s=>s.doc),...model.contractDocs.filter(d=>parseAcTable(d).rows.some(a=>`${d.id}.${a.id}`===id))];
  if(kind==='scn')return model.stories.filter(s=>s.doc.id===us && s.doc.fm.scenarios?.some(x=>`${us}.${x.id}`===id)).map(s=>s.doc);
  if(kind==='us')return model.stories.filter(s=>s.doc.id===id).map(s=>s.doc);
  if(kind==='req')return model.reqs.filter(r=>r.id===id).map(r=>r.doc);
  return [];
}
export function targetArtifactsMatch(model,artifacts,kind,id) {
  const sources=targetSources(model,kind,id);
  return sources.length>0 && sources.every(d=>artifacts?.[d.rel]===hash(d.raw));
}
export function receiptSourceBound(model,r,kind,id) {
  return targetArtifactsMatch(model,r.artifacts,kind,id) && targetSources(model,kind,id).every(d=>r.review?.inputs?.includes(d.rel));
}
export function receiptCovers(model,r,kind,id) {
  return receiptSourceBound(model,r,kind,id) && receiptScopeCovers(model,r,kind,id);
}
export function receiptScopeCovers(model,r,kind,id) {
  const s=r.scope || {},cov=r.coverage || {},us=id.split('.')[0];
  if(kind==='ac')return cov.ac?.includes(id) && (s.kind==='ac' && s.ids.includes(id) || s.kind==='us' && s.ids.includes(us) || ['stage','bundle'].includes(s.kind));
  if(kind==='us')return s.kind==='us' && s.ids.includes(id) || ['stage','bundle'].includes(s.kind) && model.stories.find(x=>x.doc.id===id)?.ac.rows.every(a=>cov.ac?.includes(`${id}.${a.id}`));
  if(kind==='scn') {
    const scn=model.stories.find(s=>s.doc.id===us)?.doc.fm.scenarios?.find(s=>`${us}.${s.id}`===id);
    return cov.scenarios?.includes(id) && (scn?.ac || []).some(a=>receiptCovers(model,r,'ac',`${us}.${a}`));
  }
  return false;
}
export function amendmentFor(model,ref) {
  const matches=model.withAmend.flatMap(x=>x.amend.items.filter(a=>ref===`${x.doc.id}.${a.id}` || ref===a.id).map(a=>({doc:x.doc,amendment:a})));
  return matches.length===1?matches[0]:null;
}
export function amendmentCovers(model,amendment,kind,id) {
  const ids=amendment.rows.flatMap(row=>(row.cells[2] || '').split(/[\s,;]+/));
  if(kind==='ac')return ids.includes(id);
  const us=id.split('.')[0],scn=model.stories.find(s=>s.doc.id===us)?.doc.fm.scenarios?.find(s=>`${us}.${s.id}`===id);
  return ids.includes(id) || scn?.ac?.some(a=>ids.includes(`${us}.${a}`));
}

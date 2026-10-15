import { canonical } from '../lib/digests.mjs';
import { targetSources } from './record-targets.mjs';
import { hasDependencyCensus,causalEdge } from './source-dependency-census.mjs';
const WIDE=new Set(['head','base','manifest']);
export function handoffReceipt(model,r) {
  return r.scope?.kind==='stage' && r.scope.ids.includes('handoff') || (model.records?.gates || []).some(({value:g})=>(g.receipts?.includes(r.id) || canonical(g.candidate)===canonical(r.pins)) && model.records.definitions.some(d=>d.value.id===g.definition.id && d.value.version===g.definition.version && d.value.stage==='handoff'));
}
export function keyPins(r,handoff=false) {
  return {revision:r.scope?.revision,evaluator:r.review?.evaluator_version,rules:r.review?.ruleset_version,...Object.fromEntries(Object.entries(r.pins || {}).filter(([key])=>handoff || !WIDE.has(key)))};
}
export function reviewVersionsMatch(r) {
  return [['evaluator','evaluator_version'],['rules','ruleset_version']].every(([pin,version])=>r.pins?.[pin]===undefined || r.pins[pin]===r.review?.[version]);
}
export function evidenceKey(model,r,kind,id,handoff=handoffReceipt(model,r)) {
  const sources=Object.fromEntries(targetSources(model,kind,id).map(d=>[d.rel,r.artifacts?.[d.rel]]));
  return canonical({kind,id,domain:r.domain,pins:keyPins(r,handoff),sources});
}
export function noImpactProof(model,kind,id,pins) {
  const graph=model.graph,target=`${kind==='scn'?'scenario':kind}:${id}`;
  if(!graph?.complete || model.graphValid===false || !hasDependencyCensus(model,[target]))return false;
  const changes=[...(model.records?.packets || []).filter(p=>canonical(p.value.candidate)===canonical(pins)).map(p=>p.value.change),...(model.changeSets || []).filter(c=>canonical(c.value.candidate)===canonical(pins)).map(c=>({...c.value,closure:{complete:graph.complete,fallback:null}}))];
  if(!changes.length)return false;
  const nodes=new Set(graph.nodes.map(n=>n.id));
  return changes.every(c=>{
    if(!c.closure?.complete || c.closure.fallback!==null || !c.impact?.length || c.impact.some(i=>i.classification==='unknown' || !nodes.has(i.node) || (i.path || []).some(n=>!nodes.has(n))))return false;
    if(!hasDependencyCensus(model,c.impact.flatMap(i=>[i.node,...i.path || []])))return false;
    const reached=new Set(c.impact.flatMap(i=>[i.node,...i.path || []])),queue=[...reached];
    for(let i=0;i<queue.length;i++)for(const e of graph.edges)if(e.from===queue[i] && causalEdge(e)) {
      if(!nodes.has(e.to))return false;
      if(!reached.has(e.to)){reached.add(e.to);queue.push(e.to);}
    }
    return !reached.has(target);
  });
}
export function candidatePinsMatch(model,r,kind,id,pins,handoff=false) {
  if(!Object.entries(pins || {}).every(([key,value])=>!handoff && WIDE.has(key) || r.pins?.[key]===value))return false;
  const wideMatch=[...WIDE].every(key=>pins?.[key]===undefined || r.pins?.[key]===pins[key]);
  return wideMatch || !handoff && noImpactProof(model,kind,id,pins);
}

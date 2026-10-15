import {localPath} from './local-path.mjs';
import {graphConformanceView} from './graph-certification-boundary.mjs';

const noncausal=new Set(['mentions','history','supersedes']);
export const causalGraphEdge=edge=>edge.causal!==false&&!noncausal.has(edge.relation);
export const matchesCensusEdge=(actual,required)=>actual.from===required.from&&actual.to===required.to&&actual.relation===required.relation&&causalGraphEdge(actual);

export function censusNodeProblem(census,node) {
  if(!node || node.kind!==node.id?.split(':')[0] || !node.revision || typeof node.source!=='string')return 'missing identity, kind, revision or source';
  const sources=census.nodeSources.get(node.id);
  if(sources&&!sources.has(node.source))return `source does not declare ${node.id}`;
  if(census.corpus.root)try{localPath(census.corpus.root,node.source.split('#')[0]);}catch(error){return error.message;}
  return null;
}

// Extraction completeness and exported-graph completeness are separate proofs.
export function censusGraphConformance(full,graph,targets, {whole = false} = {}) {
  const census = graphConformanceView(full);
  const issues=[];
  if (!whole && targets.some(id => census.omitted.has(id))) issues.push({type:'certificate-target', problem:'No-impact proof for an omitted graph certificate is unavailable'});
  if(!census.complete)issues.push(...census.unresolved.filter(r=>r.causal).map(r=>({type:'unresolved',...r})));
  if(!Array.isArray(graph?.nodes)||!Array.isArray(graph?.edges))return {complete:false,issues:[{type:'shape'}]};
  const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
  if(nodes.size!==graph.nodes.length)issues.push({type:'duplicate-node'});
  const required=census.edges.filter(e=>e.causal),queue=targets.filter(id=>!census.omitted.has(id)),seen=new Set();
  for(const id of queue) {
    if(seen.has(id))continue;seen.add(id);
    const node=nodes.get(id),problem=censusNodeProblem(census,node);
    if(problem){issues.push({type:'node',id,problem});continue;}
    for(const edge of required.filter(e=>e.from===id||e.to===id)) {
      if(!graph.edges.some(e=>matchesCensusEdge(e,edge)))issues.push({type:'edge',...edge});
      queue.push(edge.from,edge.to);
    }
    for(const edge of graph.edges.filter(e=>e.to===id&&causalGraphEdge(e)))queue.push(edge.from);
  }
  return {complete:issues.length===0,issues};
}

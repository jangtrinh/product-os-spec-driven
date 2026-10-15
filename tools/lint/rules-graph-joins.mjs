import {localPath} from '../lib/local-path.mjs';
import {lintCensus} from './source-dependency-census.mjs';
import {censusNodeProblem,matchesCensusEdge} from '../lib/census-graph-conformance.mjs';

export function graphJoins(model,P,file,graph) {
  const ids=new Set((graph.nodes??[]).map(n=>n.id)),edges=graph.edges??[];
  const add=(code,message)=>P.add(code,file,1,message,'restore source-backed typed dependencies and consumer coverage');
  let census;
  try{census=lintCensus(model);}catch(error){add('Q-GRAPH',error.message);return;}
  for(const ref of census.unresolved.filter(r=>r.causal))add('Q-GRAPH',`unresolved registry reference ${ref.entry} in ${ref.source}`);
  for(const edge of census.edges.filter(e=>e.causal)) {
    if(graph.complete&&/^(component|pattern):/.test(edge.from)&&ids.has(edge.from)&&!ids.has(edge.to))add('Q-IMPACT',`shared consumer census missing ${edge.from} -> ${edge.to}`);
    if(ids.has(edge.from)&&ids.has(edge.to)&&!edges.some(e=>matchesCensusEdge(e,edge)))add('Q-GRAPH',`missing causal dependency ${edge.from} -> ${edge.to}`);
  }
  for(const node of graph.nodes??[]) {
    const problem=censusNodeProblem(census,node);
    if(problem)add('Q-GRAPH',`${node.id}: ${problem}`);
  }
  for(const edge of edges)try{localPath(model.spec.root,edge.source.split('#')[0]);}catch(error){add('Q-GRAPH',error.message);}
}

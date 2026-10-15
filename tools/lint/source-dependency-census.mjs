import {declaredRelationCensus} from '../lib/declared-relation-census.mjs';
import {projectCensusModel} from '../lib/census-source-corpus.mjs';
import {causalGraphEdge,matchesCensusEdge,censusGraphConformance} from '../lib/census-graph-conformance.mjs';
export const causalEdge=causalGraphEdge;
export const matchesDeclaration=matchesCensusEdge;
export const lintCensus=declaredRelationCensus;
export const sourceDependencyEdges=(model,options)=>lintCensus(model,options).edges.map(({provenance,...edge})=>({...edge,source:provenance[0].source}));
export function hasDependencyCensus(model,targets) {
  try{
    const current = model.censusProject ? projectCensusModel(model.censusProject.root,model.censusProject.config)
      : model.spec?.root ? projectCensusModel(model.spec.root,{project:{spec_root:'.'}}) : model;
    return censusGraphConformance(lintCensus(current),model.graph,targets).complete;
  }catch{return false;}
}

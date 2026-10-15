import {declaredRelationCensus} from '../lib/declared-relation-census.mjs';
import {projectCensusModel} from '../lib/census-source-corpus.mjs';
import {censusGraphConformance} from '../lib/census-graph-conformance.mjs';

export const runnerCensus=(root,config,graph,files=[],options)=>declaredRelationCensus(projectCensusModel(root,config,graph,files),options);
export function dependencyCensus(root,config,graph,files=[]) {
  const inspect=(targets,whole=false)=>{
    check.reason=null;
    try {
      const census=runnerCensus(root,config,graph,files);
      if(!census.complete)check.reason=`unresolved census references: ${census.unresolved.filter(r=>r.causal).map(r=>r.entry).join(', ')}`;
      return censusGraphConformance(census,graph,whole?[...census.nodes.keys(),...graph.nodes.map(n=>n.id)]:targets,{whole}).complete;
    }
    catch(error){check.reason=`census extraction failed: ${error.message}`;return false;}
  };
  const check=member=>{
    const targets=[`${member.kind}:${member.id}`,...Object.keys(member.artifacts??{}).map(file=>`artifact:${file}`)];
    return inspect(targets);
  };
  check.complete=()=>inspect([],true);
  check.reason=null;
  return check;
}

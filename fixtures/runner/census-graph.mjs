import fs from 'node:fs';
import path from 'node:path';
import {declaredRelationCensus} from '../../tools/lib/declared-relation-census.mjs';
import {projectCensusModel} from '../../tools/lib/census-source-corpus.mjs';
import {graphConformanceView} from '../../tools/lib/graph-certification-boundary.mjs';

// Fixture graph export; tests independently assert and remove the expected edges.
export function censusGraph(model) {
  const census = graphConformanceView(declaredRelationCensus(model)), nodes = new Map();
  if (!census.complete) throw Error(JSON.stringify(census.unresolved));
  function node(id, source) {
    if (nodes.has(id)) return;
    const kind = id.split(':')[0], value = id.slice(kind.length + 1);
    let file = census.nodes.get(id);
    if (!file && kind === 'artifact' && census.corpus.root && fs.existsSync(path.join(census.corpus.root, value.split('#')[0]))) file = value;
    if (!file && kind === 'board') file = model.boardFiles?.find(b => b.id === value)?.file;
    nodes.set(id, {id, kind, source: file ?? source, revision: '1'});
  }
  const edges = census.edges.filter(e => e.causal).map(e => {
    const source = e.provenance[0].source;
    node(e.from, source); node(e.to, source);
    return {from: e.from, to: e.to, relation: e.relation, source, revision: '1'};
  });
  return {version: '1', complete: true, nodes: [...nodes.values()], edges};
}
export const projectCensusGraph = p => censusGraph(projectCensusModel(p.root, p.config));

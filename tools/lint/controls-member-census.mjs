import {lintSpec} from './index.mjs';
import fs from 'node:fs';
import path from 'node:path';

// Lint-test support: no shipped entry point imports this file; the kit-only fixtures/ are loaded when it is.
const {censusGraph}=await import('../../fixtures/runner/census-graph.mjs');

export function completeMemberGraph(t,{replace=false}={}) {
  const required = censusGraph(lintSpec(t.root).model);
  const original=fs.readFileSync(path.join(t.root,'assets/graph.json'),'utf8'),graph=replace?required:JSON.parse(original);
    for (const node of required.nodes) if (!graph.nodes.some(n => n.id === node.id)) graph.nodes.push(node);
    for (const edge of required.edges) if (!graph.edges.some(e => e.from === edge.from && e.to === edge.to && e.relation === edge.relation)) graph.edges.push(edge);
  const bytes=JSON.stringify(graph,null,2)+'\n';
  if(bytes!==original)t.write('assets/graph.json',bytes);
}

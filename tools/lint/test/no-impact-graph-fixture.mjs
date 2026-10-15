import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {read} from '../controls-evidence-heads.mjs';

export function assertFinalGraph(t) {
  const graph=read(t,'assets/graph.json');
  for(const node of graph.nodes)assert.ok(fs.existsSync(path.join(t.root,node.source.split('#')[0])),node.source);
  for(const [from,to] of [
    ['artifact:us/US-01.md','us:US-01'],
    ['us:US-01','ac:US-01.AC-01'],
    ['req:REQ-01','us:US-01'],
  ])assert.ok(graph.edges.some(e=>e.from===from&&e.to===to),`${from} -> ${to}`);
  const packet=t.files().find(f=>f.endsWith('/packet-data.json'));
  assert.equal(graph.nodes.find(n=>n.id==='artifact:open-1').source,packet);
  assert.ok(graph.nodes.some(n=>n.id===`artifact:${packet}`));
  return graph;
}

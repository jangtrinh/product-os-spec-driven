import fs from 'node:fs';
import path from 'node:path';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {graphReceipt} from '../../../fixtures/runner/amendment-controls.mjs';
import {projectCensusGraph} from '../../../fixtures/runner/census-graph.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';

export function certificateFixture(t) {
  const p = batchFixture(t);
  let graph = projectCensusGraph(p); p.write(p.config.gates.graph, graph); graphReceipt(p);
  graph = projectCensusGraph(p); p.write(p.config.gates.graph, graph);
  const proof = graphReceipt(p), file = `review/candidates/${proof.pins.manifest}.json`;
  const manifest = JSON.parse(fs.readFileSync(path.join(p.root, file), 'utf8'));
  return {p, graph, proof, file, manifest};
}
export function writeCandidate(p, members) {
  const manifest = {version:'1', members: members.map(member => ({...member, revision:sha256(canonical(member.artifacts))}))};
  const file = `review/candidates/${sha256(canonical(manifest))}.json`;
  p.write(file, manifest); return {file, manifest};
}
export const remove = (p, file) => fs.rmSync(path.join(p.root, file));

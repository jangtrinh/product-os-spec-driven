import test from 'node:test';
import assert from 'node:assert/strict';
import {installedProject, authoredSources, pairedCensus} from '../../../fixtures/runner/installed-project-census.mjs';
import {projectCensusGraph} from '../../../fixtures/runner/census-graph.mjs';
import {dependencyCensus} from '../dependency-census.mjs';
import {hasDependencyCensus} from '../../lint/source-dependency-census.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {hashes} from '../../lib/config/path-selection.mjs';

test('installed-project graph rejects omission of a required real node or edge in both consumers', t => {
  const p = installedProject(t);
  authoredSources(p);
  const original = pairedCensus(p), graph = projectCensusGraph(p);
  const inspect = candidate => {
    assert.equal(dependencyCensus(p.root, p.config, candidate).complete(), true);
    assert.equal(hasDependencyCensus({...projectCensusModel(p.root, p.config), graph: candidate}, ['us:US-102']), true);
  };
  inspect(graph);
  const required = graph.edges.find(edge => edge.from === 'us:US-101' && edge.to === 'artifact:context/templates/change-set.md' && edge.relation === 'uses');
  assert.ok(required, 'The real trace prerequisite must exist before omission');
  for (const state of ['node', 'edge']) {
    const omitted = structuredClone(graph);
    if (state === 'node') omitted.nodes = omitted.nodes.filter(node => node.id !== 'us:US-101');
    else omitted.edges = omitted.edges.filter(edge => !(edge.from === required.from && edge.to === required.to && edge.relation === required.relation));
    assert.equal(dependencyCensus(p.root, p.config, omitted).complete(), false);
    assert.equal(hasDependencyCensus({...projectCensusModel(p.root, p.config), graph: omitted}, ['us:US-102']), false);
    inspect(graph);
  }
  assert.equal(pairedCensus(p).bytes, original.bytes);
  assert.deepEqual(hashes(p.root, p.templates), p.templateHashes);
  t.diagnostic('NEGATIVE-CONTROLS ' + JSON.stringify({missingNode: 'refused', missingEdge: 'refused', restored: true, edges: original.lint.edges.length, digest: original.digest}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {installedSnapshot, assertInstallation, consumers, assertPaired} from '../../../fixtures/runner/kit-content-census.mjs';
import {pairedCensus} from '../../../fixtures/runner/installed-project-census.mjs';
import {projectCensusGraph} from '../../../fixtures/runner/census-graph.mjs';
import {dependencyCensus} from '../dependency-census.mjs';
import {hasDependencyCensus} from '../../lint/source-dependency-census.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {hashes} from '../../lib/config/path-selection.mjs';

for (const specRoot of ['spec', 'specs/current']) test(`installed ${specRoot} retains required authored and selected kit node/edge obligations`, t => {
  const p = installedSnapshot(t, specRoot, {authored: true});
  assertInstallation(assert, p);
  const selectedSnapshot = p.receipt.snapshots.find(row => row.original === 'templates/change-set.md').file;
  p.config.stages.intake.context.push(selectedSnapshot);
  p.write('config/pipeline.yaml', p.config);
  const original = pairedCensus(p), graph = projectCensusGraph(p);
  const accepted = (candidate, expected, target = 'us:US-102') => {
    assert.equal(dependencyCensus(p.root, p.config, candidate).complete(), expected);
    assert.equal(hasDependencyCensus({...projectCensusModel(p.root, p.config), graph: candidate}, [target]), expected);
  };
  accepted(graph, true);
  const source = p.authored.consumer;
  const required = [
    {from: 'us:US-101', to: `artifact:${source}`, target: 'us:US-102'},
    {from: 'artifact:templates/change-set.md', to: 'artifact:config/pipeline.yaml', target: 'artifact:config/pipeline.yaml'},
    {from: 'artifact:evals/cases/ui-feature/candidate/ux/inventory.md', to: 'artifact:config/pipeline.yaml', target: 'artifact:config/pipeline.yaml'},
    {from: `artifact:${selectedSnapshot}`, to: 'artifact:config/pipeline.yaml', target: 'artifact:config/pipeline.yaml'},
  ];
  for (const {from, to, target} of required) {
    const edge = graph.edges.find(row => row.from === from && row.to === to && row.relation === 'uses');
    assert.ok(edge, `Required edge ${from} -> ${to}`);
    for (const omission of ['node', 'edge']) {
      const candidate = structuredClone(graph);
      if (omission === 'node') candidate.nodes = candidate.nodes.filter(node => node.id !== from);
      else candidate.edges = candidate.edges.filter(row => !(row.from === from && row.to === to && row.relation === edge.relation));
      accepted(candidate, false, target);
      accepted(graph, true, target);
    }
  }
  assert.equal(pairedCensus(p).bytes, original.bytes);
  t.diagnostic('RESTORED-GRAPH ' + JSON.stringify({specRoot, controls: required, missingNode: 'refused', missingEdge: 'refused', restored: true}));
});

test('real data corruption and selected kit deletion refuse independently and restore exact census bytes', t => {
  const p = installedSnapshot(t, 'spec', {authored: true});
  assertInstallation(assert, p);
  const selectedSnapshot = p.receipt.snapshots.find(row => row.original === 'templates/change-set.md').file;
  p.config.stages.intake.context.push(selectedSnapshot);
  p.write('config/pipeline.yaml', p.config);
  const original = pairedCensus(p), graph = projectCensusGraph(p);
  const files = ['context/screen-inventory.json', 'templates/change-set.md', 'evals/cases/ui-feature/candidate/ux/inventory.md', selectedSnapshot];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(p.root, file));
    for (const state of file.endsWith('.json') ? ['missing', 'malformed'] : ['missing']) {
      if (state === 'missing') fs.unlinkSync(path.join(p.root, file)); else p.write(file, '{broken');
      const pair = consumers(p);
      assert.match(pair.lint.error, state === 'malformed' ? /JSON/ : /missing|Missing/);
      assert.match(pair.runner.error, state === 'malformed' ? /JSON/ : /missing|Missing/);
      assert.equal(dependencyCensus(p.root, p.config, graph).complete(), false);
      assert.equal(hasDependencyCensus({censusProject: {root: p.root, config: p.config}, graph}, ['artifact:config/pipeline.yaml']), false);
      p.write(file, raw.toString());
      const restored = consumers(p);
      assertPaired(assert, p, restored);
      assert.equal(pairedCensus(p).bytes, original.bytes);
      assert.equal(dependencyCensus(p.root, p.config, graph).complete(), true);
    }
  }
  assert.deepEqual(hashes(p.root, p.templates), p.templateHashes);
  assert.deepEqual(hashes(p.root, Object.keys(p.receipt.before.cases)), p.receipt.before.cases);
  t.diagnostic('RESTORED-BYTES ' + JSON.stringify({files, originalDigest: original.digest, templatesUnchanged: true, corpusUnchanged: true}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {installedProject, installationSources, pairedCensus, authoredSources} from '../../../fixtures/runner/installed-project-census.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {lintCensus, hasDependencyCensus} from '../source-dependency-census.mjs';
import {runnerCensus, dependencyCensus} from '../../run/dependency-census.mjs';
import {hashes} from '../../lib/config/path-selection.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {projectCensusGraph} from '../../../fixtures/runner/census-graph.mjs';
import {exportedFixture, repo} from './census-parity-fixtures.mjs';

test('SPEC section 11 installed project retains templates without admitting their authored declarations', t => {
  const p = installedProject(t);
  assert.equal(p.minimumLint.exit, 0, p.minimumLint.stdout + p.minimumLint.stderr);
  assert.equal(JSON.parse(p.minimumLint.stdout).ok, true, 'The installed lint CLI must actually emit its result');
  assert.deepEqual(p.templateHashes, p.kitTemplateHashes);
  t.diagnostic('INSTALL ' + JSON.stringify({sources: installationSources, specRoot: p.specRoot, templates: p.templateHashes, casesAvailable: p.casesAvailable, minimumLint: p.minimumLint}));
  const capture = action => {try {return {census: action()};} catch (error) {return {error: error.message};}};
  const lint = capture(() => lintCensus(projectCensusModel(p.root, p.config)));
  const runner = capture(() => runnerCensus(p.root, p.config));
  t.diagnostic('CONSUMERS ' + JSON.stringify({lint: lint.error ?? 'extracted', runner: runner.error ?? 'extracted'}));
  assert.equal(lint.error, undefined, 'lint must extract a freshly installed project');
  assert.equal(runner.error, undefined, 'runner must extract a freshly installed project');
  assert.deepEqual(lint.census.edges, runner.census.edges);
  assert.equal(lint.census.complete, true);
  assert.deepEqual(lint.census.unresolved, []);
  assert.ok(!lint.census.corpus.docs.some(doc => doc.rel.startsWith('templates/')));
  assert.ok(!lint.census.edges.some(edge => edge.provenance.some(ref => ref.source.startsWith('templates/'))));
  assert.deepEqual(hashes(p.root, p.templates), p.templateHashes);
});

for (const specRoot of ['spec', 'specs/current']) test(`installed ${specRoot} preserves authored sources, external data and selected template prerequisites`, t => {
  const p = installedProject(t, specRoot), authored = authoredSources(p);
  const {lint, runner, bytes, digest} = pairedCensus(p);
  assert.equal(bytes, canonical(runner.edges));
  assert.equal(lint.complete, true);
  assert.equal(runner.complete, true);
  assert.deepEqual(lint.unresolved, runner.unresolved);
  assert.deepEqual(lint.unresolved, []);
  for (const [id, file] of [['us:US-101', authored.source], ['us:US-102', authored.consumer], ['screen-state:S91/normal', 'context/screen-inventory.json']])
    assert.ok(lint.nodeSources.get(id)?.has(file), `Required authored identity ${id}`);
  for (const [from, to] of [['us:US-101', 'artifact:context/templates/change-set.md'], ['artifact:context/templates/change-set.md', 'us:US-102'],
    ['artifact:context/screen-inventory.json', 'artifact:context/screen-inventory.md'],
    ['artifact:context/flow.md', 'screen-state:S91/normal'], ['artifact:context/data.json', 'screen-state:S91/normal'],
    ['artifact:templates/change-set.md', 'artifact:config/pipeline.yaml']])
    assert.ok(lint.edges.some(e => e.from === from && e.to === to && e.causal), `Required causal binding ${from} -> ${to}`);
  assert.ok(![...lint.nodeSources.values()].some(sources => [...sources].some(file => file.startsWith('templates/'))));
  assert.ok(!lint.edges.some(e => e.provenance.some(ref => ref.source.startsWith('templates/'))));
  assert.deepEqual(hashes(p.root, p.templates), p.templateHashes);
  t.diagnostic('SEMANTIC-PARITY ' + JSON.stringify({specRoot, edges: lint.edges.length, digest, complete: true, templatesUnchanged: true}));
});

test('template exclusion survives explicit file and graph-source admission without hiding similar project paths', t => {
  const p = installedProject(t);
  authoredSources(p);
  for (const [file, id] of [['spec/templates/US-103.md', 'US-103'], ['templates-project/US-104.md', 'US-104']])
    p.write(file, `---\nid: ${id}\ntype: us\n---\n`);
  const graph = {nodes: [{id: 'artifact:templates/change-set.md', source: './templates/change-set.md'}]};
  const {lint, runner} = pairedCensus(p, graph, ['templates/change-set.md', './templates/change-set.md']);
  assert.deepEqual(lint.edges, runner.edges);
  assert.equal(lint.complete, true);
  assert.ok(!lint.corpus.docs.some(doc => /^\.?\/?templates\//.test(doc.rel)));
  assert.equal(lint.nodes.get('us:US-103'), 'spec/templates/US-103.md');
  assert.equal(lint.nodes.get('us:US-104'), 'templates-project/US-104.md');
  assert.equal(lint.nodes.get('us:US-102'), 'context/templates/change-set.md');
  assert.deepEqual(hashes(p.root, p.templates), p.templateHashes);
});

test('spec-only root export filters preloaded kit templates and preserves ordinary sources', () => {
  const p = exportedFixture('fixtures/v2/minimal');
  try {
    fs.cpSync(path.join(repo, 'templates'), path.join(p.root, 'templates'), {recursive: true});
    fs.writeFileSync(path.join(p.root, 'US-105.md'), '---\nid: US-105\ntype: us\n---\n');
    const before = hashes(p.root, ['templates/change-set.md']);
    const {lint, runner} = pairedCensus(p);
    assert.deepEqual(lint.edges, runner.edges);
    assert.equal(lint.complete, true);
    assert.equal(lint.pipelineScope, 'pipeline not in scope');
    assert.equal(lint.nodes.get('us:US-105'), 'US-105.md');
    assert.ok(!lint.corpus.docs.some(doc => doc.rel.startsWith('templates/')));
    assert.deepEqual(hashes(p.root, ['templates/change-set.md']), before);
  } finally {p.cleanup();}
});

test('real referenced data refuses missing or malformed bytes and restores exact parity', t => {
  const p = installedProject(t);
  authoredSources(p);
  const original = pairedCensus(p), graph = projectCensusGraph(p);
  const file = path.join(p.root, 'context/screen-inventory.json'), raw = fs.readFileSync(file);
  for (const state of ['missing', 'malformed']) {
    if (state === 'missing') fs.unlinkSync(file); else fs.writeFileSync(file, '{broken');
    assert.throws(() => lintCensus(projectCensusModel(p.root, p.config)), state === 'missing' ? /path missing.*context\/screen-inventory.json/ : /JSON/);
    assert.throws(() => runnerCensus(p.root, p.config), state === 'missing' ? /path missing.*context\/screen-inventory.json/ : /JSON/);
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), false);
    assert.equal(hasDependencyCensus({...projectCensusModel(p.root, p.config), graph}, ['us:US-101']), false);
    p.write('context/screen-inventory.json', raw.toString());
    const restored = pairedCensus(p);
    assert.equal(restored.bytes, original.bytes);
    assert.equal(canonical(restored.runner.edges), original.bytes);
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), true);
  }
  assert.deepEqual(hashes(p.root, p.templates), p.templateHashes);
});

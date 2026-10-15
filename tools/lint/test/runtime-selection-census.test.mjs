import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {lintCensus, hasDependencyCensus} from '../source-dependency-census.mjs';
import {runnerCensus, dependencyCensus} from '../../run/dependency-census.mjs';
import {noImpactProof as runnerNoImpact} from '../../run/gate-evidence.mjs';
import {noImpactProof as lintNoImpact} from '../receipt-evidence-key.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {selectFiles, hashes, sha256} from '../../lib/config/path-selection.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {projectCensusGraph} from '../../../fixtures/runner/census-graph.mjs';
import {snapshot} from '../../../fixtures/runner/evidence-head-controls.mjs';
import {runtimeSelectionCases, runtimeSelectionFixture} from './runtime-selection-fixtures.mjs';
import {exportedFixture} from './census-parity-fixtures.mjs';
import {loadConfig} from '../../lib/config/config-loader.mjs';

const configNode = 'artifact:config/pipeline.yaml';
const entryFor = field => ({context: 'pipeline-stages-context', per_file: 'pipeline-evals-per-file', rubric: 'pipeline-review-rubric'})[field];
const leafEdge = (edge, file) => edge.from === `artifact:${file}` && edge.to === configNode && edge.causal;

for (const row of runtimeSelectionCases) test(`runtime selection census ${row[0]}`, () => {
  const p = runtimeSelectionFixture(row);
  try {
    const [, field, selection, problem] = row;
    if (selection === '—') loadConfig(p.root);
    const inspectLint = () => lintCensus(projectCensusModel(p.root, p.config));
    const inspectRunner = () => runnerCensus(p.root, p.config);
    if (problem) {
      assert.throws(() => hashes(p.root, selectFiles(p.root, selection)));
      assert.throws(inspectLint);
      assert.throws(inspectRunner);
      const graph = {nodes: [], edges: [], complete: true};
      assert.equal(dependencyCensus(p.root, p.config, graph).complete(), false);
      assert.equal(hasDependencyCensus({censusProject: {root: p.root, config: p.config}, graph}, [configNode]), false);
      return;
    }
    const expected = selectFiles(p.root, selection), lint = inspectLint(), runner = inspectRunner();
    assert.deepEqual(lint.edges, runner.edges);
    assert.equal(lint.complete, true);
    const selectedLeaf = selection === '—' ? '—' : 'input/extra.txt';
    assert.ok(expected.includes(selectedLeaf));
    for (const file of expected) assert.ok(lint.edges.some(edge => leafEdge(edge, file)
      && edge.provenance.some(ref => ref.entry === entryFor(field))), `Missing selected prerequisite ${file}`);
    if (!/[*?[]/.test(selection)) assert.ok(lint.edges.some(edge => leafEdge(edge, selection)));
    const graph = projectCensusGraph(p);
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), true);
    assert.equal(hasDependencyCensus({...projectCensusModel(p.root, p.config), graph}, [configNode]), true);
    graph.edges = graph.edges.filter(edge => !leafEdge({...edge, causal: true}, selectedLeaf));
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), false);
    assert.equal(hasDependencyCensus({...projectCensusModel(p.root, p.config), graph}, [configNode]), false);
  } finally {p.cleanup();}
});

for (const row of [['glob', 'context', 'input/*.txt'], ...runtimeSelectionCases.filter(row => row[2] === '—' && !row[3])])
test(`${row[0]} impact refuses effective-config no-impact in both consumers without mutation`, () => {
  const p = runtimeSelectionFixture(row);
  try {
    const selectedLeaf = row[2] === '—' ? '—' : 'input/extra.txt';
    const selectedNode = `artifact:${selectedLeaf}`;
    const graph = projectCensusGraph(p);
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), true);
    assert.equal(hasDependencyCensus({...projectCensusModel(p.root, p.config), graph}, [configNode]), true);
    if (!graph.nodes.some(node => node.id === selectedNode))
      graph.nodes.push({id: selectedNode, kind: 'artifact', source: selectedLeaf, revision: '1'});
    const pins = {head: 'fixture-head', base: 'baseline', build: 'not-built', manifest: 'fixture-candidate'};
    const closure = {candidate: pins, impact: [{node: selectedNode, path: [selectedNode], classification: 'direct'}]};
    const artifacts = {'config/pipeline.yaml': sha256(fs.readFileSync(path.join(p.root, 'config/pipeline.yaml')))};
    const member = {kind: 'artifact', id: 'config/pipeline.yaml', artifacts, revision: sha256(canonical(artifacts))};
    const before = snapshot(p);
    const lintProof = candidate => lintNoImpact({...projectCensusModel(p.root, p.config), graph: candidate,
      changeSets: [{value: closure}]}, member.kind, member.id, pins);
    assert.equal(runnerNoImpact(graph, pins, closure, {root: p.root, config: p.config})(null, member), false);
    assert.equal(lintProof(graph), false);
    const omitted = structuredClone(graph);
    omitted.edges = omitted.edges.filter(edge => !leafEdge({...edge, causal: true}, selectedLeaf));
    assert.equal(runnerNoImpact(omitted, pins, closure, {root: p.root, config: p.config})(null, member), false);
    assert.equal(lintProof(omitted), false);
    assert.deepEqual(snapshot(p), before);
  } finally {p.cleanup();}
});

test('optional pre-TDD UI-contract scenarios retain sentinel absence in both censuses', () => {
  const p = exportedFixture('fixtures/v2/full');
  try {
    // The registered pipeline source is a causal prerequisite of the exported root; a graph certifies only when that file exists.
    fs.mkdirSync(path.join(p.root, 'config'));
    fs.writeFileSync(path.join(p.root, 'config/pipeline.yaml'), 'project:\n  spec_root: .\n');
    const file = path.join(p.root, 'ux/ui-contract.md');
    const original = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, original.replace(/SCN-\d+-\d+(?:, SCN-\d+-\d+)*/g, '—'));
    const before = snapshot(p);
    const lint = lintCensus(projectCensusModel(p.root, p.config)), runner = runnerCensus(p.root, p.config);
    assert.deepEqual(lint.edges, runner.edges);
    assert.equal(lint.complete, true);
    assert.equal(runner.complete, true);
    assert.ok(!lint.edges.some(edge => edge.from.endsWith(':—') || edge.to.endsWith(':—')));
    const graph = projectCensusGraph(p);
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), true);
    assert.equal(hasDependencyCensus({...projectCensusModel(p.root, p.config), graph}, [...lint.nodes.keys()]), true);
    assert.deepEqual(snapshot(p), before);
  } finally {p.cleanup();}
});

test('selection additions and deletions invalidate stale graphs and restore exact census bytes', () => {
  const p = runtimeSelectionFixture(['directory', 'context', 'input/']);
  try {
    const census = () => runnerCensus(p.root, p.config);
    const original = census(), graph = projectCensusGraph(p);
    p.write('input/new.txt', 'New selection member\n');
    assert.ok(census().edges.some(edge => leafEdge(edge, 'input/new.txt')));
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), false);
    fs.unlinkSync(path.join(p.root, 'input/new.txt'));
    assert.deepEqual(census().edges, original.edges);
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), true);
    fs.unlinkSync(path.join(p.root, 'input/extra.txt'));
    assert.ok(!census().edges.some(edge => leafEdge(edge, 'input/extra.txt')));
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), false);
    p.write('input/extra.txt', 'Additional original source\n');
    assert.deepEqual(census().edges, original.edges);
    assert.equal(dependencyCensus(p.root, p.config, graph).complete(), true);
  } finally {p.cleanup();}
});

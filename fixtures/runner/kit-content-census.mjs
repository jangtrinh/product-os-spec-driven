import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {installedProject, installationSources, authoredSources} from './installed-project-census.mjs';
import {canonical} from '../../tools/lib/config/strict-json.mjs';
import {inventory, hashes, sha256} from '../../tools/lib/config/path-selection.mjs';
import {loadConfig} from '../../tools/lib/config/config-loader.mjs';
import {lintCensus} from '../../tools/lint/source-dependency-census.mjs';
import {runnerCensus} from '../../tools/run/dependency-census.mjs';
import {projectCensusModel} from '../../tools/lib/census-source-corpus.mjs';

const corpus = fileURLToPath(new URL('./kit-content-corpus/', import.meta.url));
export const corpusProvenance = JSON.parse(fs.readFileSync(path.join(corpus, 'provenance.json'), 'utf8'));
export const capture = action => {try {return {census: action()};} catch (error) {return {error: error.message};}};
export function consumers(p, graph, files) {
  return {lint: capture(() => lintCensus(projectCensusModel(p.root, p.config, graph, files))),
    runner: capture(() => runnerCensus(p.root, p.config, graph, files))};
}

// Run the installed, unchanged CLI to its real manual writer checkpoint.
// Definition/graph/baseline are project setup, not a substitute for runner snapshots.
export function installedSnapshot(t, specRoot = 'spec', {authored = false} = {}) {
  const p = installedProject(t, specRoot);
  if (authored) p.authored = authoredSources(p);
  const originalCases = Object.fromEntries(corpusProvenance.files.map(row => [`evals/cases/${row.path}`, row.sha256]));
  const cases = inventory(p.root, 'evals/cases');
  const before = {templates: p.templateHashes, cases: hashes(p.root, cases)};
  const config = p.config;
  config.stages.intake.context.push('evals/cases/ui-feature/candidate/ux/inventory.md');
  if (authored) config.stages.intake.context.push(p.authored.consumer);
  config.evals.intake = [{run: `node tools/lint/lint.mjs ${specRoot} --pipeline config/pipeline.yaml --stage intake`}];
  const binding = config.gates.stage_definitions.intake;
  const definition = {id: binding.id, version: binding.version, stage: 'intake',
    scope: {kind: 'stage', ids: ['intake'], revision: sha256('initial project scope')},
    inputs: ['input/po-spec.md'], outputs: [`${specRoot}/intake/manual.md`],
    checks: [{id: 'minimum-spec', command: config.evals.intake[0].run, mandatory: true, blocker_policy: 'Every mandatory check passes'}],
    reviewer: 'qc', decider: 'po', transitions: ['advance', 'repair', 'backward', 'exception', 'change-set', 'recovery'],
    invalidation: 'Typed closure; BR-14 on incomplete census', exceptions: [], versions: config.versions};
  p.write(`${config.gates.definitions_dir}/${binding.id}/${binding.version}.json`, definition);
  p.write(config.gates.graph, {version: '1', complete: false,
    nodes: [{id: 'req:original', kind: 'req', source: 'input/po-spec.md', revision: '1'}], edges: []});
  p.write(config.gates.baseline, {id: 'baseline-initial', head: corpusProvenance.sourceHead,
    manifest: sha256(fs.readFileSync(path.join(p.root, specRoot, 'spec.manifest.json')))});
  p.write('config/pipeline.yaml', config);
  p.config = loadConfig(p.root);
  const command = [path.join(p.root, 'tools/run/run.mjs'), '--project', p.root, '--head', corpusProvenance.sourceHead, '--build', 'not-built'];
  const result = spawnSync(process.execPath, command, {cwd: p.root, encoding: 'utf8', timeout: 20000});
  if (result.error) throw result.error;
  const state = JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/intake.json'), 'utf8'));
  const snapshots = Object.entries(state.source_snapshot).map(([original, file]) => ({original, file,
    originalHash: sha256(fs.readFileSync(path.join(p.root, original))), snapshotHash: sha256(fs.readFileSync(path.join(p.root, file)))}));
  const receipt = {cwd: p.root, executable: process.execPath, node: process.version, command,
    sources: installationSources, specRoot, config: p.config, definition,
    baseline: JSON.parse(fs.readFileSync(path.join(p.root, config.gates.baseline))),
    minimumLint: p.minimumLint, runner: {exit: result.status, stdout: result.stdout, stderr: result.stderr},
    corpusProvenance, originalCases, before, after: {templates: hashes(p.root, p.templates), cases: hashes(p.root, cases)}, snapshots};
  return {...p, receipt};
}

export function assertInstallation(assert, p) {
  const r = p.receipt;
  assert.equal(r.minimumLint.exit, 0, r.minimumLint.stdout + r.minimumLint.stderr);
  assert.equal(JSON.parse(r.minimumLint.stdout).ok, true);
  assert.deepEqual(r.before.cases, r.originalCases, 'All real P7 corpus bytes must be installed');
  assert.equal(r.corpusProvenance.count, Object.keys(r.before.cases).length);
  assert.deepEqual(r.before.templates, p.kitTemplateHashes);
  assert.deepEqual(r.after, r.before, 'Runner cannot change kit templates or corpus');
  assert.equal(r.runner.exit, 2, r.runner.stdout + r.runner.stderr);
  assert.match(r.runner.stdout, /Manual writer pending: review\/manual\/intake\.json/);
  for (const source of installationSources) assert.ok(fs.existsSync(path.join(p.root, source)), source);
  for (const s of r.snapshots) {
    assert.match(s.file, /^review\/sources\/intake\/[a-f0-9]{64}\/files\//);
    assert.equal(s.snapshotHash, s.originalHash);
  }
  for (const original of ['templates/change-set.md', 'evals/cases/ui-feature/candidate/ux/inventory.md', 'input/po-spec.md'])
    assert.ok(r.snapshots.some(row => row.original === original), `Actual runner snapshot ${original}`);
}

export function assertPaired(assert, p, pair) {
  assert.equal(pair.lint.error, undefined, 'lint must census the real installed project and runner snapshots');
  assert.equal(pair.runner.error, undefined, 'runner must census the real installed project and runner snapshots');
  assert.equal(pair.lint.census.complete, true);
  assert.equal(pair.runner.census.complete, true);
  assert.deepEqual(pair.lint.census.unresolved, []);
  assert.equal(canonical(pair.lint.census.edges), canonical(pair.runner.census.edges));
  assert.deepEqual(pair.lint.census.nodeSources, pair.runner.census.nodeSources);
  const kit = file => /^(?:templates|evals)\//.test(file) || /^review\/sources\/[^/]+\/[a-f0-9]{64}\/files\/(?:templates|evals)\//.test(file);
  assert.ok(!pair.lint.census.corpus.docs.some(doc => kit(doc.rel)));
  assert.ok(!pair.lint.census.edges.some(edge => edge.provenance.some(ref => kit(ref.source))));
  assert.ok(![...pair.lint.census.nodeSources.values()].some(sources => [...sources].some(kit)));
}

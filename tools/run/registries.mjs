import {definitionRevision} from '../lib/definition-scope.mjs';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {canonical, parseJson} from '../lib/config/strict-json.mjs';
import {hashes, localPath, sha256, RunnerError, selectFiles} from '../lib/config/path-selection.mjs';
import {concreteOutputs} from '../lib/output-patterns.mjs';
import {readRecord, schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {STAGES} from '../lib/config/config-loader.mjs';
import {classifyObservation} from './output-observation.mjs';
import {versionsUsed} from './gate-files.mjs';
import {bindGatesDir, selectDefinitionInputs} from './own-gate-exclusions.mjs';

export function jsonFile(root, relative) { return parseJson(fs.readFileSync(localPath(root, relative), 'utf8'), relative); }
export function loadRegistries(root, config) {
  const definitions = new Map(); const bindings = Object.entries(config.gates.stage_definitions);
  for (const binding of config.gates.scoped_definitions) bindings.push([null, binding]);
  for (const [stage, binding] of bindings) {
    if (stage && !config.stages[stage].enabled) continue;
    const file = `${config.gates.definitions_dir}/${binding.id}/${binding.version}.json`;
    const def = readRecord(root, file, 'gate-definition.schema.json');
    if (!config.stages[def.stage].enabled) continue;
    const usedVersions = versionsUsed(config, def.stage, [def]);
    if (def.id !== binding.id || def.version !== binding.version || (stage && def.stage !== stage) || Object.keys(usedVersions).some(key => def.versions[key] !== usedVersions[key])) throw new RunnerError(`Definition binding/version mismatch: ${file}`);
    if (canonical(def.scope.ids) !== canonical([...def.scope.ids].sort())) throw new RunnerError(`Unsorted scope ids: ${file}`);
    for (const relative of [...def.inputs, ...def.outputs]) localPath(root, relative);
    for (const check of def.checks.filter(row => row.mandatory)) if (!config.evals[def.stage].some(entry => entry.run === check.command)) throw new RunnerError(`evals.${def.stage} omits mandatory definition check ${check.id}: ${check.command}`);
    bindGatesDir(def, config.gates.dir);
    definitions.set(def.id, def);
  }
  const graph = readRecord(root, config.gates.graph, 'dependency-graph.schema.json');
  const ids = new Set();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) throw new RunnerError(`Duplicate graph node: ${node.id}`);
    ids.add(node.id); localPath(root, node.source);
  }
  for (const edge of graph.edges) if (!ids.has(edge.from) || !ids.has(edge.to)) throw new RunnerError(`Unknown graph edge: ${edge.from} -> ${edge.to}`);
  const baseline = config.gates.baseline ? jsonFile(root, config.gates.baseline) : null;
  if (baseline && (Object.keys(baseline).sort().join(',') !== 'head,id,manifest' || Object.values(baseline).some(v => typeof v !== 'string' || !v) || !/^[a-f0-9]{64}$/.test(baseline.manifest))) throw new RunnerError('gates.baseline: expected {id,head,manifest SHA-256}');
  if (config.stages.handoff.enabled && !baseline) throw new RunnerError('gates.baseline required before enabled G5');
  let profile = null;
  if (config.stages.design.enabled || config.stages.uiux.enabled) {
    profile = readRecord(root, config.design_adapter, 'design-profile.schema.json');
    const needed = [...profile.authority.map(row => row.path), profile.tokens.source, ...profile.catalogs.map(row => row.path), profile.rubrics.core, ...profile.rubrics.adapter, ...profile.inputs];
    for (const relative of needed) selectFiles(root, relative);
    if (profile.tokens.generated.includes(profile.tokens.source)) throw new RunnerError('design_adapter tokens source cannot be a generated mirror');
    const manifest = jsonFile(root, `${config.project.spec_root}/spec.manifest.json`);
    if (!manifest.design?.profile || sha256(fs.readFileSync(localPath(root, `${config.project.spec_root}/${manifest.design.profile}`))) !== sha256(fs.readFileSync(localPath(root, config.design_adapter)))) throw new RunnerError('design_adapter exported profile digest mismatch');
    for (const stage of ['design', 'uiux'].filter(s => config.stages[s].enabled)) {
      const supplied = new Set([...config.stages[stage].context.flatMap(relative => selectFiles(root, relative)), ...(config.stages[stage].optional_context ?? []).flatMap(relative => selectFiles(root, relative, {optional:true, preparedText:true}))]);
      for (const file of needed.flatMap(relative => selectFiles(root, relative))) if (!supplied.has(file)) throw new RunnerError(`stages.${stage}.context missing design authority input ${file}`);
    }
  }
  return {definitions, graph, baseline, profile};
}
export function livePins(root, options, baseline, stage) {
  const git = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'});
  const isGit = git.status === 0;
  const headObservation = isGit ? classifyObservation(git.stdout) : null;
  if (isGit && !headObservation.observed) throw new RunnerError(`Git HEAD unavailable: ${headObservation.reason}`, 4);
  const head = isGit ? headObservation.text.trim() : options.head;
  if (!head) throw new RunnerError('--head required outside a git worktree');
  if (!options.build) throw new RunnerError('--build required (use not-built for pre-code review)');
  if (stage === 'handoff' && !baseline) throw new RunnerError('gates.baseline required for G5');
  const status = isGit ? spawnSync('git', ['status', '--porcelain'], {cwd: root, encoding: 'utf8'}) : null;
  if (status && status.status !== 0) throw new RunnerError('git status unavailable', 4);
  return {head, base: baseline?.head ?? head, build: options.build, dirty: status ? classifyObservation(status.stdout).observed : false};
}
export function candidateFor(root, definition, skipped = [], additionalInputs = [], exclude = []) {
  const sources = selectDefinitionInputs(root, definition, {skipped, exclude});
  const artifacts = hashes(root, [...sources, ...additionalInputs, ...concreteOutputs(root, definition.outputs)]);
  const members = definition.scope.ids.map(id => ({kind: definition.scope.kind, id, revision: sha256(canonical(artifacts)), artifacts}));
  const manifest = {version: '1', members};
  const digest = sha256(canonical(manifest));
  const revision = definitionRevision(definition);
  return {manifest, digest, scope: {...definition.scope, revision}};
}
export function checkMembership(root, manifest, expectedDigest) {
  validateSchema(manifest, schema('candidate-manifest.schema.json'), 'candidate manifest');
  if (sha256(canonical(manifest)) !== expectedDigest) throw new RunnerError('Candidate manifest digest mismatch');
  const sorted = [...manifest.members].sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (canonical(sorted) !== canonical(manifest.members)) throw new RunnerError('Candidate members must be sorted');
  const ids = new Set();
  for (const row of manifest.members) {
    const key = `${row.kind}:${row.id}`;
    if (ids.has(key)) throw new RunnerError(`Duplicate candidate member: ${key}`);
    ids.add(key);
    if (sha256(canonical(row.artifacts)) !== row.revision || canonical(hashes(root, Object.keys(row.artifacts))) !== canonical(row.artifacts)) throw new RunnerError(`Stale candidate member: ${key}`);
  }
  return manifest;
}
export function definitionsFor(config, registry, stage) {
  const main = registry.definitions.get(config.gates.stage_definitions[stage].id);
  return [main, ...config.gates.scoped_definitions.map(b => registry.definitions.get(b.id)).filter(d => d?.stage === stage)];
}

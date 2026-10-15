import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadConfig} from '../../tools/lib/config/config-loader.mjs';
import {parseYaml} from '../../tools/lib/config/yaml-parser.mjs';
import {canonical} from '../../tools/lib/config/strict-json.mjs';
import {inventory, hashes, sha256} from '../../tools/lib/config/path-selection.mjs';
import {projectCensusModel} from '../../tools/lib/census-source-corpus.mjs';
import {lintCensus} from '../../tools/lint/source-dependency-census.mjs';
import {runnerCensus} from '../../tools/run/dependency-census.mjs';
import {schema, validateSchema} from '../../tools/lib/config/schema-validation.mjs';
import {parseJson} from '../../tools/lib/json-strict.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
export const installationSources = ['SPEC.md', 'format', 'templates', 'rules', 'prompts', 'tools', 'config/pipeline.yaml', 'evals/cases'];

// SPEC section 11 installation, retaining the copied kit templates unchanged.
// The shipped minimum Format 2 fixture supplies the initial authored documents.
export function installedProject(t, specRoot = 'spec', {casesRoot = path.join(repo, 'fixtures/runner/kit-content-corpus/cases')} = {}) {
  // Resolve macOS temporary aliases so the copied CLI's entrypoint check runs.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'spec-installed-census-')));
  const cleanup = () => fs.rmSync(root, {recursive: true, force: true});
  t?.after(cleanup);
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : canonical(value) + '\n');
  };
  try {
    for (const source of installationSources) {
      fs.mkdirSync(path.dirname(path.join(root, source)), {recursive: true});
      fs.cpSync(source === 'evals/cases' ? casesRoot : path.join(repo, source), path.join(root, source), {recursive: true});
    }
    fs.cpSync(path.join(repo, 'fixtures/v2/minimal'), path.join(root, specRoot), {recursive: true});
    const decisionTemplate = fs.readFileSync(path.join(root, 'templates/decisions.md'), 'utf8').split('<!-- example:')[0];
    write(`${specRoot}/decisions/decisions.md`, decisionTemplate.replace('<document-id>', 'decision-ledger').replace('"<title>"', '"Project decisions"')
      .replace('status: draft', 'status: draft\nledger: true').replace(/^\| D<n> .*\n/m, '| D1 | Initialize with Format 2 | Initial project setup |\n').replace(/^\| <question-id> .*\n/m, '')
      .replace('<Inline US OPEN remains canonical. Deduplicate before asking.>', 'No product questions recorded.\n\nInitialization source: kit SPEC section 11.'));
    const manifest = parseJson(fs.readFileSync(path.join(root, specRoot, 'spec.manifest.json'), 'utf8'));
    manifest.artifacts.push({id: 'decisions', name: 'Decisions', folder: 'decisions'});
    write(`${specRoot}/spec.manifest.json`, manifest);
    for (const dir of ['input', 'context', 'review/log', 'review/gates']) fs.mkdirSync(path.join(root, dir), {recursive: true});
    write('input/po-spec.md', '# Intake\n\nA new project with no authored requirements yet.\n');
    write('context/tech.md', '# Technology\n\nNode CLI, Format 2.\n');
    const config = parseYaml(fs.readFileSync(path.join(root, 'config/pipeline.yaml'), 'utf8'));
    config.project.name = 'installed-census';
    config.project.doc_language = 'en';
    config.project.spec_root = specRoot;
    config.roles.po.approvers = ['po@example.test'];
    // Only intake is ready in this minimum project; enabled stages remain explicit.
    for (const [stage, settings] of Object.entries(config.stages)) {
      settings.enabled = stage === 'intake';
      settings.context = stage === 'intake' ? ['input/po-spec.md', 'templates/change-set.md', `${specRoot}/glossary.md`] : [];
    }
    write('config/pipeline.yaml', config);
    const templates = inventory(root, 'templates');
    const templateHashes = hashes(root, templates);
    const kitTemplateHashes = hashes(repo, inventory(repo, 'templates'));
    const minimumLint = spawnSync(process.execPath, [path.join(root, 'tools/lint/lint.mjs'), path.join(root, specRoot), '--json'], {encoding: 'utf8'});
    if (minimumLint.error) throw minimumLint.error;
    return {root, specRoot, config: loadConfig(root), write, cleanup, templates, templateHashes, kitTemplateHashes,
      casesAvailable: fs.existsSync(casesRoot),
      minimumLint: {exit: minimumLint.status, stdout: minimumLint.stdout, stderr: minimumLint.stderr}};
  } catch (error) {cleanup(); throw error;}
}

export function pairedCensus(p, graph, files = []) {
  const lint = lintCensus(projectCensusModel(p.root, p.config, graph, files));
  const runner = runnerCensus(p.root, p.config, graph, files);
  return {lint, runner, bytes: canonical(lint.edges), digest: sha256(canonical(lint.edges))};
}

export function authoredSources(p) {
  const story = (id, trace = '') => `---\nid: ${id}\ntype: us\ntitle: Authored project requirement\nupdated: "2026-10-09"\n${trace}---\n\n## User Story\nPreserve this project's declared behavior.\n`;
  const source = `${p.specRoot}/us/US-101.md`, consumer = 'context/templates/change-set.md';
  p.write(source, story('US-101'));
  p.write(consumer, story('US-102', 'trace: {us: [US-101]}\n'));
  const outside = '../'.repeat(p.specRoot.split('/').length) + 'context/';
  p.write('context/screen-inventory.md', `---\nid: authored-screens\ntype: screen-inventory\ndata: ${outside}screen-inventory.json\n---\n`);
  p.write('context/flow.md', '# Flow\n');
  p.write('context/data.json', {field: 'authored'});
  const inventory = {version: '1', screens: [{screen: 'S91', state: 'normal', route: '/authored', roles: ['reader'], scope: ['project'], us: ['US-101'], ac: [], scenarios: [],
    flow: outside + 'flow.md', boards: [], components: [], patterns: [], data: outside + 'data.json', source: {kind: 'not-created', ref: null, reason: 'No product visual was authored'},
    availability: 'planned', overlay: 'none', consequences: [], evidence: []}]};
  validateSchema(inventory, schema('screen-inventory.schema.json'), 'authored inventory');
  p.write('context/screen-inventory.json', inventory);
  return {source, consumer, inventory};
}

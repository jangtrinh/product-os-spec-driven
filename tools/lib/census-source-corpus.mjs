import fs from 'node:fs';
import path from 'node:path';
import {loadSpec} from './spec-load.mjs';
import {buildModel} from './doc-model.mjs';
import {splitFrontMatter} from './front-matter.mjs';
import {parseJson} from './json-strict.mjs';
import {parseYaml} from './config/yaml-parser.mjs';
import {localPath} from './local-path.mjs';
import {inventory} from './config/path-selection.mjs';
import {parseTables} from './md.mjs';
import {loadConfig} from './config/config-loader.mjs';
import {kitContentPath} from './kit-content-paths.mjs';

export function projectCensusModel(root, config, graph = {nodes: []}, files = []) {
  // The single pipeline-scope decision: a spec-only export (no config/pipeline.yaml) is review-only and out of pipeline scope.
  const pipelineScope = fs.existsSync(localPath(root, 'config/pipeline.yaml', {missing:true})) ? 'pipeline in scope' : 'pipeline not in scope';
  if (config.gates && pipelineScope === 'pipeline in scope') config = loadConfig(root);
  const prefix = path.posix.normalize(config.project.spec_root).replace(/^\.\/?$/, '');
  const spec = loadSpec(localPath(root, prefix || '.'));
  if (spec.inputError) throw Error(spec.inputError);
  spec.docs.forEach(d=>{d.rel=path.posix.join(prefix,d.rel);});
  const projectDocument = source => !kitContentPath(root, source);
  spec.docs = spec.docs.filter(d => projectDocument(d.rel));
  spec.images=spec.images.map(file=>path.posix.join(prefix,file));
  spec.htmlBoards=spec.htmlBoards.map(file=>path.posix.join(prefix,file));
  const paths = new Set([...files, ...(graph.nodes ?? []).map(n => n.source?.split('#')[0]).filter(Boolean), ...inventory(root).filter(file => file.endsWith('.md') && !(spec.manifest?.tests_root && file.startsWith(path.posix.join(prefix, spec.manifest.tests_root) + '/')))]);
  for (const source of paths) {
    if (!source.endsWith('.md') || !projectDocument(source) || spec.docs.some(d => d.rel === source)) continue;
    const raw = fs.readFileSync(localPath(root, source), 'utf8');
    const parsed = splitFrontMatter(raw);
    const fm = parsed.data ?? (/^(US-(?:P?\d+)|NF-\d+)$/.test(path.posix.basename(source, '.md')) ? {type: 'us', id: path.posix.basename(source, '.md')} : {});
    if (fm.id && fm.type || /```gate-data\s*\n/.test(parsed.body ?? raw)) spec.docs.push({rel: source, raw, ...parsed, data:fm});
  }
  const model=buildModel(spec);
  model.censusProject={root,config,prefix,pipelineScope};
  return model;
}

const recordTypes = {definitions: 'gate-definition', gates: 'gate-state', receipts: 'evidence-receipt', transitions: 'transition', exceptions: 'exception', candidates: 'candidate-manifest', decisions: 'batch-decision', clarify: 'clarify-record', expected: 'expected-change', integration: 'integration-record', integrations: 'integration-record', feedback: 'feedback-record', rounds: 'rounds-ledger'};
export function sourceCorpus(model) {
  const project = model.censusProject;
  const root = project?.root ?? model.spec?.root;
  const specBase = project?.prefix ?? '';
  const payloads = [], seen = new Set();
  const specPath = file => path.posix.join(specBase, file);
  const add = (type, file, data, extra = {}) => {
    const key = `${type}:${file}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (data === undefined) {
      if (!root) return;
      data = parseJson(fs.readFileSync(localPath(root, file), 'utf8'));
    }
    payloads.push({type, file, data, pathBase:specBase, ...extra});
  };
  const docs = (model.docs ?? []).map(d => ({...d, fm: {id: d.id, type: d.type, ...(d.fm ?? d.data ?? {})}}));
  const manifest = model.spec?.manifest;
  if (manifest) {
    add('manifest', specPath('spec.manifest.json'), manifest);
    for (const [key, type] of Object.entries({profile: 'design-profile', inventory: 'screen-inventory', sources: 'design-sources'})) if (manifest.design?.[key]) add(type, specPath(manifest.design[key]));
    for (const file of manifest.design?.evidence ?? []) add('evidence-receipt', specPath(file));
    if (manifest.gate_model?.graph) add('dependency-graph', specPath(manifest.gate_model.graph));
    for (const [key, type] of Object.entries({changes: 'change-set', receipts: 'evidence-receipt'})) for (const file of manifest.gate_model?.[key] ?? []) {
      const doc = docs.find(d => d.rel === specPath(file));
      add(type, doc?.fm.data ? specPath(doc.fm.data) : specPath(file));
    }
    if (model.spec?.epicMap) add('epic-map', specPath('readable/epic-map.json'), model.spec.epicMap);
  }
  for (const doc of docs) if (doc.fm?.data) add(doc.type, specPath(doc.fm.data));
  for (const p of model.censusPayloads ?? []) add(p.type, p.file, p.data, {pathBase:p.pathBase??specBase});
  if (model.inventory && !payloads.some(p => p.type === 'screen-inventory')) add('screen-inventory', specPath(model.manifest?.design?.inventory ?? model.inventoryDoc?.rel ?? 'inventory.json'), model.inventory);
  for (const p of [...payloads]) if (p.type === 'design-profile') for (const catalog of p.data.catalogs ?? []) add(catalog.kind === 'copy' ? 'copy-catalog' : catalog.kind === 'ruling' ? 'rulings-index' : 'ds-catalog', specPath(catalog.path));
  function records(directory) {
    if (!root || !fs.existsSync(localPath(root, directory, {missing: true}))) return;
    for (const file of inventory(root, directory)) {
      const relative = file.slice(directory.length + 1), type = recordTypes[relative.split('/')[0]];
      if (type && file.endsWith('.json')) add(type, file);
      if (relative === 'audit.jsonl') fs.readFileSync(localPath(root, file), 'utf8').split('\n').filter(Boolean).forEach((line, i) => add('audit-event', `${file}#${i + 1}`, parseJson(line)));
      if (/\/packet-data\.json$/.test(file)) add('packet-data', file);
    }
  }
  if (manifest?.gate_model?.records) records(specPath(manifest.gate_model.records));
  // Optional sidecars have fixed discovery paths; a ledger's relative crosswalk is required.
  for (const [type, file] of [['crosswalk', 'provenance/id-crosswalk.json'], ['source-ledger', 'provenance/source-ledger.json']]) if (root && fs.existsSync(localPath(root, specPath(file), {missing: true}))) add(type, specPath(file));
  for (const p of [...payloads]) if (p.type === 'source-ledger') {
    if (typeof p.data.crosswalk !== 'string') throw Error(`Missing source-ledger crosswalk: ${p.file}`);
    add('crosswalk', path.posix.normalize(path.posix.join(path.posix.dirname(p.file), p.data.crosswalk)));
  }
  for (const doc of docs) for (const match of (doc.body ?? '').matchAll(/^ {0,3}```(gate-data|pipeline|yaml|json)\s*\n([\s\S]*?)\n {0,3}```\s*$/gm)) {
    if (!['gate-data', 'pipeline'].includes(match[1]) && path.posix.basename(doc.rel) !== 'SPEC.md') continue;
    const value = ['yaml', 'pipeline'].includes(match[1]) ? parseYaml(match[2]) : parseJson(match[2]);
    if (match[1] === 'gate-data') {
      add('gate-data', `${doc.rel}#gate-data`, value,{pathBase:''});
      if (value.model) add('gate-state', doc.rel, value.model,{pathBase:''});
      if (value.review) add('gate-review', doc.rel, value.review,{pathBase:''});
    } else if (value.project?.spec_root && value.stages && value.gates) add('pipeline', `${doc.rel}#pipeline`, value,{pathBase:''});
  }
  // Out-of-scope exports emit no pipeline node; the scope marker stays on the returned corpus instead.
  if (project?.pipelineScope === 'pipeline in scope') {
    add('pipeline', 'config/pipeline.yaml', project.config,{pathBase:''});
    for (const [field, type] of Object.entries({dir: 'gate-state', definitions_dir: 'gate-definition', receipts_dir: 'evidence-receipt', candidates_dir: 'candidate-manifest', decisions_dir: 'batch-decision', exceptions_dir: 'exception', changes_dir: 'change-set'})) {
      const directory = project.config.gates?.[field];
      if (directory && fs.existsSync(localPath(root, directory, {missing: true}))) for (const file of inventory(root, directory).filter(f => f.endsWith('.json'))) add(type, file,undefined,{pathBase:''});
    }
    if (project.config.gates?.graph && fs.existsSync(localPath(root, project.config.gates.graph, {missing: true}))) add('dependency-graph', project.config.gates.graph,undefined,{pathBase:''});
  }
  const screens = new Map();
  for (const p of payloads.filter(p => p.type === 'screen-inventory')) for (const row of p.data.screens ?? []) {
    const rows = screens.get(row.screen) ?? [];
    if (!rows.some(r => r.state === row.state)) rows.push(row);
    screens.set(row.screen, rows);
  }
  for (const doc of docs.filter(d => ['ui-contract', 'ux'].includes(d.type))) for (const table of parseTables(doc.body ?? '')) for (const row of table.rows) {
    const column = table.header.findIndex(h => /^(Screen|ID)$/.test(h));
    if (column < 0 || !/^S\d{2}(?:-[a-z])?$/.test(row[column])) continue;
    const state = row[table.header.indexOf('State')];
    if (!screens.has(row[column])) screens.set(row[column], [{screen: row[column], state}]);
  }
  const contracts = docs.filter(d => d.type === 'contract');
  return {root, specBase, docs, payloads, screens, primary: contracts.find(d => d.fm?.primary) ?? (contracts.length === 1 ? contracts[0] : null), testsRoot: specPath(manifest?.tests_root ?? model.manifest?.tests_root ?? 'tests'), adapter: payloads.find(p => p.type === 'design-profile')?.data.id ?? model.profile?.id, project, pipelineScope: project?.pipelineScope ?? null, snapshotBase: model.censusSnapshotBase ?? specBase};
}

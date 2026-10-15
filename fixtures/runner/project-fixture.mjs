import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {canonical} from '../../tools/lib/config/strict-json.mjs';
import {gateDefinition} from '../../tools/run/project-registries.mjs';
import {sha256} from '../../tools/lib/config/path-selection.mjs';
import {STAGES, GATE_VALUES, SKILL_REQUIRED_STAGES} from '../../tools/lib/config/config-loader.mjs';

const runner = fileURLToPath(new URL('../../tools/run/run.mjs', import.meta.url));
const agent = fileURLToPath(new URL('./fake-agent.mjs', import.meta.url));
export const command = options => `${JSON.stringify(process.execPath)} ${JSON.stringify(agent)} '${JSON.stringify(options)}'`;
export function projectFixture(t, enabled = ['prd'], settings = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-runner-'));
  t?.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : canonical(value) + '\n');
  };
  const versions = {workflow: '2', templates: '2', ruleset: '2', skill: 'none'};
  const config = {
    version: 2, project: {name: 'runner-fixture', doc_language: 'en', spec_root: 'spec', us_prefix: ''},
    roles: {po: {enabled: true, gate: true, approvers: ['po@example.test']}, qc: {enabled: false, gate: true}, dev: {enabled: false, gate: true}},
    stages: Object.fromEntries(STAGES.map(stage => [stage, {enabled: enabled.includes(stage), owner: stage === 'design' ? 'dev' : stage === 'tdd' ? 'qc' : 'po', context: ['input/po-spec.txt'], ...(SKILL_REQUIRED_STAGES.includes(stage) ? {skill: {capability: stage, skills: ['es-designer']}} : {})} ])),
    agents: {writer: {command: command(settings.writer ?? {})}, reviewer: {command: command(settings.reviewer ?? {})}},
    review: {enabled: true, max_rounds: 3, rubric: 'rules/review-rubric.txt', log_dir: 'review/log'}, limits: {max_fix_rounds: 3},
    evals: Object.fromEntries(STAGES.map(stage => [stage, [{run: `${command({eval: true})} ${JSON.stringify(`spec/${stage}.txt`)}`}]])), versions,
    gates: {dir: 'review/gates', values: GATE_VALUES, definitions_dir: 'review/definitions', stage_definitions: Object.fromEntries(STAGES.map(stage => [stage, {id: `gate-${stage}`, version: '1'}])), scoped_definitions: [], graph: 'review/graph.json', receipts_dir: 'review/receipts', candidates_dir: 'review/candidates', decisions_dir: 'review/decisions', exceptions_dir: 'review/exceptions', changes_dir: 'review/changes'},
    exit_codes: {done: 0, waiting_for_human: 2, bad_config_or_artifact: 3, environment_error: 4},
  };
  write('input/po-spec.txt', 'Original source and AC outcomes.\n');
  write('rules/review-rubric.txt', 'Every mandatory criterion must score 2; Critical/Major block.\n');
  write('prompts/_common.md', fs.readFileSync(fileURLToPath(new URL('../../prompts/_common.md', import.meta.url)), 'utf8'));
  write('prompts/reviewer.md', 'Review original source and final output.');
  const definitions = {};
  for (const stage of STAGES) {
    write(`prompts/${stage}.md`, `Fixture stage ${stage}.`);
    definitions[stage] = gateDefinition(config, stage, {inputs: ['input/po-spec.txt'], outputs: [`spec/${stage}.txt`], checks: [{id: 'fixture-content', command: config.evals[stage][0].run, mandatory: true, blocker_policy: 'All mandatory checks pass; no waiver'}]});
    write(`review/definitions/gate-${stage}/1.json`, definitions[stage]);
  }
  write('review/graph.json', {version: '1', complete: false, nodes: [{id: 'req:original', kind: 'req', source: 'input/po-spec.txt', revision: '1'}], edges: []});
  if (enabled.includes('handoff')) {
    config.gates.baseline = 'review/baseline.json';
    write('review/baseline.json', {id: 'baseline-1', head: 'baseline-head', manifest: sha256('baseline')});
  }
  for (const dir of ['spec', 'review/log', 'review/gates', 'review/receipts', 'review/candidates', 'review/decisions', 'review/exceptions', 'review/changes']) fs.mkdirSync(path.join(root, dir), {recursive: true});
  const save = () => {
    for (const stage of STAGES) {
      definitions[stage].checks = config.evals[stage].map((entry, i) => ({id: `fixture-content-${i}`, command: entry.run, mandatory: true, blocker_policy: 'Every configured deterministic command must pass'}));
      write(`review/definitions/${definitions[stage].id}/${definitions[stage].version}.json`, definitions[stage]);
    }
    write('config/pipeline.yaml', config);
  };
  save();
  const run = (args = []) => {
    const defaults = [...(args.includes('--head') ? [] : ['--head', 'fixture-head']), ...(args.includes('--build') ? [] : ['--build', 'not-built'])];
    const result = spawnSync(process.execPath, [runner, '--project', root, ...defaults, ...args], {encoding: 'utf8', timeout: 20000});
    if (result.error) throw result.error;
    return {code: result.status, out: result.stdout + result.stderr};
  };
  const gate = stage => {
    const raw = fs.readFileSync(path.join(root, `review/gates/${stage}.md`), 'utf8');
    return {raw, data: JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(raw)[1])};
  };
  const approve = stage => {
    const {data} = gate(stage);
    data.approval = {by: 'po@example.test', at: new Date().toISOString()};
    data.model.states.human = 'APPROVED'; data.model.decision = `fixture-${stage}-decision`;
    write(`review/gates/${stage}.md`, `GATE: APPROVED\n\n\`\`\`gate-data\n${canonical(data)}\n\`\`\`\n`);
  };
  return {root, write, config, definitions, save, run, gate, approve};
}

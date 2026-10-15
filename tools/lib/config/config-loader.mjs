import fs from 'node:fs';
import {parseYaml} from './yaml-parser.mjs';
import {localPath, RunnerError} from './path-selection.mjs';

export const STAGES = ['intake', 'clarify', 'contract', 'prd', 'us', 'wireframe', 'prototype', 'design', 'tdd', 'uiux', 'handoff'];
export const GATE_VALUES = ['PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'NOT_REQUIRED'];
// Stages whose work must name the skill that carries the design judgment.
export const SKILL_REQUIRED_STAGES = ['wireframe', 'prototype', 'design', 'uiux'];
export const REVIEW_REQUIRED_STAGES = Object.freeze(['us', 'wireframe', 'prototype', 'tdd', 'uiux', 'handoff']);
const NEW_STAGES = ['wireframe', 'prototype'];
const CAPABILITY_ID = /^[a-z][a-z0-9-]*$/;
const SKILL_ID = /^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)?$/;
// Config names skills and capabilities only, never vendors or models; the core stays model-agnostic.
const VENDOR_OR_MODEL = /claude|anthropic|opus|sonnet|haiku|fable|gpt|openai|gemini|codex|llama|mistral|cohere|ollama/i;
const text = value => typeof value === 'string' && value.trim().length > 0;
const bad = (key, value) => { throw new RunnerError(`Bad config ${key}: ${JSON.stringify(value)}`); };
function object(value, keys, key, required = keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad(key, value);
  for (const name of Object.keys(value)) if (!keys.includes(name)) bad(`${key}.${name}`, value[name]);
  for (const name of required) if (!Object.hasOwn(value, name)) bad(`${key}.${name}`, undefined);
}
function string(value, key) { if (!text(value)) bad(key, value); }
function boolean(value, key) { if (typeof value !== 'boolean') bad(key, value); }
function paths(value, key) {
  if (!Array.isArray(value) || value.some(v => !text(v)) || new Set(value).size !== value.length) bad(key, value);
}
function skill(value, key) {
  object(value, ['capability', 'skills'], key);
  if (!CAPABILITY_ID.test(value.capability) || VENDOR_OR_MODEL.test(value.capability)) bad(`${key}.capability`, value.capability);
  const ids = value.skills;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !SKILL_ID.test(id) || VENDOR_OR_MODEL.test(id))) bad(`${key}.skills`, ids);
}
export function validateConfig(config, {legacyStages = false} = {}) {
  const requiredStages = legacyStages ? STAGES.filter(s => !NEW_STAGES.includes(s)) : STAGES;
  const rootKeys = ['version', 'project', 'roles', 'stages', 'agents', 'review', 'limits', 'evals', 'versions', 'gates', 'exit_codes', 'design_adapter'];
  object(config, rootKeys, 'config', ['version', 'project', 'roles']);
  if (config.version !== 2) bad('version', config.version);
  object(config.project, ['name', 'doc_language', 'spec_root', 'us_prefix'], 'project', ['name', 'doc_language', 'spec_root']);
  for (const key of ['name', 'doc_language', 'spec_root']) string(config.project[key], `project.${key}`);
  object(config.roles, ['po', 'qc', 'dev'], 'roles');
  for (const role of ['po', 'qc', 'dev']) {
    object(config.roles[role], role === 'po' ? ['enabled', 'gate', 'approvers'] : ['enabled', 'gate'], `roles.${role}`, ['enabled', 'gate']);
    for (const flag of ['enabled', 'gate']) boolean(config.roles[role][flag], `roles.${role}.${flag}`);
    if (config.roles[role].approvers !== undefined) {
      paths(config.roles[role].approvers, `roles.${role}.approvers`);
      if (!config.roles[role].approvers.length || config.roles[role].approvers.some(v => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) bad(`roles.${role}.approvers`, config.roles[role].approvers);
    }
  }
  for (const key of rootKeys.filter(k => !['design_adapter', 'version', 'project', 'roles'].includes(k))) if (!Object.hasOwn(config, key)) bad(key, undefined);
  object(config.stages, STAGES, 'stages', requiredStages);
  for (const stage of STAGES) {
    const row = config.stages[stage];
    if (legacyStages && NEW_STAGES.includes(stage) && row === undefined) continue;
    object(row, ['enabled', 'owner', 'context', 'optional_context', 'design_system', 'skill'], `stages.${stage}`, ['enabled', 'owner', 'context']);
    boolean(row.enabled, `stages.${stage}.enabled`);
    if (!['po', 'qc', 'dev'].includes(row.owner)) bad(`stages.${stage}.owner`, row.owner);
    paths(row.context, `stages.${stage}.context`);
    if (row.optional_context !== undefined) {
      paths(row.optional_context, `stages.${stage}.optional_context`);
      for (const relative of row.optional_context) {
        if (row.context.includes(relative) || relative.startsWith('/') || relative.includes('\\') || relative.split('/').includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(relative)) bad(`stages.${stage}.optional_context`, relative);
      }
    }
    // A disabled design/uiux stage may omit skill; a declared one is still validated below.
    if (SKILL_REQUIRED_STAGES.includes(stage) && row.enabled && !Object.hasOwn(row, 'skill')) bad(`stages.${stage}.skill`, undefined);
    if (Object.hasOwn(row, 'skill')) skill(row.skill, `stages.${stage}.skill`);
  }
  if (config.stages.uiux.enabled) {
    for (const stage of ['design', 'tdd']) if (!config.stages[stage].enabled) bad(`stages.${stage}.enabled (uiux requires ${stage})`, false);
    string(config.stages.uiux.design_system, 'stages.uiux.design_system');
  }
  if (config.stages.design.enabled || config.stages.uiux.enabled) string(config.design_adapter, 'design_adapter');
  object(config.agents, ['writer', 'reviewer'], 'agents');
  for (const role of ['writer', 'reviewer']) {
    object(config.agents[role], ['command'], `agents.${role}`);
    string(config.agents[role].command, `agents.${role}.command`);
  }
  object(config.review, ['enabled', 'max_rounds', 'rubric', 'log_dir'], 'review');
  boolean(config.review.enabled, 'review.enabled');
  if (!Number.isInteger(config.review.max_rounds) || config.review.max_rounds < 1) bad('review.max_rounds', config.review.max_rounds);
  for (const key of ['rubric', 'log_dir']) string(config.review[key], `review.${key}`);
  object(config.limits, ['max_fix_rounds'], 'limits');
  if (!Number.isInteger(config.limits.max_fix_rounds) || config.limits.max_fix_rounds < 0) bad('limits.max_fix_rounds', config.limits.max_fix_rounds);
  object(config.evals, STAGES, 'evals', requiredStages);
  for (const stage of STAGES) {
    if (legacyStages && NEW_STAGES.includes(stage) && config.evals[stage] === undefined) continue;
    if (!Array.isArray(config.evals[stage])) bad(`evals.${stage}`, config.evals[stage]);
    for (const [index, row] of config.evals[stage].entries()) {
      const key = `evals.${stage}.${index}`;
      object(row, ['run', 'per_file'], key, ['run']); string(row.run, `${key}.run`);
      if (Object.hasOwn(row, 'per_file')) string(row.per_file, `${key}.per_file`);
    }
  }
  object(config.versions, ['workflow', 'templates', 'ruleset', 'skill'], 'versions');
  for (const [key, value] of Object.entries(config.versions)) { string(value, `versions.${key}`); if (value === 'latest') bad(`versions.${key}`, value); }
  const gateKeys = ['dir', 'values', 'definitions_dir', 'stage_definitions', 'scoped_definitions', 'graph', 'receipts_dir', 'candidates_dir', 'decisions_dir', 'exceptions_dir', 'changes_dir', 'baseline'];
  object(config.gates, gateKeys, 'gates', gateKeys.filter(k => k !== 'baseline'));
  if (JSON.stringify(config.gates.values) !== JSON.stringify(GATE_VALUES)) bad('gates.values', config.gates.values);
  for (const key of gateKeys.filter(k => !['values', 'stage_definitions', 'scoped_definitions', 'baseline'].includes(k))) string(config.gates[key], `gates.${key}`);
  if (config.gates.baseline !== undefined) string(config.gates.baseline, 'gates.baseline');
  object(config.gates.stage_definitions, STAGES, 'gates.stage_definitions', requiredStages);
  if (!Array.isArray(config.gates.scoped_definitions)) bad('gates.scoped_definitions', config.gates.scoped_definitions);
  const bindings = [...Object.entries(config.gates.stage_definitions), ...config.gates.scoped_definitions.map((v, i) => [`scoped.${i}`, v])];
  const ids = new Set();
  for (const [name, binding] of bindings) {
    object(binding, ['id', 'version'], `gates.${name}`);
    for (const key of ['id', 'version']) if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(binding[key] ?? '')) bad(`gates.${name}.${key}`, binding[key]);
    if (ids.has(binding.id)) bad(`gates.${name}.id (duplicate binding)`, binding.id);
    ids.add(binding.id);
  }
  const exits = {done: 0, waiting_for_human: 2, bad_config_or_artifact: 3, environment_error: 4};
  object(config.exit_codes, Object.keys(exits), 'exit_codes');
  for (const [key, value] of Object.entries(exits)) if (config.exit_codes[key] !== value) bad(`exit_codes.${key}`, config.exit_codes[key]);
  return config;
}
export function loadConfig(root, file = 'config/pipeline.yaml', options = {}) {
  try {
    const config = validateConfig(parseYaml(fs.readFileSync(localPath(root, file), 'utf8'), file), options);
    for (const relative of [config.project.spec_root, config.review.rubric, config.review.log_dir, ...Object.entries(config.gates).filter(([key]) => key.endsWith('dir') || ['graph', 'baseline'].includes(key)).map(([, val]) => val), ...(config.design_adapter ? [config.design_adapter] : [])]) localPath(root, relative);
    for (const stage of STAGES) {
      if (options.legacyStages && !config.stages[stage]) continue;
      for (const relative of [...config.stages[stage].context, ...(config.stages[stage].optional_context ?? [])]) localPath(root, relative);
      for (const row of config.evals[stage] ?? []) if (row.per_file) localPath(root, row.per_file);
    }
    return config;
  } catch (error) { throw error instanceof RunnerError ? error : new RunnerError(`${file}: ${error.message}`); }
}

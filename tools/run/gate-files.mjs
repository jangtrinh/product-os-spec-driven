import fs from 'node:fs';
import {canonical, parseJson} from '../lib/config/strict-json.mjs';
import {hashes, localPath, sha256, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {STAGES, GATE_VALUES} from '../lib/config/config-loader.mjs';

const common = schema('model-common.schema.json').$defs;
const string = {type: 'string', minLength: 1};
const gateSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    stage: {enum: STAGES}, context: {type: 'array', items: common.path, uniqueItems: true},
    inputs: {type: 'object', propertyNames: common.path, additionalProperties: common.hash},
    outputs: {type: 'object', propertyNames: common.path, additionalProperties: common.hash},
    config_sha256: common.hash,
    role: {type: 'object', additionalProperties: false, properties: {owner: {enum: ['po', 'qc', 'dev']}, enabled: {type: 'boolean'}, gate: {type: 'boolean'}}, required: ['owner', 'enabled', 'gate']},
    evals: {type: 'array', items: {type: 'object', additionalProperties: false, properties: {command: string, exit_code: {type: 'integer'}, report: {anyOf: [common.path, {type: 'null'}]}}, required: ['command', 'exit_code', 'report']}},
    review: schema('gate-review.schema.json'),
    versions: {type: 'object', additionalProperties: false, properties: {workflow: string, templates: string, ruleset: string}, required: ['workflow', 'templates', 'ruleset']},
    change_requests: {type: 'array', items: {type: 'object', additionalProperties: false, properties: {text: string, by: common.email, at: common.utc}, required: ['text', 'by', 'at']}},
    invalidation: {anyOf: [{type: 'null'}, {type: 'object', additionalProperties: false, properties: {reason: string, changed: {type: 'array', minItems: 1, items: string}, at: common.utc, impact: {type: 'array', items: {type: 'object', additionalProperties: false, properties: {node: string, classification: {enum: ['direct', 'transitive', 'unknown']}, reason: string, path: {type: 'array', minItems: 1, items: string}}, required: ['node', 'classification', 'reason', 'path']}}}, required: ['reason', 'changed', 'at']}]},
    approval: {type: 'object', additionalProperties: false, properties: {by: common.email, at: common.utc}, required: ['by', 'at']},
    model: schema('gate-state.schema.json'),
  },
  required: ['stage', 'context', 'inputs', 'outputs', 'config_sha256', 'role', 'evals', 'review', 'versions', 'change_requests', 'invalidation'],
};
export function versionsUsed(config, stage, definitions = []) {
  const context = [...(config.stages[stage]?.context ?? []), ...definitions.flatMap(def => def?.inputs ?? []),
    ...(config.review.enabled ? [config.review.rubric] : [])];
  const uses = prefix => context.some(item => item === prefix || item.startsWith(`${prefix}/`));
  const versions = {workflow: config.versions.workflow};
  if (uses('templates')) versions.templates = config.versions.templates;
  if (uses('rules')) versions.ruleset = config.versions.ruleset;
  if (config.stages[stage]?.skill) versions.skill = config.versions.skill;
  return versions;
}
export function effectiveHash(config, stage, definitions) {
  const versions = versionsUsed(config, stage, definitions);
  // Optional selection bytes are bound in gate/receipt inputs and candidates.
  // The empty selector itself must not invalidate an existing approval.
  const {optional_context, ...stageConfig} = config.stages[stage];
  const own = config.gates.stage_definitions[stage];
  const ids = new Set(definitions.map(def => def?.id).filter(Boolean));
  const scoped = (config.gates.scoped_definitions ?? []).filter(binding => ids.has(binding.id) && binding.id !== own?.id);
  const {stage_definitions, scoped_definitions, ...sharedGates} = config.gates;
  return sha256(canonical({
    stage: stageConfig, evals: config.evals[stage], agents: config.agents, review: config.review, limits: config.limits,
    versions, gates: {...sharedGates, stage_definition: own, scoped_definitions: scoped},
    definitions: definitions.filter(Boolean).map(def => ({...def,
      versions: Object.fromEntries(Object.keys(versionsUsed(config, stage, [def])).map(key => [key, def.versions[key]]))})),
    design_adapter: config.design_adapter ?? null,
  }));
}
export function validateGate(data, value, stage, root, gatesDir = 'review/gates') {
  validateSchema(data, gateSchema, `${stage} gate-data`);
  if (data.model && data.model.states.human !== value) throw new RunnerError(`${stage}: first gate line/model human state mismatch`);
  if (data.stage !== stage || canonical(data.context) !== canonical(Object.keys(data.inputs).sort())) throw new RunnerError(`${stage}: context/input inventory mismatch`);
  if (canonical(data.context) !== canonical([...data.context].sort())) throw new RunnerError(`${stage}: unsorted context`);
  const own = `${gatesDir}/${stage}.md`;
  if (Object.hasOwn(data.inputs, own) || Object.hasOwn(data.outputs, own)) throw new RunnerError(`${stage}: gate cannot hash itself`);
  for (const relative of [...data.context, ...Object.keys(data.outputs), ...data.evals.map(row => row.report).filter(Boolean), data.review.report].filter(Boolean)) localPath(root, relative);
  if (value === 'APPROVED') {
    if (!data.approval) throw new RunnerError(`${stage}: APPROVED requires approval email/time`);
  } else if (data.approval) throw new RunnerError(`${stage}: approval only belongs to APPROVED`);
  return data;
}
export function readGate(root, config, stage) {
  const relative = `${config.gates.dir}/${stage}.md`; const file = localPath(root, relative);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8'); const first = text.split(/\r?\n/)[0];
  const value = /^GATE: ([A-Z_]+)$/.exec(first)?.[1];
  if (!GATE_VALUES.includes(value)) throw new RunnerError(`${relative}: invalid first gate line ${first}`);
  const blocks = [...text.matchAll(/^```gate-data\r?\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new RunnerError(`${relative}: exactly one gate-data block required`);
  const data = validateGate(parseJson(blocks[0][1], relative), value, stage, root, config.gates.dir);
  const after = text.slice(blocks[0].index + blocks[0][0].length).trim();
  return {value, data, relative, request: after.startsWith('CHANGE REQUEST:') ? after.slice('CHANGE REQUEST:'.length).trim() : ''};
}
export function writeGate(root, config, stage, value, data, request = null) {
  validateGate(data, value, stage, root, config.gates.dir);
  const review = data.review.enabled ? `VERDICT: ${data.review.verdict}` : 'review disabled';
  const pending = data.review.findings.filter(f => ['open', 'accepted-minor'].includes(f.disposition));
  const prose = [`${review}`, `review independent: ${data.review.independent ? 'yes' : 'no'}`, ...pending.map(f => `${f.id} ${f.file}:${f.line}: ${f.impact}; ${f.disposition}; reason: ${f.reason}${f.disposition === 'open' && f.severity === 'Minor' ? '; PO decision: accepted-minor with reason + follow-up, or changes-requested' : ''}`), ...data.change_requests.map(r => `Retained request (${r.by}): ${r.text}`)].join('\n');
  writeLocal(root, `${config.gates.dir}/${stage}.md`, `GATE: ${value}\n\n${prose}\n\n\`\`\`gate-data\n${canonical(data)}\n\`\`\`\n${request ? `\nCHANGE REQUEST: ${request}\n` : ''}`);
}
export function changedHashes(root, old, current) {
  const paths = new Set([...Object.keys(old), ...Object.keys(current)]);
  return [...paths].filter(relative => old[relative] !== current[relative]).sort();
}
export const disabledReview = () => ({enabled: false, independent: false, verdict: null, criteria: [], findings: [], report: null});

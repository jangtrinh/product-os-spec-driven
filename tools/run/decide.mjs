#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadConfig, STAGES} from '../lib/config/config-loader.mjs';
import {canonical} from '../lib/config/strict-json.mjs';
import {localPath, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {loadRegistries, definitionsFor, jsonFile, livePins} from './registries.mjs';
import {readGate, writeGate, validateGate} from './gate-files.mjs';
import {gateChanges, passedGateEligible} from './invalidate-gates.mjs';
import {loadEvidence} from './evidence-heads.mjs';
import {reviewBindingMatches} from './review-binding.mjs';
import {preflightDecision, recordDecision} from './decision-records.mjs';
import {runCommand} from './decision-commands.mjs';
import {continueStage} from './continue-stage.mjs';
import {prepareAmendments, sealAmendments} from './amendment-records.mjs';

export function parseDecisionOptions(argv) {
  const options = {project: process.cwd(), config: 'config/pipeline.yaml', minors: []};
  const names = {'--project': 'project', '--config': 'config', '--stage': 'stage', '--as': 'as', '--request-changes': 'request', '--confirmed-via': 'confirmedVia'};
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--reason' && argv.includes('--continue')) {
      const value = argv[++i];
      if (!value?.trim() || value.startsWith('--') || options.reason) throw new RunnerError('Require one --reason for --continue');
      options.reason = value; continue;
    }
    if (['--accept-minor', '--reason', '--follow-up'].includes(flag)) {
      const value = argv[++i];
      if (!value?.trim() || value.startsWith('--')) throw new RunnerError(`Missing ${flag}`);
      if (flag === '--accept-minor') options.minors.push({id: value});
      else {
        const row = options.minors.at(-1); const key = flag === '--reason' ? 'reason' : 'follow_up';
        if (!row || row[key]) throw new RunnerError(`${flag} must follow --accept-minor once per finding`);
        row[key] = value;
      }
      continue;
    }
    if (seen.has(flag)) throw new RunnerError(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--help' || flag === '--approve' || flag === '--continue') {options[flag.slice(2)] = true; continue;}
    if (!names[flag] || !argv[i + 1]?.trim() || argv[i + 1].startsWith('--')) throw new RunnerError(`Unknown/missing option: ${flag}`);
    options[names[flag]] = argv[++i];
  }
  if (options.confirmedVia && options.confirmedVia !== 'ask-user') throw new RunnerError('--confirmed-via accepts only ask-user');
  options.channel = options.confirmedVia ? 'agent-ask-user' : 'direct';
  if (options.help) return options;
  if (options.continue) {
    if (!seen.has('--project') || !STAGES.includes(options.stage) || !options.as || !options.reason || options.approve || options.request || options.minors.length) throw new RunnerError('Require --project, --stage, --as, --continue --reason; continuation excludes approval, changes request and Minor acceptance');
    return options;
  }
  if (!STAGES.includes(options.stage) || !options.as || Boolean(options.approve) === Boolean(options.request)) throw new RunnerError('Require --stage, --as and exactly one of --approve or --request-changes');
  if (options.minors.some(row => !row.reason?.trim() || !row.follow_up?.trim()) || new Set(options.minors.map(row => row.id)).size !== options.minors.length) throw new RunnerError('Minor acceptance requires unique ids, reason and follow-up');
  if (options.request && options.minors.length) throw new RunnerError('Minor acceptance belongs to --approve');
  return options;
}
export function decide(argv = process.argv.slice(2), print = console.log) {
  try {
    const options = parseDecisionOptions(argv);
    if (options.help) {
      print('node tools/run/decide.mjs --project <dir> [--config <path>] [--confirmed-via ask-user] --stage <stage> --as <po-email> (--approve | --request-changes "<text>") [--accept-minor <finding-id> --reason "<text>" --follow-up "<text>"]...');
      print('node tools/run/decide.mjs --project <dir> [--config <path>] [--confirmed-via ask-user] --stage <stage> --as <po-email> --continue --reason "<text>"');
      print('Run personally by the authorized PO, or by /spec:gate only after the PO chooses in the same-session ask-user tool, with --confirmed-via ask-user. Outside that path agents must never run decide.mjs or supply --as. Authority is asserted-local, not cryptographic authentication. Refusals exit 3 without writes.');
      return 0;
    }
    const root = fs.realpathSync(path.resolve(options.project));
    const config = loadConfig(root, options.config); const registry = loadRegistries(root, config);
    const stage = options.stage;
    const approvers = config.roles.po.approvers ?? [];
    if (!approvers.includes(options.as)) throw new RunnerError('Unrecognized PO authority --as');
    if (options.continue) return continueStage(root, config, registry, options, print);
    const gate = readGate(root, config, stage);
    if (!config.stages[stage].enabled || gate?.value !== 'PENDING' || !gate.data.model) throw new RunnerError(`${stage}: current PENDING gate required`);
    const pins = {head: gate.data.model.candidate.head, build: gate.data.model.candidate.build};
    if (gateChanges(root, config, registry, stage, gate, pins).length) throw new RunnerError(`${stage}: stale gate; source/context/output/config changed after review`);
    const definitions = definitionsFor(config, registry, stage);
    if (config.review.enabled) {
      const runtime = jsonFile(root, `review/runtime/${stage}.json`);
      if (!reviewBindingMatches(root, config, registry, stage, runtime, [...new Set(definitions.flatMap(def => def.outputs))])) throw new RunnerError(`${stage}: source/context changed after last review`);
    }
    if (gate.data.model.states.eval !== 'PASS') throw new RunnerError(`${stage}: evaluation must pass`);
    if (gate.data.review.findings.some(row => ['Critical', 'Major'].includes(row.severity) && !['fixed', 'rejected'].includes(row.disposition))) throw new RunnerError(`${stage}: Critical/Major finding blocks decision`);
    // Preflight pending quality with the runner's evidence selection; only the
    // existing open-Minor policy may await a human disposition.
    const context = loadEvidence(root, config);
    if (!passedGateEligible(root, config, registry, stage, gate, pins, {context, allowPendingMinor: true})) throw new RunnerError(`${stage}: stale/ineligible evaluation or independent review`);
    const data = structuredClone(gate.data);
    for (const accepted of options.minors) {
      const finding = data.review.findings.find(row => row.id === accepted.id && row.severity === 'Minor' && row.disposition === 'open');
      if (!finding) throw new RunnerError(`Unknown/non-open Minor finding: ${accepted.id}`);
      Object.assign(finding, {disposition: 'accepted-minor', accepted_by: options.as, reason: accepted.reason, follow_up: accepted.follow_up});
    }
    if (options.approve && data.review.findings.some(row => row.disposition === 'open')) throw new RunnerError('Every open Minor must be accepted with reason and follow-up');
    const value = options.approve ? 'APPROVED' : 'CHANGES_REQUESTED';
    const at = new Date().toISOString(); const id = `decision-${randomUUID()}`;
    const reason = options.request ?? 'PO approved current stage gate';
    const decision = {id, scope: data.model.scope, pins: data.model.candidate, by: options.as, at, default: options.approve ? 'approve' : 'changes-requested', reason, channel: options.channel, overrides: options.minors.map(row => ({...row, decision: 'accepted-minor'})), exceptions: []};
    data.model.decision = id; data.model.states.human = value;
    if (options.approve) data.approval = {by: options.as, at};
    else data.change_requests.push({text: reason, by: options.as, at});
    const projected = {value, data, relative: gate.relative};
    const models = new Map();
    for (const def of definitions) {
      const file = `${config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;
      const model = {...jsonFile(root, file), decision: id}; model.states = {...model.states, human: value};
      validateSchema(model, schema('gate-state.schema.json'), file); models.set(file, model);
    }
    validateGate(data, value, stage, root, config.gates.dir);
    context.gates = context.gates.map(row => row.data.stage === stage ? projected : row);
    if (options.approve && !passedGateEligible(root, config, registry, stage, projected, pins, {context, models})) throw new RunnerError(`${stage}: approval cannot establish current independent eligibility`);
    const amendments = options.approve ? prepareAmendments(root, config, registry, stage, {decision: id, scope: data.model.scope, at, outputs: data.outputs}) : {records: [], superseded: [], ids: []};
    preflightDecision(root, config, decision);
    const live = livePins(root, pins, registry.baseline, stage);
    const {saved, event} = recordDecision(root, config, decision, {refs: [gate.relative, ...data.model.receipts, ...amendments.ids], dirty: live.dirty});
    sealAmendments(root, config, registry, stage, amendments);
    for (const [file, model] of models) writeLocal(root, file, canonical(model) + '\n');
    writeGate(root, config, stage, value, data, options.request);
    print(`Wrote ${gate.relative}: GATE: ${value}; model.states.human=${value}; decision=${id}`);
    if (options.approve) print(`Approval ${canonical(data.approval)}; accepted Minors ${canonical(options.minors.map(row => ({...row, accepted_by: options.as})))}`);
    else print(`CHANGE REQUEST: ${reason}`);
    print(`Wrote ${saved}; audit ${event.id}; scoped gates ${[...models.keys()].join(', ')}`);
    print(runCommand(options.project, pins, options.config));
    return 0;
  } catch (error) {print(error.message); return 3;}
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode = decide();

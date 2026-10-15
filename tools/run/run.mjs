#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig, STAGES} from '../lib/config/config-loader.mjs';
import {RunnerError} from '../lib/config/path-selection.mjs';
import {loadRegistries, livePins} from './registries.mjs';
import {invalidateGates, passedGateEligible} from './invalidate-gates.mjs';
import {runStage} from './stage-runner.mjs';
import {requireTransition} from './runtime-state.mjs';
import {writeGate} from './gate-files.mjs';
import {importDecision} from './import-decision.mjs';
import {readGate} from './gate-files.mjs';
import {printDecisionCommands} from './decision-commands.mjs';
import {preflightRetirement} from './retirement-preflight.mjs';
import {stageIgnoredContext} from './optional-context.mjs';
import {assertResultOwner} from './manual-agent.mjs';

export function parseOptions(argv) {
  const options = {project: process.cwd(), config: 'config/pipeline.yaml'};
  const names = {'--project': 'project', '--config': 'config', '--stage': 'stage', '--result': 'result', '--paste': 'paste', '--head': 'head', '--build': 'build', '--as': 'as', '--import-decision': 'decision', '--packet-data': 'packet', '--transition': 'transition', '--timeout-ms': 'timeout'};
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--supersedes' || flag === '--reason') {
      const value = argv[++i];
      if (!value?.trim() || value.startsWith('--')) throw new RunnerError(`Missing ${flag}`, 2);
      options.supersedes ??= [];
      if (flag === '--supersedes') options.supersedes.push({id: value, reason: ''});
      else { const row = options.supersedes.at(-1); if (!row || row.reason) throw new RunnerError('--reason must follow --supersedes', 2); row.reason = value; }
      continue;
    }
    if (seen.has(flag)) throw new RunnerError(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === '--independent-review') { options.independentReview = true; continue; }
    if (flag === '--help') { options.help = true; continue; }
    const key = names[flag];
    if (!key || !argv[i + 1] || argv[i + 1].startsWith('--') || Object.hasOwn(options, key) && !['project', 'config'].includes(key)) throw new RunnerError(`Unknown/duplicate/missing option: ${flag}`);
    options[key] = argv[++i];
  }
  if (options.stage && !STAGES.includes(options.stage)) throw new RunnerError(`Unknown --stage: ${options.stage}`);
  if (options.result && options.paste) throw new RunnerError('--result and --paste are mutually exclusive');
  if (Boolean(options.decision) !== Boolean(options.packet) || (options.decision && (options.result || options.paste || options.stage))) throw new RunnerError('Decision import requires --packet-data and excludes stage/manual result');
  if (options.as && !options.decision) throw new RunnerError('--as only applies to human decision import');
  if (options.timeout !== undefined && (!/^\d+$/.test(options.timeout) || Number(options.timeout) < 1)) throw new RunnerError('Bad --timeout-ms');
  if (options.timeout !== undefined) options.timeout = Number(options.timeout);
  if (options.supersedes && (options.decision || options.supersedes.some(row => !row.reason) || new Set(options.supersedes.map(row => row.id)).size !== options.supersedes.length)) throw new RunnerError('Retirement requires unique --supersedes <id> --reason <text> pairs on a stage run', 2);
  return options;
}
export async function run(argv = process.argv.slice(2), print = console.log) {
  try {
    const options = parseOptions(argv);
    if (options.help) { print('PRODUCT:OS Spec Driven: --project <root> [--config <path>] --build <rev|not-built> [--head <rev>] [--stage <name>] [--result <file>|--paste <file>] [--supersedes <receipt-id> --reason <text>] [--import-decision <file> --packet-data <file> --as <PO-email>]'); return 0; }
    const root = fs.realpathSync(path.resolve(options.project));
    const config = loadConfig(root, options.config); const registry = loadRegistries(root, config);
    if (options.decision) {
      print('PO import authority is asserted-local. An automated agent must not supply --as; this option is for the authorized human controller.');
      return importDecision(root, config, registry, options, print);
    }
    livePins(root, options, registry.baseline);
    preflightRetirement(root, config, registry, options);
    const {gates, invalidated} = invalidateGates(root, config, registry, options);
    const start = options.stage ? STAGES.indexOf(options.stage) : 0;
    if (options.stage) {
      const transition = requireTransition(root, options, config, registry, options.stage, [...gates].some(([s]) => STAGES.indexOf(s) >= start));
      if (transition) for (const [stage, gate] of gates) {
        if (!transition.regates.includes(stage) && !transition.regates.includes(config.gates.stage_definitions[stage].id)) continue;
        const data = {...gate.data}; delete data.approval;
        data.invalidation = {reason: transition.reason, changed: [options.transition], at: transition.at};
        if (data.model) data.model = {...data.model, decision: null, states: {...data.model.states, human: 'PENDING', freshness: 'STALE', progress: 'draft'}};
        if (transition.authority === 'po') data.change_requests.push({text: transition.reason, by: transition.approved_by, at: transition.at});
        writeGate(root, config, stage, 'PENDING', data); gate.data = data; gate.invalidated = true; invalidated.add(stage);
      }
    }
    for (const stage of STAGES.slice(start)) {
      if (!config.stages[stage].enabled) continue;
      const gate = gates.get(stage);
      if (gate && !invalidated.has(stage) && gate.value === 'PENDING') { print(`Waiting: ${gate.relative} (GATE: PENDING)`); printDecisionCommands(options.project, stage, gate, print, options.config); return 2; }
      if (gate && ['APPROVED', 'NOT_REQUIRED'].includes(gate.value) && !invalidated.has(stage)) {
        if (!passedGateEligible(root, config, registry, stage, gate, options)) throw new RunnerError(`Unmet quality/scoped eligibility: ${gate.relative}`, 2);
        continue;
      }
      assertResultOwner(root, config, stage, options);
      for (const row of stageIgnoredContext(root, config.stages[stage])) print(`Ignored context file: ${row.file}: ${row.reason}`);
      const result = await runStage(root, config, registry, stage, options, gate, print);
      if (result === 'PENDING') {printDecisionCommands(options.project, stage, readGate(root, config, stage), print, options.config); return 2;}
    }
    if ((options.result || options.paste) && !options.resultConsumed) throw new RunnerError('Manual result supplied without a matching pending step');
    print('All enabled stages settled with current gates.'); return 0;
  } catch (error) {
    print(`${error.message}`);
    return error instanceof RunnerError ? error.code : 3;
  }
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode = await run();

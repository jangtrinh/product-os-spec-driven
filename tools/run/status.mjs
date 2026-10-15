#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig, STAGES} from '../lib/config/config-loader.mjs';
import {RunnerError} from '../lib/config/path-selection.mjs';
import {loadRegistries, definitionsFor} from './registries.mjs';
import {loadState} from './runtime-state.mjs';
import {readGate} from './gate-files.mjs';
import {auditEvents} from './audit-store.mjs';
import {shellQuote, runCommand} from './decision-commands.mjs';
import {openQuestions} from './open-questions.mjs';
import {parseJson} from '../lib/config/strict-json.mjs';
import {localPath} from '../lib/config/path-selection.mjs';
import {gateChanges} from './invalidate-gates.mjs';
import {ignoredContext} from './optional-context.mjs';

export function projectStatus(project, configPath = 'config/pipeline.yaml') {
  const root = fs.realpathSync(path.resolve(project)), config = loadConfig(root, configPath), registry = loadRegistries(root, config);
  const suffix = configPath === 'config/pipeline.yaml' ? '' : ` --config ${shellQuote(configPath)}`;
  const projectArg = `--project ${shellQuote(root)}${suffix}`;
  const questions = openQuestions(root, config);
  const enabled = STAGES.filter(stage => config.stages[stage].enabled);
  const states = new Map(enabled.map(stage => [stage, loadState(root, config, definitionsFor(config, registry, stage)[0], {readOnly: true})]));
  // A stage that never ran continues with the pins of the nearest earlier stage that has them. With none, it takes the pinned
  // stage whose latest audited event is newest (runtime records carry no time); with no audited time, the first pinned stage.
  const pinsOf = stage => { const pins = states.get(stage)?.pins; return pins?.head && pins?.build ? pins : null; };
  let audited = new Map();
  try { for (const event of auditEvents(root)) for (const id of event.scope?.kind === 'stage' ? event.scope.ids : []) if (event.at > (audited.get(id) ?? '')) audited.set(id, event.at); } catch { audited = new Map(); }
  const inheritedPins = stage => {
    for (let i = enabled.indexOf(stage) - 1; i >= 0; i -= 1) if (pinsOf(enabled[i])) return pinsOf(enabled[i]);
    const pinned = enabled.filter(pinsOf);
    const newest = pinned.filter(name => audited.has(name)).sort((a, b) => (audited.get(b) > audited.get(a) ? 1 : -1))[0];
    return pinsOf(newest ?? pinned[0]);
  };
  const stages = enabled.map(stage => {
    const gate = readGate(root, config, stage), state = states.get(stage);
    const changed = gate ? gateChanges(root, config, registry, stage, gate, gate.data.model?.candidate ?? state.pins) : [];
    const freshness = changed.length ? 'STALE' : gate?.data.model?.states.freshness ?? 'MISSING';
    const exhausted = state.rounds.eval_fix >= state.effective_max_fix || state.rounds.review >= state.effective_max_review;
    const continuation = exhausted && !!state.pins?.head && !!state.pins?.build;
    const run = runCommand(root, state.pins ?? inheritedPins(stage), configPath);
    const decide = `node tools/run/decide.mjs ${projectArg} --stage ${stage} --as <po-email>`;
    const next = gate?.value === 'PENDING' && freshness !== 'STALE' ? `${decide} --approve${gate.data.review.findings.filter(f => f.severity === 'Minor' && f.disposition === 'open').map(f => ` --accept-minor ${shellQuote(f.id)} --reason "<text>" --follow-up "<text>"`).join('')}` : continuation ? `${decide} --continue --reason "<text>"` : run;
    const settled = ['APPROVED', 'NOT_REQUIRED'].includes(gate?.value) && freshness === 'CURRENT' && !gate.data.invalidation;
    return {stage, gate: gate?.value ?? 'none', freshness, changed_inputs: changed, settled, phase: state.phase, fix: {used: state.rounds.eval_fix, cap: state.effective_max_fix}, review: {used: state.rounds.review, cap: state.effective_max_review}, cap_exhausted: exhausted, continuation_possible: continuation, review_verdict: gate?.data.review.verdict ?? state.review_result?.verdict ?? null, findings: gate?.data.review.findings ?? state.review_result?.findings ?? [], review_file: gate?.data.review.report ?? state.review_result?.report ?? null, open_q_ids: stage === 'intake' ? [] : questions.map(q => q.id), next_command: next};
  });
  const next = stages.find(row => !row.settled);
  const marker = localPath(root, 'input/context-intake.json');
  const intake = fs.existsSync(marker) ? parseJson(fs.readFileSync(marker, 'utf8'), 'input/context-intake.json') : {};
  if (intake.ui !== undefined && (intake.ui?.asked !== true || !['none','loaded'].includes(intake.ui?.answer))) throw new RunnerError('input/context-intake.json: ui requires asked:true and answer:none|loaded');
  const firstWireframe = !fs.existsSync(localPath(root, 'review/runtime/wireframe.json')) && !fs.existsSync(localPath(root, 'review/manual/wireframe.json')) && !readGate(root, config, 'wireframe');
  const wireframe = stages.findIndex(row => row.stage === 'wireframe');
  const beforeWireframe = wireframe < 0 ? [] : stages.slice(0, wireframe);
  const reachesWireframe = wireframe >= 0 && beforeWireframe.every(row => {
    if (row.settled) return true;
    if (row.gate === 'PENDING' && row.freshness !== 'STALE' || row.cap_exhausted) return false;
    const role = config.roles[config.stages[row.stage].owner];
    return !role.enabled || !role.gate;
  });
  return {project: root, stages, open_questions: questions, ignored_context: ignoredContext(root, config), next_stage: next?.stage ?? null, ui_context_due: reachesWireframe && firstWireframe && intake.ui?.asked !== true, next_command: next?.next_command ?? null};
}
export function status(argv = process.argv.slice(2), print = console.log) {
  try {
    let project, config = 'config/pipeline.yaml', json = false; const seen = new Set();
    for (let i = 0; i < argv.length; i++) {
      const flag = argv[i]; if (seen.has(flag)) throw new RunnerError(`Duplicate option ${flag}`); seen.add(flag);
      if (flag === '--help') { print('status --project <dir> [--config <path>] [--json]; read-only, no lock. Decisions require the PO.'); return 0; }
      if (flag === '--json') {json = true; continue;}
      if (!['--project', '--config'].includes(flag) || !argv[i + 1]?.trim() || argv[i + 1].startsWith('--')) throw new RunnerError(`Unknown or missing option ${flag}`);
      const value = argv[++i]; if (flag === '--project') project = value; else config = value;
    }
    if (!project) throw new RunnerError('Required --project');
    const value = projectStatus(project, config);
    if (json) print(JSON.stringify(value));
    else {
      print(`PRODUCT:OS Spec Driven — ${value.project}`);
      for (const row of value.stages) print(`${row.stage}: ${row.gate}; fix ${row.fix.used}/${row.fix.cap}; review ${row.review.used}/${row.review.cap}; continuation ${row.continuation_possible ? 'possible (PO only)' : 'no'}${row.review_file ? `; review ${row.review_file}` : ''}`);
      for (const group of value.ignored_context) {
        print(`Ignored ${group.folder}:`);
        for (const row of group.files) print(`- ${row.file}: ${row.reason}`);
        if (group.os_junk) print(`- OS junk: ${group.os_junk}`);
      }
      print(`Open questions: ${value.open_questions.map(q => q.id).join(', ') || 'none'}`);
      print(value.next_command ? `Next (PO chooses; agents use /spec:gate): ${value.next_command}` : 'All enabled stages have settled gates. Inspect evidence before acceptance.');
    }
    return 0;
  } catch (error) {print(error.message); return 3;}
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode = status();

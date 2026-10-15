import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {canonical} from '../lib/config/strict-json.mjs';
import {localPath, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {definitionsFor} from './registries.mjs';
import {loadState} from './runtime-state.mjs';
import {preflightDecision, recordDecision} from './decision-records.mjs';
import {auditEvents} from './audit-store.mjs';
import {decisionAuthority} from './authority-binding.mjs';
import {runCommand} from './decision-commands.mjs';

// The three-record transaction restores prior bytes on an ordinary write error.
// Power-loss recovery and simultaneous PO commands are not isolated transactions.
function persistContinuation(root, config, exception, decision, dirty) {
  const exceptionFile = `${config.gates.exceptions_dir}/${exception.id}.json`;
  const decisionFile = preflightDecision(root, config, decision);
  const files = [exceptionFile, decisionFile, 'review/audit.jsonl'];
  const prior = new Map(); const missingDirs = new Set();
  for (const relative of files) {
    const file = localPath(root, relative);
    if (fs.existsSync(file) && !fs.statSync(file).isFile()) throw new RunnerError(`Record path is not a file: ${relative}`);
    prior.set(file, fs.existsSync(file) ? fs.readFileSync(file) : null);
    let dir = path.dirname(file);
    while (!fs.existsSync(dir)) {missingDirs.add(dir); dir = path.dirname(dir);}
    fs.accessSync(dir, fs.constants.W_OK);
  }
  auditEvents(root);
  try {
    writeLocal(root, exceptionFile, canonical(exception) + '\n', {immutable: true});
    recordDecision(root, config, decision, {refs: [exception.id], dirty});
    if (!decisionAuthority(auditEvents(root), {id: decision.id, scope: exception.scope, actor: exception.by, refs: [exception.id]})) throw new RunnerError('Continuation authority was not persisted');
  } catch (error) {
    for (const [file, bytes] of prior) {
      if (bytes !== null) fs.writeFileSync(file, bytes);
      else if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    for (const dir of [...missingDirs].sort((a, b) => b.length - a.length)) if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    throw error;
  }
}

export function continueStage(root, config, registry, options, print) {
  const stage = options.stage;
  if (!config.stages[stage].enabled) throw new RunnerError(`${stage}: stage must be enabled`);
  const definition = definitionsFor(config, registry, stage)[0];
  const state = loadState(root, config, definition, {readOnly: true});
  if (state.rounds.review < state.effective_max_review && state.rounds.eval_fix < state.effective_max_fix) throw new RunnerError(`${stage}: continuation requires an exhausted review or fix cap`);
  const pins = state.pins;
  if (!pins || ['head', 'build'].some(key => typeof pins[key] !== 'string' || !pins[key].trim())) throw new RunnerError(`${stage}: runtime pins missing/invalid; rerun run.mjs with the original --head and --build to record pins, then use the printed continuation command`);
  const now = Date.now(); const at = new Date(now).toISOString();
  const exception = {
    id: `continuation-${randomUUID()}`, kind: 'continuation', extra_rounds: 1,
    scope: definition.scope, by: options.as, at, expires: new Date(now + 30 * 86400000).toISOString(),
    status: 'active', reason: options.reason, source: 'PO scoped continuation; no waiver',
    deferred_gates: [], compensating_checks: ['Rerun mandatory evaluation and fresh independent review; no waiver'],
    non_waivable: ['mandatory criteria', 'Critical/Major findings block approval', 'independent review'],
  };
  validateSchema(exception, schema('exception.schema.json'), 'continuation');
  const decision = {id: `decision-${randomUUID()}`, scope: definition.scope, pins, by: options.as, at, default: 'defer', reason: options.reason, channel: options.channel, overrides: [], exceptions: [exception.id]};
  const message = `${exception.id}; rerun: ${runCommand(options.project, pins, options.config)}`;
  persistContinuation(root, config, exception, decision, pins.dirty ?? false);
  print(message);
  return 0;
}

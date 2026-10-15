import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {canonical, parseJson} from '../lib/config/strict-json.mjs';
import {localPath, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {readRecord, validateSchema, schema} from '../lib/config/schema-validation.mjs';
import {auditEvents, appendAudit} from './audit-store.mjs';
import {decisionAuthority, activeException, sameScope} from './authority-binding.mjs';
import {sha256} from '../lib/config/path-selection.mjs';
import {continuationCommand} from './decision-commands.mjs';

export function loadState(root, config, definition, {readOnly = false} = {}) {
  const relative = `review/runtime/${definition.stage}.json`;
  const file = localPath(root, relative);
  const state = fs.existsSync(file) ? parseJson(fs.readFileSync(file, 'utf8'), relative) : {
    phase: 'writer', review_result: null, eval_results: [], outputs: [],
    rounds: {cycle: `${definition.stage}-lineage`, eval_fix: 0, review: 0, max_fix: config.limits.max_fix_rounds, max_review: config.review.max_rounds, continuation: null},
  };
  const history = auditEvents(root).filter(event => event.refs.includes(`runtime-${definition.stage}`) && event.reason === 'Persisted loop counters');
  const last = history.at(-1);
  if (last) {
    const observed = parseJson(last.after, 'audited rounds');
    if (!fs.existsSync(file)) { state.rounds = observed; state.phase = 'repair'; }
    else if (state.rounds.eval_fix < observed.eval_fix || state.rounds.review < observed.review || state.rounds.max_fix !== observed.max_fix || state.rounds.max_review !== observed.max_review) throw new RunnerError(`${relative}: counters disagree with append-only audit`);
  }
  validateSchema(state.rounds, schema('gate-state.schema.json').properties.rounds, relative);
  if (!['writer', 'eval', 'reviewer', 'repair', 'settled'].includes(state.phase)) throw new RunnerError(`${relative}: invalid phase`);
  const approved = auditEvents(root);
  const applied = approved.filter(e => e.type === 'exception' && sameScope(e.scope, definition.scope) && e.reason === 'Scoped approved continuation; prior counters retained').flatMap(e => e.refs);
  const initial = history.length ? parseJson(history[0].after) : state.rounds;
  let activeExtra = 0;
  const continuations = [];
  const ids = new Set(definition.exceptions);
  for (const event of approved.filter(e => e.type === 'decision' && sameScope(e.scope, definition.scope) && (config.roles.po.approvers ?? []).includes(e.actor))) {
    const relative = `${config.gates.decisions_dir}/${event.id}.json`;
    if (!fs.existsSync(localPath(root, relative))) continue;
    const decision = parseJson(fs.readFileSync(localPath(root, relative), 'utf8'), relative);
    if (decision.id !== event.id || decision.by !== event.actor || !sameScope(decision.scope, definition.scope) || sha256(canonical(decision)) !== event.after) throw new RunnerError(`Decision authority binding mismatch: ${event.id}`);
    for (const id of decision.exceptions ?? []) {
      if (!decisionAuthority(approved, {id: event.id, scope: definition.scope, actor: decision.by, refs: [id]})) throw new RunnerError(`Continuation requires recorded exact-scope PO authority: ${id}`, 2);
      ids.add(id);
    }
  }
  for (const id of ids) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw new RunnerError(`Invalid exception id: ${id}`);
    const exception = readRecord(root, `${config.gates.exceptions_dir}/${id}.json`, 'exception.schema.json');
    if (exception.id !== id || canonical(exception.scope) !== canonical(definition.scope)) throw new RunnerError(`Exception scope mismatch: ${id}`);
    if (exception.kind !== 'continuation' || exception.status !== 'active' || Date.parse(exception.expires) <= Date.now() || Date.parse(exception.at) > Date.now()) continue;
    if (!(config.roles.po.approvers ?? []).includes(exception.by) || !decisionAuthority(approved, {scope: exception.scope, actor: exception.by, refs: [id]})) throw new RunnerError(`Continuation requires recorded exact-scope PO authority: ${id}`, 2);
    continuations.push(exception);
  }
  // Validate every authority before the first grant/audit mutation.
  for (const exception of continuations) {
    const id = exception.id;
    activeExtra += exception.extra_rounds;
    if (applied.includes(id)) continue;
    const previous = canonical(state.rounds);
    state.rounds.max_fix += exception.extra_rounds; state.rounds.max_review += exception.extra_rounds;
    state.rounds.continuation = id;
    if (!readOnly) appendAudit(root, {type: 'exception', scope: definition.scope, before: previous, after: canonical(state.rounds), refs: [id], actor: exception.by, reason: 'Scoped approved continuation; prior counters retained'});
  }
  state.effective_max_fix = initial.max_fix + activeExtra;
  state.effective_max_review = initial.max_review + activeExtra;
  state.exception_ids = continuations.map(e => e.id);
  if (!readOnly && !fs.existsSync(file) && last) saveState(root, definition.stage, state);
  return state;
}
// True while the stage's loop has not reached `settled`: a writer, eval, reviewer or repair checkpoint is still open.
// A stage that never ran, or whose last run settled, is not in flight.
export function stageInFlight(root, stage) {
  const file = localPath(root, `review/runtime/${stage}.json`);
  if (!fs.existsSync(file)) return false;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).phase !== 'settled'; } catch { return false; }
}
function withStateLock(root, stage, action) {
  const lock = localPath(root, `review/runtime/${stage}.lock`);
  fs.mkdirSync(localPath(root, 'review/runtime'), {recursive: true});
  let handle;
  try { handle = fs.openSync(lock, 'wx'); }
  catch (error) { if (error.code === 'EEXIST') throw new RunnerError(`Runtime busy at ${stage}; retry after the current attempt settles`, 2); throw error; }
  try { fs.writeFileSync(handle, String(process.pid)); return action(); }
  finally { fs.closeSync(handle); fs.unlinkSync(lock); }
}
function persistState(root, stage, state) {
  const last = auditEvents(root).filter(event => event.refs.includes(`runtime-${stage}`) && event.reason === 'Persisted loop counters').at(-1);
  const current = canonical(state.rounds);
  const observed = last && parseJson(last.after, 'audited rounds');
  if (observed && (state.rounds.eval_fix < observed.eval_fix || state.rounds.review < observed.review)) throw new RunnerError(`${stage}: stale counters; reload the persisted runtime`, 2);
  if (last?.after !== current) appendAudit(root, {type: 'eval', scope: {kind: 'stage', ids: [stage], revision: state.rounds.cycle}, before: last?.after ?? null, after: current, refs: [`runtime-${stage}`], reason: 'Persisted loop counters'});
  const pending = `review/runtime/${stage}-${randomUUID()}.tmp`;
  writeLocal(root, pending, canonical(state) + '\n');
  fs.renameSync(localPath(root, pending), localPath(root, `review/runtime/${stage}.json`));
}
export function saveState(root, stage, state) {
  return withStateLock(root, stage, () => persistState(root, stage, state));
}
export function reserveAttempt(root, stage, state, kind) {
  return withStateLock(root, stage, () => {
    const last = auditEvents(root).filter(event => event.refs.includes(`runtime-${stage}`) && event.reason === 'Persisted loop counters').at(-1);
    const observed = last && parseJson(last.after, 'audited rounds');
    if (observed && ['eval_fix', 'review'].some(key => observed[key] !== state.rounds[key])) throw new RunnerError(`${stage}: stale attempt reservation; reload the persisted runtime`, 2);
    const cap = kind === 'eval_fix' ? state.effective_max_fix : state.effective_max_review;
    if (state.rounds[kind] >= cap) throw new RunnerError(`${kind === 'eval_fix' ? 'Fix' : 'Review'} cap exhausted at ${stage}; PO scoped continuation required; ${continuationCommand(root, stage)}`, 2);
    state.rounds[kind]++;
    // Commit the audit reservation and replace the projection before execution.
    // A crash between these writes rejects a stale projection rather than retrying.
    persistState(root, stage, state);
  });
}
// authorityScope: scope of the PO decision event when it is not the transition's own scope (batch import).
export function requireTransition(root, options, config, registry, stage, gateExists, authorityScope) {
  if (!options.transition) {
    if (options.stage && gateExists) throw new RunnerError('--stage re-entry requires --transition record', 2);
    return null;
  }
  const record = readRecord(root, options.transition, 'transition.schema.json');
  const bound = registry.definitions.get(config.gates.stage_definitions[stage].id);
  if (record.to.stage !== stage || !record.decision || !bound.transitions.includes(record.kind) || canonical(record.to.scope) !== canonical(bound.scope)) throw new RunnerError('Unauthorized or illegal transition/scope', 2);
  const events = auditEvents(root);
  const actor = record.authority === 'po' ? events.find(e => e.id === record.decision)?.actor : record.authority;
  const authority = decisionAuthority(events, {id: record.decision, scope: authorityScope ?? record.to.scope, actor, refs: [record.id]});
  if (!authority || !authority.refs.includes(record.id) || canonical(authority.scope) !== canonical(authorityScope ?? record.to.scope) || (record.authority === 'po' ? !(config.roles.po.approvers ?? []).includes(authority.actor) : authority.actor !== record.authority) || (record.kind === 'backward' && record.authority !== 'po')) throw new RunnerError('Transition requires recorded exact-scope authority decision', 2);
  const known = new Set([...registry.definitions.keys(), ...Object.keys(config.stages)]);
  if (!record.regates.includes(bound.id) && !record.regates.includes(stage) || record.regates.some(id => !known.has(id))) throw new RunnerError('Transition has unknown/incomplete re-gates', 2);
  if (Date.parse(record.at) > Date.now()) throw new RunnerError('Transition is future-dated');
  if (record.kind === 'exception') {
    const definition = registry.definitions.get(config.gates.stage_definitions[stage].id);
    const exception = definition.exceptions.map(id => readRecord(root, `${config.gates.exceptions_dir}/${id}.json`, 'exception.schema.json')).find(e => e.id === record.source);
    if (!exception || exception.kind !== 'prototype-first' || !activeException(exception, record.to.scope, authority.actor) || Date.parse(exception.at) > Date.parse(record.at) || !(config.roles.po.approvers ?? []).includes(exception.by) || !exception.combined_checkpoint || !authority.refs.includes(exception.id)) throw new RunnerError('Prototype-first requires prior scoped PO exception and combined checkpoint', 2);
  }
  appendAudit(root, {type: 'transition', scope: record.to.scope, before: record.from.revision, after: record.to.revision, refs: [record.id, record.decision], actor: record.opener, reason: record.reason});
  return {...record, approved_by: authority.actor};
}

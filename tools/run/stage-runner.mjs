import {optionalFiles} from './optional-context.mjs';
import {REVIEW_REQUIRED_STAGES} from '../lib/config/config-loader.mjs';
import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {hashes, inventory, localPath, sha256, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {definitionsFor, livePins} from './registries.mjs';
import {stageCandidates, retainScoped} from './stage-candidates.mjs';
import {snapshotSources} from './source-snapshots.mjs';
import {stageContext, writerPrompt, readText} from './stage-context.mjs';
import {runCommand, freshReview, commandFailed, redact} from './command-process.mjs';
import {materialize, WriterFailure} from './materialize-output.mjs';
import {manualAgent} from './manual-agent.mjs';
import {loadState, saveState, reserveAttempt} from './runtime-state.mjs';
import {evaluate} from './eval-commands.mjs';
import {parseReview, ReviewFormatError, reviewEligible, reviewerPrompt} from './review-results.mjs';
import {writeGate, effectiveHash, disabledReview, versionsUsed} from './gate-files.mjs';
import {immutableJson, appendAudit} from './audit-store.mjs';
import {prepareReceipt, persistReceipt} from './evidence-records.mjs';
import {loadEvidence, selectHeads} from './evidence-heads.mjs';
import {memberQueries, noImpactProof} from './gate-evidence.mjs';
import {minorGatePending} from './minor-decisions.mjs';
import {currentEvalEvidence} from './current-eval-evidence.mjs';
import {retirementRows} from './retirement-preflight.mjs';
import {reviewBinding, reviewBindingMatches} from './review-binding.mjs';
import {concreteOutputs} from '../lib/output-patterns.mjs';
import {continuationCommand} from './decision-commands.mjs';
import {ownRepairWrite, contentHash, isForeignMap, sameContentAsRecorded} from './invalidate-gates.mjs';
import {coWriteHooks, coWrittenRequest} from './co-written-outputs.mjs';

export async function runStage(root, config, registry, stage, options, previous, print) {
  const definitions = definitionsFor(config, registry, stage); const definition = definitions[0];
  const state = loadState(root, config, definition);
  state.pins = livePins(root, options, registry.baseline, stage);
  const recovery = continuationCommand(options.project, stage, options.config);
  const reviewRepair = review => `Review findings: ${canonical(review.findings)}\nScores: ${canonical(review.criteria)}\nRecord every disposition and reason; never change expected AC outcomes without PO authority.`;
  const context = stageContext(root, config, registry, stage);
  const declared = [...new Set(definition.outputs)].sort();
  const reviewDeclared = [...new Set(definitions.flatMap(def => def.outputs))].sort();
  const produced = () => concreteOutputs(root, declared);
  const reviewProduced = () => concreteOutputs(root, reviewDeclared);
  function currentReview() {
    if (!state.review_result) return false;
    if (reviewBindingMatches(root, config, registry, stage, state, reviewDeclared)) return true;
    state.review_result = null; state.review_invalidated = true;
    saveState(root, stage, state);
    return false;
  }
  function changedReviewStop() {
    throw new RunnerError(`${stage}: source/context changed after last review; PO scoped continuation required; ${recovery}`, 2);
  }
  // SPEC section 6: a failed agent command exits 4 and keeps its stderr in a log with secrets removed.
  // The console message names the log and shows only the first redacted line.
  function commandFailure(label, cmd, result, log, suffix = '') {
    const stderr = redact(result.stderr ?? '');
    writeLocal(root, log, stderr);
    return new RunnerError(`${label}: ${cmd}; ${stderr.split('\n').find(line => line.trim())?.trim() ?? 'no stderr'}; stderr log: ${log}${suffix}`, 4);
  }
  currentReview();
  if (state.review_invalidated && state.rounds.review >= state.effective_max_review) changedReviewStop();
  // After a PO continuation, repair from the last review only while it still matches the reviewed outputs.
  if (state.phase === 'reviewer' && state.review_result && state.rounds.review < state.effective_max_review && !reviewEligible(state.review_result, {required: REVIEW_REQUIRED_STAGES.includes(stage), approvers: config.roles.po.approvers ?? []})) {
    state.phase = 'repair'; state.repair_reason = reviewRepair(state.review_result);
  }
  const fingerprint = sha256(canonical(context.inputs));
  // A reopened gate forces repair once per distinct cause, not on every invocation:
  // the gate file stays CHANGES_REQUESTED/stale until the repaired stage settles,
  // so a level trigger would pull a manual reviewer-result call back into repair.
  // The cause is a stable key (gate bytes, effective config, live candidate pins) plus the content of every
  // changed path. A later run is the same cause when the key matches and each currently changed path is either
  // this stage's own repair write (bytes equal what its writer recorded) or still has the exact bytes captured
  // when the repair started. A new path, different bytes at a recorded path, or an own-write path whose bytes
  // moved on are a new cause. Old entry shapes (string, array) never match: one bounded re-entry.
  const reopened = previous?.value === 'CHANGES_REQUESTED' || previous?.invalidated;
  const ownWrite = ownRepairWrite(root, state.written_outputs);
  const changedPaths = [...(previous?.data.invalidation?.changed ?? [])].sort();
  const entry = reopened ? {key: sha256(canonical({
    inputs: previous.data.inputs, outputs: previous.data.outputs, receipts: previous.data.model?.receipts ?? null, last_change_request: previous.data.change_requests.at(-1) ?? null,
    config: effectiveHash(config, stage, definitions),
    pins: {build: state.pins.build, ...(stage === 'handoff' ? {head: state.pins.head, base: state.pins.base} : {})},
  })), foreign: Object.fromEntries(changedPaths.filter(file => !ownWrite(file)).map(file => [file, contentHash(root, file)]))} : null;
  const recorded = sameContentAsRecorded(root, state.repair_entry?.foreign, ownWrite);
  const sameCause = entry && state.repair_entry?.key === entry.key && isForeignMap(state.repair_entry.foreign) && changedPaths.every(recorded);
  const enteredRepair = reopened && !sameCause;
  if (state.inputs_digest && state.inputs_digest !== fingerprint || enteredRepair) {
    state.phase = state.phase === 'writer' ? 'writer' : 'repair'; state.source_snapshot = null;
  }
  // The key is recorded only when a writer repair actually starts. A retirement run that skips repair
  // (--supersedes goes straight to eval) leaves it unset, so a later invalidation still repairs.
  let pendingEntry = enteredRepair ? entry : null;
  const repairStarted = () => { if (pendingEntry) { state.repair_entry = pendingEntry; pendingEntry = null; } };
  if (options.supersedes?.length && state.phase !== 'reviewer') { state.phase = 'eval'; state.review_result = null; pendingEntry = null; }
  state.inputs_digest = fingerprint;
  state.source_snapshot ??= snapshotSources(root, stage, context);
  const requests = [...(previous?.data.change_requests ?? [])];
  if (previous?.request) {
    if (!previous.data.change_requests.length) throw new RunnerError(`${stage}: changes-requested requires request by email/time`);
    requests.push({...previous.data.change_requests.at(-1), text: previous.request});
  }
  let repair = requests.map(r => r.text).join('\n');
  const entryFixRound = state.rounds.eval_fix; let firstWriter = true;
  async function writer(round = state.rounds.eval_fix + state.rounds.review) {
    const prompt = writerPrompt(root, stage, context.declared, declared, coWrittenRequest(root, config, registry, stage, repair));
    const cmd = config.agents.writer.command;
    // Keep the existing re-entry log coordinate while reserving its repair
    // before execution. Subsequent repair logs use the consumed round.
    const logRound = firstWriter && (previous?.value === 'CHANGES_REQUESTED' || previous?.invalidated) ? entryFixRound : state.rounds.eval_fix;
    const log = `${config.review.log_dir}/${stage}-writer-${logRound}-${state.rounds.review}.txt`;
    const result = cmd === 'manual'
      ? await manualAgent(root, stage, 'writer', round, prompt, context.inputs, options, print)
      : await runCommand(cmd, {cwd: root, input: prompt, timeout: options.timeout});
    if (cmd !== 'manual' && (commandFailed(result) || result.code !== 0)) throw commandFailure('Writer not runnable', cmd, result, log.replace(/\.txt$/, '-stderr.txt'));
    firstWriter = false;
    writeLocal(root, log, redact(result.stdout));
    state.outputs = materialize(root, declared, result.stdout, coWriteHooks(root, config, registry, stage));
    state.written_outputs = {...state.written_outputs, ...hashes(root, state.outputs)};
    state.last_evals = []; state.eval_outputs = null;
    currentReview();
    // A declared output may also be a source ledger. Retain its original bytes
    // for review, but resume the phase against the newly materialized inventory.
    state.inputs_digest = sha256(canonical(stageContext(root, config, registry, stage).inputs));
  }
  async function fix(reason) {
    repairStarted();
    while (true) {
      state.phase = 'repair'; repair = reason; state.repair_reason = reason;
      if (state.rounds.eval_fix >= state.effective_max_fix) {
        saveState(root, stage, state);
        throw new RunnerError(`Fix cap exhausted at ${stage}; PO scoped continuation required; ${recovery}`, 2);
      }
      if (config.agents.writer.command === 'manual' && !((options.result || options.paste) && !options.resultConsumed)) {
        saveState(root, stage, state);
        await writer(state.rounds.eval_fix + state.rounds.review + 1);
      }
      reserveAttempt(root, stage, state, 'eval_fix');
      try { await writer(); state.phase = 'eval'; saveState(root, stage, state); return; }
      catch (error) { if (!(error instanceof WriterFailure)) throw error; reason = error.message; }
    }
  }
  if (state.phase === 'repair') await fix(previous?.value === 'CHANGES_REQUESTED' ? repair : state.repair_reason ?? repair);
  saveState(root, stage, state);
  if (state.phase === 'writer') {
    repairStarted();
    try { await writer(); state.phase = 'eval'; }
    catch (error) { if (!(error instanceof WriterFailure)) throw error; await fix(error.message); }
    saveState(root, stage, state);
  }
  if (state.phase === 'reviewer' && canonical(state.eval_outputs) !== canonical(hashes(root, reviewProduced()))) state.phase = 'eval';
  let review = state.review_result ?? disabledReview();
  while (state.phase !== 'settled') {
    if (state.phase === 'eval') {
      const evaluated = await evaluate(root, config, stage, options, state);
      state.eval_results.push(...evaluated.results);
      state.last_evals = evaluated.results;
      state.eval_outputs = hashes(root, reviewProduced());
      if (evaluated.failed) {
        if (options.supersedes?.length) { state.phase = 'reviewer'; saveState(root, stage, state); continue; }
        try {
          // The writer cannot be assumed to open the report path, so the repair request carries the same bounded excerpts the reviewer sees. The logs were redacted when written; the request text is not hashed.
          const failing = evaluated.results.filter(e => e.exit_code !== 0);
          await fix(`Eval failures: ${canonical(failing)}${currentEvalEvidence(root, failing, {access: 'The report paths above hold the full logs; the excerpts below are what the runner observed.', only: /\bERROR\b/})}`);
        }
        catch (error) { saveState(root, stage, state); throw error; }
        continue;
      }
      state.phase = config.review.enabled ? 'reviewer' : 'settled'; saveState(root, stage, state);
    }
    if (state.phase === 'reviewer') {
      if (state.rounds.review >= state.effective_max_review) {
        if (currentReview() && minorGatePending(review)) {state.phase = 'settled'; break;}
        if (state.review_invalidated) changedReviewStop();
        throw new RunnerError(`Review cap exhausted at ${stage}; PO scoped continuation required; ${recovery}`, 2);
      }
      const evalEvidence = currentEvalEvidence(root, state.last_evals);
      const reviewFiles = [...new Set([...context.context, ...reviewProduced(), ...Object.values(state.source_snapshot), ...(state.last_evals ?? []).map(row => row.report).filter(Boolean)])];
      const prompt = reviewerPrompt(root, context.context, reviewProduced(), config.review.rubric, file => readText(root, file), readText(root, 'prompts/reviewer.md'), file => readText(root, state.source_snapshot[file] ?? file), evalEvidence);
      const binding = reviewBinding(root, config, registry, stage, state, reviewDeclared);
      const cmd = config.agents.reviewer.command;
      const round = state.rounds.review;
      if (cmd !== 'manual' || options.result && !options.resultConsumed) reserveAttempt(root, stage, state, 'review');
      const result = cmd === 'manual'
        ? await manualAgent(root, stage, 'reviewer', round, prompt, hashes(root, [...context.context, ...produced()]), options, print)
        : await freshReview(root, cmd, prompt, reviewFiles, options);
      if (cmd !== 'manual' && (commandFailed(result) || result.code !== 0)) throw commandFailure('Reviewer not runnable', cmd, result, `${config.review.log_dir}/${stage}-review-${state.rounds.review}-stderr.txt`);
      let report = `${config.review.log_dir}/${stage}-review-${state.rounds.review}.txt`;
      writeLocal(root, report, redact(result.stdout));
      try { review = parseReview(result.stdout, cmd !== 'manual' || result.independent, report); }
      catch (error) {
        if (!(error instanceof ReviewFormatError)) throw new RunnerError(`${error.message}; raw output: ${report}`, 4);
        appendAudit(root, {type: 'eval', scope: definition.scope, refs: [definition.id, report], reason: `Reviewer format repair: ${error.message}; ${cmd === 'manual' ? 'waiting for manual correction' : 'one fresh re-ask; writer rounds unchanged'}`});
        if (cmd === 'manual') {
          print(`${error.message}; raw output: ${report}`);
          await manualAgent(root, stage, 'reviewer', state.rounds.review, prompt, hashes(root, [...context.context, ...produced()]), options, print);
        }
        const repaired = await freshReview(root, cmd, `${prompt}\nFORMAT REPAIR: ${error.message}\nReturn the complete review in the required format using the same sources and final outputs.`, reviewFiles, options);
        report = `${config.review.log_dir}/${stage}-review-${state.rounds.review}-format-repair.txt`;
        writeLocal(root, report, redact(repaired.stdout));
        if (commandFailed(repaired) || repaired.code !== 0) throw commandFailure('Reviewer format repair not runnable', cmd, repaired, report.replace(/\.txt$/, '-stderr.txt'), `; parser error: ${error.message}; raw output: ${report}`);
        try { review = parseReview(repaired.stdout, true, report); }
        catch (second) { throw new RunnerError(`${second.message}; raw output: ${report}`, 4); }
      }
      state.review_result = review; state.review_binding = binding; state.review_invalidated = false;
      state.reviewed_outputs = binding.outputs; saveState(root, stage, state);
      if (!currentReview()) changedReviewStop();
      const required = REVIEW_REQUIRED_STAGES.includes(stage);
      if (reviewEligible(review, {required, approvers: config.roles.po.approvers ?? []})) { state.phase = 'settled'; break; }
      if (options.supersedes?.length) { state.phase = 'settled'; break; }
      if (state.rounds.review >= state.effective_max_review && minorGatePending(review)) {state.phase = 'settled'; break;}
      if (['BLOCKED', 'NOT_RUN'].includes(review.verdict) || !review.independent || state.rounds.review >= state.effective_max_review) {
        if (!review.independent && review.verdict === 'PASS') state.phase = 'settled'; else throw new RunnerError(`${stage}: ${review.verdict}; inspect ${report}${state.rounds.review >= state.effective_max_review ? `; ${recovery}` : ''}`, 2);
        break;
      }
      const before = hashes(root, produced());
      await fix(reviewRepair(review));
      if (canonical(before) === canonical(hashes(root, produced()))) {
        if (minorGatePending(review) && currentReview()) {
          const evaluated = await evaluate(root, config, stage, options, state);
          state.eval_results.push(...evaluated.results); state.last_evals = evaluated.results; state.eval_outputs = hashes(root, reviewProduced());
          if (!evaluated.failed && currentReview()) {state.phase = 'settled'; break;}
        }
        if (state.review_invalidated) changedReviewStop();
        throw new RunnerError(`${stage}: final ${review.verdict}, no edits; inspect ${report}`, 2);
      }
      // Final changed output always returns through eval and fresh review.
    }
  }
  if (config.review.enabled && !currentReview()) changedReviewStop();
  saveState(root, stage, state);
  const role = {owner: config.stages[stage].owner, ...config.roles[config.stages[stage].owner]}; delete role.approvers;
  const required = config.review.enabled && REVIEW_REQUIRED_STAGES.includes(stage);
  let eligible = reviewEligible(review, {required, approvers: config.roles.po.approvers ?? []});
  const pins = livePins(root, options, registry.baseline, stage);
  const candidates = stageCandidates(root, definitions, context.skipped, pins, optionalFiles(root, config.stages[stage]));
  for (const candidate of candidates) {
    if (candidate.definition.scope.revision !== candidate.scope.revision) {
      appendAudit(root, {type: 'exception', scope: candidate.scope, before: candidate.definition.scope.revision, after: candidate.scope.revision, refs: [candidate.definition.id], reason: `scope-version-required: ${candidate.definition.id}; membership changed; a person must add a new version/binding`});
      throw new RunnerError(`scope-version-required: ${candidate.definition.id}`, 2);
    }
  }
  const finalContext = stageContext(root, config, registry, stage);
  const candidate = candidates[0];
  const evidence = loadEvidence(root, config);
  const prepared = candidates.map(row => ({candidate: row, receipt: prepareReceipt(root, config, row.definition, row, [...finalContext.context, ...Object.values(state.source_snapshot)], row.definition.outputs, state, review, state.last_evals ?? [], {supersedes: retirementRows(evidence, row, options.supersedes ?? [])})}));
  immutableJson(root, `${config.gates.candidates_dir}/${candidate.digest}.json`, candidate.manifest, 'candidate-manifest.schema.json');
  const receipts = new Map(prepared.map(row => [row.candidate.definition.id, persistReceipt(root, config, row.candidate, row.receipt)]));
  const current = loadEvidence(root, config);
  const candidatePins = {head: pins.head, base: pins.base, build: pins.build, manifest: candidate.digest};
  const noImpact = noImpactProof(registry.graph, candidatePins, previous?.data.invalidation?.impact ? {candidate: candidatePins, impact: previous.data.invalidation.impact} : null, {root, config});
  const selected = candidates.flatMap(row => memberQueries(row.manifest, row.scope, candidatePins, {reviewRequired: config.review.enabled, handoff: stage === 'handoff', noImpact,
    usedVersions: versionsUsed(config, stage, [row.definition])}).map(query => selectHeads(current, query)));
  const evidenceReason = selected.find(row => !row.eligible)?.reason;
  eligible &&= selected.every(row => row.eligible);
  const receipt = receipts.get(definition.id);
  const value = !eligible || (stage === 'handoff' && pins.dirty) || (stage === 'uiux' && pins.build === 'not-built') || (role.enabled && role.gate) ? 'PENDING' : 'NOT_REQUIRED';
  const model = {
    definition: {id: definition.id, version: definition.version}, scope: candidate.scope,
    states: {eval: prepared[0].receipt.execution.result, review: review.verdict ?? 'NOT_RUN', human: value, freshness: prepared[0].receipt.freshness, progress: eligible ? 'in-review' : 'draft', delivery: 'draft'},
    receipts: [receipt], rounds: state.rounds, decision: null, exception_ids: [...new Set([...definition.exceptions, ...state.exception_ids])], candidate: {head: pins.head, base: pins.base, manifest: candidate.digest, build: pins.build},
  };
  for (const scoped of candidates) {
    const preserved = scoped.definition.id !== definition.id ? retainScoped(root, config, scoped, previous, {noImpact}) : null;
    const record = preserved ?? {...model, definition: {id: scoped.definition.id, version: scoped.definition.version}, scope: scoped.scope, receipts: [receipts.get(scoped.definition.id)], candidate: {...model.candidate, manifest: scoped.digest}};
    writeLocal(root, `${config.gates.dir}/scoped/${scoped.definition.id}/${scoped.scope.revision}.json`, canonical(record) + '\n');
  }
  const data = {
    stage, context: finalContext.context, inputs: finalContext.inputs, outputs: hashes(root, produced()), config_sha256: effectiveHash(config, stage, definitions), role,
    evals: state.eval_results, review, versions: {workflow: config.versions.workflow, templates: config.versions.templates, ruleset: config.versions.ruleset},
    change_requests: requests, invalidation: null, model,
  };
  writeGate(root, config, stage, value, data);
  appendAudit(root, {type: 'change', scope: model.scope, after: model.scope.revision, refs: [definition.id, ...receipts.values()], reason: `Stage settled ${value}; ${evidenceReason ?? 'all current heads eligible'}; skipped disabled outputs: ${finalContext.skipped.join(', ') || 'none'}; dirty=${pins.dirty}`});
  print(`${stage}: GATE: ${value} -> ${config.gates.dir}/${stage}.md${evidenceReason ? `; ${evidenceReason}` : ''}`);
  return value;
}

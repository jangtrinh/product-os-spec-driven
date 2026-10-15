import {contentScope} from '../lib/definition-scope.mjs';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {hashes, sha256, localPath, RunnerError} from '../lib/config/path-selection.mjs';
import {concreteOutputs} from '../lib/output-patterns.mjs';
import {immutableJson, appendAudit} from './audit-store.mjs';
import {loggedObservation} from './output-observation.mjs';
import {loadEvidence, validateSupersession} from './evidence-heads.mjs';
import {composedPromptFiles} from './composed-prompt-files.mjs';

export function prepareReceipt(root, config, definition, candidate, inputs, outputs, state, review, evals, {supersedes = []} = {}) {
  for (const result of evals) {
    const log = result.report && fs.readFileSync(localPath(root, result.report), 'utf8');
    const observation = loggedObservation(log);
    if (!observation.observed || observation.exit !== result.exit_code) throw new RunnerError(`Missing evaluator observation; cannot create a behavioral receipt: ${observation.reason ?? 'command exit mismatch'}`, 4);
  }
  const id = `receipt-${randomUUID()}`;
  const produced = concreteOutputs(root, outputs);
  const artifacts = hashes(root, [...inputs, ...produced, ...evals.map(e => e.report).filter(Boolean), ...(review.report ? [review.report] : [])]);
  const actual = evals.length ? evals.at(-1) : null;
  const promptFiles = inputs.includes('prompts/reviewer.md') ? composedPromptFiles('reviewer') : [];
  const execution = {
    command: evals.map(e => e.command).join(' && ') || 'No configured eval commands; independent content review', cwd: '.',
    exit: actual?.exit_code ?? null, result: evals.length ? (evals.every(e => e.exit_code === 0) ? 'PASS' : 'FAIL') : 'NOT_RUN',
    selected: evals.length, total: evals.length, skipped: [], baseline_debt: [], red_controls: [],
    recovery: 'Inspect actual command reports; provide mandatory independent review/evidence before acceptance',
  };
  const receipt = {
    id, scope: contentScope(candidate.scope,candidate.manifest), at: new Date().toISOString(), freshness: evals.length ? 'CURRENT' : 'MISSING',
    pins: {head: candidate.pins.head, base: candidate.pins.base, build: candidate.pins.build, manifest: candidate.digest, artifact: sha256(canonical(hashes(root, produced))), context: sha256(canonical(hashes(root, inputs))), rules: config.versions.ruleset, evaluator: config.agents.reviewer.command, prompt: sha256(canonical(hashes(root, promptFiles))), scenario: 'not-applicable', test: 'not-applicable', ds: 'not-applicable', probe: 'not-applicable', environment: `node-${process.versions.node}`},
    execution, review: {
      builder: 'dev', reviewer: definition.reviewer, independent: review.independent, evaluator_version: config.agents.reviewer.command,
      prompt_version: config.versions.templates, ruleset_version: config.versions.ruleset, verdict: review.verdict ?? 'NOT_RUN',
      inputs: [...new Set([...inputs, ...produced])].sort(), criteria: review.criteria, findings: review.findings,
    },
    coverage: {ac: [], scenarios: [], passed: [], na: []}, artifacts, domain: 'spec',
  };
  if (supersedes.length) receipt.supersedes = supersedes;
  const context = loadEvidence(root, config, [], {proposed: [receipt], manifests: new Map([[candidate.digest, candidate.manifest]])});
  validateSupersession(context, receipt);
  return receipt;
}
export function persistReceipt(root, config, candidate, receipt) {
  const id = receipt.id;
  const context = loadEvidence(root, config, [], {proposed: [receipt], manifests: new Map([[candidate.digest, candidate.manifest]])});
  validateSupersession(context, receipt);
  immutableJson(root, `${config.gates.receipts_dir}/${id}.json`, receipt, 'evidence-receipt.schema.json');
  appendAudit(root, {type: 'eval', scope: candidate.scope, after: candidate.digest, refs: [id, ...(receipt.supersedes ?? []).map(row => row.id)], reason: `Actual eval/review observation; dirty=${candidate.pins.dirty}; no AC coverage inferred from command count`});
  return id;
}
export function recordReceipt(...args) { const receipt = prepareReceipt(...args); return persistReceipt(args[0], args[1], args[3], receipt); }

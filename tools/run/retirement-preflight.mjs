import {optionalFiles} from './optional-context.mjs';
import {contentScope} from '../lib/definition-scope.mjs';
import {randomUUID} from 'node:crypto';
import {hashes, RunnerError} from '../lib/config/path-selection.mjs';
import {definitionsFor, livePins} from './registries.mjs';
import {stageCandidates} from './stage-candidates.mjs';
import {ownGateExclusions} from './own-gate-exclusions.mjs';
import {loadEvidence, validateSupersession, receiptError} from './evidence-heads.mjs';

export function retirementRows(context, candidate, rows) {
  return rows.filter(row => {
    const old = context.records.get(row.id);
    return old && old.scope.kind === candidate.scope.kind && old.scope.ids.some(id => candidate.scope.ids.includes(id));
  });
}
export function preflightRetirement(root, config, registry, options) {
  if (!options.supersedes?.length) return;
  if (!options.stage) throw new RunnerError('--supersedes requires an explicit --stage', 2);
  if (!config.evals[options.stage].length) throw receiptError('Explicit retirement requires a nonempty evaluator selection');
  if (!config.review.enabled || config.agents.reviewer.command === 'manual' && !options.independentReview) throw receiptError('Explicit retirement requires independent review');
  const context = loadEvidence(root, config);
  for (const row of options.supersedes) if (!context.resident.has(row.id)) throw receiptError(`dangling supersession: ${row.id}`);
  let candidates;
  try { candidates = stageCandidates(root, definitionsFor(config, registry, options.stage), [], livePins(root, options, registry.baseline, options.stage), optionalFiles(root, config.stages[options.stage]), ownGateExclusions(config.gates.dir, options.stage, definitionsFor(config, registry, options.stage))); }
  catch (error) { throw receiptError(`Cannot establish identical member bytes before retirement: ${error.message}`); }
  const matched = new Set();
  for (const candidate of candidates) {
    const rows = retirementRows(context, candidate, options.supersedes); if (!rows.length) continue;
    const receipt = {id: `preflight-${randomUUID()}`, domain: 'spec', scope: contentScope(candidate.scope, candidate.manifest), freshness: 'CURRENT', pins: {...candidate.pins, manifest: candidate.digest, rules: config.versions.ruleset, evaluator: config.agents.reviewer.command}, artifacts: hashes(root, Object.keys(Object.assign({}, ...candidate.manifest.members.filter(m => m.kind === candidate.scope.kind && candidate.scope.ids.includes(m.id)).map(m => m.artifacts)))), review: {builder: 'dev', reviewer: candidate.definition.reviewer, independent: true}, supersedes: rows};
    context.records.set(receipt.id, receipt); context.resident.add(receipt.id); context.manifests.set(candidate.digest, candidate.manifest);
    context.events.push({type: 'eval', refs: [receipt.id, ...rows.map(row => row.id)]});
    validateSupersession(context, receipt); rows.forEach(row => matched.add(row.id));
  }
  if (matched.size !== options.supersedes.length) throw receiptError('Supersession has no common bound member in the requested stage');
}

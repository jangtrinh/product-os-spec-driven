import {parseJson} from '../lib/config/strict-json.mjs';
import {schema, validateSchema} from '../lib/config/schema-validation.mjs';
import fs from 'node:fs';
import {RunnerError, localPath} from '../lib/config/path-selection.mjs';
import {classifyObservation} from './output-observation.mjs';

export function computeVerdict(criteria, findings) {
  const active = criteria.filter(c => c.applicability !== 'na');
  if (!active.length) return 'NOT_RUN';
  if (active.some(c => c.score === 0)) return 'FAIL';
  if (active.some(c => c.score === 1) || findings.some(f => ['open', 'accepted-minor'].includes(f.disposition))) return 'NEEDS_CHANGES';
  return 'PASS';
}
export function parseReview(text, independent, report = null) {
  const observation = classifyObservation(text, {parse: clean => parseReviewData(clean, independent, report)});
  if (observation.error) throw new ReviewFormatError(observation.error.message);
  if (!observation.observed) throw new RunnerError(`Missing reviewer observation: ${observation.reason}`, 4);
  return observation.value;
}
export class ReviewFormatError extends RunnerError {
  constructor(message) { super(message, 4); }
}
function parseReviewData(text, independent, report) {
  const verdict = /^VERDICT: (PASS|NEEDS_CHANGES|FAIL|BLOCKED|NOT_RUN)\r?\n/.exec(text + '\n')?.[1];
  if (!verdict) throw new RunnerError('Reviewer must start with a valid VERDICT line', 4);
  const blocks = [...text.matchAll(/^```review-data\r?\n([\s\S]*?)^```\s*$/gm)];
  // Scores and dispositions are load-bearing; a free-form PASS cannot waive them.
  if (blocks.length !== 1) throw new RunnerError('Reviewer must provide exactly one review-data JSON block with criteria/findings', 4);
  const payload = parseJson(blocks[0][1], 'review-data');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new RunnerError('review-data must be an object', 4);
  if (Object.keys(payload).sort().join(',') !== 'criteria,findings') throw new RunnerError('review-data must contain criteria/findings only', 4);
  if (!Array.isArray(payload.criteria) || !Array.isArray(payload.findings)) throw new RunnerError('review-data criteria/findings must be arrays', 4);
  const criteria = payload.criteria.map(row => row.applicability ? row : {...row, applicability: 'applicable'});
  const review = {enabled: true, independent, verdict, criteria, findings: payload.findings, report};
  validateSchema(review, schema('gate-review.schema.json'), 'review');
  const ids = new Set(criteria.map(c => c.id));
  if (ids.size !== criteria.length || new Set(review.findings.map(f => f.id)).size !== review.findings.length || review.findings.some(f => !ids.has(f.criterion))) throw new RunnerError('Duplicate or unknown review criterion/finding id', 4);
  // Agent output cannot establish a human decision, even when it quotes a PO email.
  for (const finding of review.findings) if (finding.disposition === 'accepted-minor') {
    finding.disposition = 'open'; delete finding.accepted_by; delete finding.follow_up;
  }
  const computed = computeVerdict(criteria, review.findings);
  if (!['BLOCKED', 'NOT_RUN'].includes(verdict) && verdict !== computed) throw new RunnerError(`Reviewer verdict ${verdict} contradicts computed ${computed}`, 4);
  return review;
}
export function reviewEligible(review, {required = false, approvers = []} = {}) {
  if (!review.enabled) return !required;
  if (!review.independent || !['PASS', 'NEEDS_CHANGES'].includes(review.verdict)) return false;
  const applicable = review.criteria.filter(c => c.applicability !== 'na');
  if (!applicable.length || applicable.some(c => c.mandatory && c.score !== 2)) return false;
  if (review.criteria.some(c => c.applicability === 'na' && !['po', ...approvers].includes(c.confirmer))) return false;
  return review.findings.every(f => ['fixed', 'rejected'].includes(f.disposition) || (f.severity === 'Minor' && f.disposition === 'accepted-minor' && approvers.includes(f.accepted_by) && f.reason && f.follow_up));
}
export function reviewerPrompt(root, context, outputs, rubric, read, prompt, original = read, evalEvidence = '') {
  const common = fs.readFileSync(localPath(root, 'prompts/_common.md'), 'utf8').split('## Định dạng kết quả writer')[0];
  const sources = [...new Set([rubric, ...context.filter(file => file !== 'prompts/_common.md')])].sort();
  return `${common}\n${prompt}\nREAD-ONLY INDEPENDENT REVIEW. Score original source/AC and final outputs; do not edit files.${evalEvidence}\nReturn VERDICT first and one review-data JSON block: {criteria:[{id,mandatory,score,evidence}],findings:[]}.\n${sources.map(file => `\n--- ORIGINAL SOURCE: ${file} ---\n${original(file)}`).join('\n')}\n${[...new Set(outputs)].sort().map(file => `\n--- FINAL OUTPUT: ${file} ---\n${read(file)}`).join('\n')}`;
}

import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {hashes, localPath, sha256} from '../lib/config/path-selection.mjs';
import {jsonFile} from './registries.mjs';
import {validateReceiptRevision} from './receipt-bindings.mjs';
import {composedPromptFiles} from './composed-prompt-files.mjs';
import {coWriteSettled} from './co-written-outputs.mjs';

export function receiptMembers(context, receipt, fallbackDigest) {
  const digest = receipt.pins.manifest ?? fallbackDigest;
  const file = digest && `${context.config.gates.candidates_dir}/${digest}.json`;
  const manifest = context.manifests.get(digest) ?? (file && fs.existsSync(localPath(context.root, file)) ? jsonFile(context.root, file) : null);
  if (!manifest || sha256(canonical(manifest)) !== digest) return fallbackDigest && digest !== fallbackDigest ? receiptMembers(context, {...receipt, pins: {...receipt.pins, manifest: fallbackDigest}}) : [];
  return manifest.members.filter(member => member.kind === receipt.scope.kind && receipt.scope.ids.includes(member.id));
}
export function domainPins(receipt) {
  return {build: receipt.pins.build, rules: receipt.pins.rules ?? receipt.review.ruleset_version, evaluator: receipt.pins.evaluator ?? receipt.review.evaluator_version, ...(receipt.pins.ruleset ? {ruleset: receipt.pins.ruleset} : {})};
}
export function evidenceKey(receipt, member, {handoff = member.kind === 'stage' && member.id === 'handoff'} = {}) {
  const artifacts = Object.fromEntries(Object.keys(member.artifacts).sort().map(file => [file, receipt.artifacts[file] ?? null]));
  const pins = domainPins(receipt);
  if (handoff) for (const key of ['head', 'base', 'manifest']) pins[key] = receipt.pins[key];
  return canonical({kind: member.kind, id: member.id, domain: receipt.domain, revision: receipt.scope.revision, artifacts, pins});
}
export function declaredCurrent(context, receipt) {
  const overlay = `review/freshness/${receipt.id}.json`;
  return receipt.freshness === 'CURRENT' && (!fs.existsSync(localPath(context.root, overlay)) || jsonFile(context.root, overlay).freshness === 'CURRENT');
}
export function currentFor(context, receipt, query) {
  if (!declaredCurrent(context, receipt)) return false;
  const member = query.member;
  const members = receiptMembers(context, receipt, query.pins.manifest);
  const binding = members.find(row => row.kind === member.kind && row.id === member.id);
  if (!binding || canonical(binding.artifacts) !== canonical(member.artifacts)) return false;
  for (const [file, digest] of Object.entries(Object.assign({}, ...members.map(row => row.artifacts)))) {
    if (receipt.artifacts[file] !== digest) return false;
    if (query.reviewRequired !== false && !receipt.review.inputs.includes(file)) return false;
    try {
      const live = hashes(context.root, [file])[file];
      // A later stage's insert-only write to a shared output is not drift of this stage's evidence.
      if (live !== digest && !(receipt.scope.kind === 'stage' && coWriteSettled(context.root, context.config, receipt.scope.ids[0], file, digest))) return false;
    } catch { return false; }
  }
  const targets = query.members ?? receiptMembers(context, {...receipt, pins: {...receipt.pins, manifest: query.pins.manifest}});
  validateReceiptRevision(receipt, targets);
  const pins = domainPins(receipt);
  const versions = query.usedVersions ?? context.config.versions;
  if (pins.build !== query.pins.build || versions.ruleset !== undefined && receipt.pins.rules !== undefined && pins.rules !== versions.ruleset || receipt.pins.evaluator !== undefined && pins.evaluator !== (query.evaluator ?? context.config.agents.reviewer.command)) return false;
  if (versions.templates !== undefined && receipt.review.prompt_version !== versions.templates) return false;
  const moved = ['head', 'base', 'manifest'].some(key => receipt.pins[key] !== query.pins[key]);
  if (moved && query.handoff) return false;
  if (!query.graphProof && query.reviewRequired !== false) for (const file of [context.config.review.rubric, ...composedPromptFiles('reviewer')]) {
    try { if (receipt.artifacts[file] !== hashes(context.root, [file])[file]) return false; } catch { return false; }
  }
  return true;
}
export function candidateAcceptable(receipt, query) {
  if (['head', 'base', 'manifest'].some(key => !receipt.pins[key])) return false;
  return !['head', 'base', 'manifest'].some(key => receipt.pins[key] !== query.pins[key]) || Boolean(query.noImpact?.(receipt, query.member));
}

import {canonical} from '../lib/config/strict-json.mjs';
import {sha256, RunnerError} from '../lib/config/path-selection.mjs';

export function validateReviewVersions(receipt) {
  for (const [pin, field] of [['evaluator', 'evaluator_version'], ['rules', 'ruleset_version']]) {
    if (Object.hasOwn(receipt.pins, pin) && receipt.pins[pin] !== receipt.review[field]) throw new RunnerError(`Q-RECEIPT: review ${field} differs from pins.${pin}: ${receipt.id}`, 2);
  }
}
// All consumers bind the whole receipt scope to the current target membership,
// including receipts spanning several members and graph-census evidence.
export function validateReceiptRevision(receipt, targetMembers) {
  const members = targetMembers?.filter(member => member.kind === receipt.scope.kind && receipt.scope.ids.includes(member.id));
  if (!members?.length || members.length !== receipt.scope.ids.length || receipt.scope.ids.some(id => members.filter(member => member.id === id).length !== 1) || sha256(canonical(members)) !== receipt.scope.revision) throw new RunnerError(`Q-RECEIPT: scope.revision differs from current target membership: ${receipt.id}`, 2);
  return true;
}

import {canonical} from '../lib/config/strict-json.mjs';

export function minorGatePending(review) {
  if (!review.enabled || !review.independent || review.verdict !== 'NEEDS_CHANGES') return false;
  const active = review.criteria.filter(row => row.applicability !== 'na');
  const remaining = review.findings.filter(row => !['fixed', 'rejected'].includes(row.disposition));
  return active.length > 0 && active.every(row => !row.mandatory || row.score === 2)
    && !review.findings.some(row => ['Critical', 'Major'].includes(row.severity))
    && remaining.length > 0 && remaining.every(row => row.severity === 'Minor' && row.disposition === 'open');
}
// Read a human's edits; never manufacture a disposition or PO identity.
export function poReviewForReceipt(record, gate, approvers) {
  if (gate?.value !== 'APPROVED' || !approvers.includes(gate.data.approval?.by) || Date.parse(gate.data.approval.at) > Date.now()) return null;
  const model = gate.data.model;
  if (!model || model.states.freshness !== 'CURRENT' || model.scope.kind !== record.scope.kind || canonical(model.scope.ids) !== canonical(record.scope.ids)) return null;
  if (!gate.data.model?.receipts.includes(record.id) || canonical(gate.data.model.candidate) !== canonical({head: record.pins.head, base: record.pins.base, manifest: record.pins.manifest, build: record.pins.build})) return null;
  const observed = record.review, human = gate.data.review;
  if (!minorGatePending({enabled: true, ...observed}) || !human.enabled || !human.independent || human.verdict !== observed.verdict || canonical(human.criteria) !== canonical(observed.criteria) || human.findings.length !== observed.findings.length) return null;
  for (const original of observed.findings) {
    const decision = human.findings.find(row => row.id === original.id);
    if (!decision) return null;
    if (original.disposition !== 'open') {if (canonical(decision) !== canonical(original)) return null; continue;}
    if (decision.disposition !== 'accepted-minor' || decision.accepted_by !== gate.data.approval.by || !decision.reason?.trim() || !decision.follow_up?.trim()) return null;
    const strip = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['disposition', 'reason', 'accepted_by', 'follow_up'].includes(key)));
    if (canonical(strip(original)) !== canonical(strip(decision))) return null;
  }
  return human;
}

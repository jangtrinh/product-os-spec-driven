import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {inventory, localPath, RunnerError} from '../lib/config/path-selection.mjs';
import {readRecord, schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {auditEvents} from './audit-store.mjs';
import {currentFor, declaredCurrent, evidenceKey, receiptMembers, candidateAcceptable} from './receipt-keys.mjs';
import {readGate} from './gate-files.mjs';
import {STAGES} from '../lib/config/config-loader.mjs';
import {poReviewForReceipt, minorGatePending} from './minor-decisions.mjs';
import {reviewEligible} from './review-results.mjs';
import {validateReviewVersions} from './receipt-bindings.mjs';

export const receiptError = reason => new RunnerError(`Q-RECEIPT: ${reason}`, 2);
export function loadEvidence(root, config, embedded = [], {proposed = [], manifests = new Map()} = {}) {
  const context = {root, config, records: new Map(), resident: new Set(), events: auditEvents(root), manifests, gates: STAGES.map(stage => readGate(root, config, stage)).filter(Boolean)};
  const add = (record, resident) => {
    try { validateSchema(record, schema('evidence-receipt.schema.json'), record.id); } catch (error) { throw receiptError(error.message); }
    validateReviewVersions(record);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(record.id)) throw receiptError('Invalid receipt id');
    const prior = context.records.get(record.id);
    if (prior && canonical(prior) !== canonical(record)) throw receiptError(`duplicate id with different canonical content: ${record.id}`);
    context.records.set(record.id, record); if (resident) context.resident.add(record.id);
  };
  if (fs.existsSync(localPath(root, config.gates.receipts_dir))) for (const file of inventory(root, config.gates.receipts_dir).filter(file => file.endsWith('.json'))) {
    let record;
    try { record = readRecord(root, file, 'evidence-receipt.schema.json'); } catch (error) { throw receiptError(error.message); }
    add(record, true);
  }
  for (const record of embedded) add(record, false);
  for (const record of proposed) {
    add(record, true);
    // Preflight the exact eval witness that recordReceipt will append.
    context.events.push({type: 'eval', refs: [record.id, ...(record.supersedes ?? []).map(row => row.id)]});
  }
  return context;
}
export function receiptEligible(record, {reviewRequired = true, approvers = [], humanReview = null} = {}) {
  if (record.execution.result !== 'PASS' || record.execution.exit !== 0 || record.execution.selected < 1) return false;
  if (!reviewRequired) return true;
  if (!record.review.independent || record.review.builder === record.review.reviewer) return false;
  const review = {enabled: true, independent: true, verdict: record.review.verdict, criteria: record.review.criteria, findings: record.review.findings};
  return reviewEligible(humanReview ?? review, {required: true, approvers});
}
export function validateSupersession(context, receipt) {
  if (!receipt.supersedes?.length) return;
  if (!context.resident.has(receipt.id)) throw receiptError(`superseder is not store-resident: ${receipt.id}`);
  if (!declaredCurrent(context, receipt)) throw receiptError(`superseder is not CURRENT: ${receipt.id}`);
  if (!receipt.review.independent || receipt.review.builder === receipt.review.reviewer) throw receiptError(`superseder is not independently reviewed: ${receipt.id}`);
  const members = receiptMembers(context, receipt);
  if (!members.length) throw receiptError(`superseder has no bound members: ${receipt.id}`);
  const named = new Set();
  for (const row of receipt.supersedes) {
    const old = context.records.get(row.id);
    if (!row.reason.trim() || row.id === receipt.id || named.has(row.id) || !old || !context.resident.has(row.id)) throw receiptError(`self/duplicate/dangling supersession: ${receipt.id} -> ${row.id}`);
    named.add(row.id);
    const common = receiptMembers(context, old, receipt.pins.manifest).filter(member => members.some(m => m.kind === member.kind && m.id === member.id));
    if (!common.length || common.some(member => evidenceKey(receipt, member) !== evidenceKey(old, member))) throw receiptError(`supersession changes evidence key: ${receipt.id} -> ${row.id}`);
    if (!context.events.some(event => event.type === 'eval' && event.refs.includes(receipt.id) && event.refs.includes(row.id))) throw receiptError(`missing eval audit witness: ${receipt.id} -> ${row.id}`);
  }
}
export function selectHeads(context, query) {
  const current = [...context.records.values()].filter(record => (!query.filter || query.filter(record)) && (!query.domain || record.domain === query.domain) && currentFor(context, record, query));
  const groups = new Map();
  for (const record of current) {
    const key = evidenceKey(record, query.member, query);
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(record);
  }
  const heads = [];
  for (const records of groups.values()) {
    const ids = new Set(records.map(record => record.id));
    const incoming = new Map(records.map(record => [record.id, 0]));
    for (const record of records) for (const row of record.supersedes ?? []) if (ids.has(row.id)) incoming.set(row.id, incoming.get(row.id) + 1);
    const queue = records.filter(record => incoming.get(record.id) === 0); const retired = new Set(); const visited = new Set();
    while (queue.length) {
      const record = queue.shift(); if (visited.has(record.id)) continue; visited.add(record.id);
      if (!retired.has(record.id)) { validateSupersession(context, record); heads.push(record); }
      for (const row of record.supersedes ?? []) if (ids.has(row.id)) {
        if (!retired.has(record.id)) { retired.add(row.id); queue.push(records.find(r => r.id === row.id)); }
        incoming.set(row.id, incoming.get(row.id) - 1);
        if (incoming.get(row.id) === 0) queue.push(records.find(r => r.id === row.id));
      }
    }
    if (visited.size !== records.length) throw receiptError('supersession cycle');
  }
  const eligible = heads.length > 0 && heads.every(record => {
    if (!receiptMembers(context, record).length || !candidateAcceptable(record, query)) return false;
    const humanReview = context.gates.map(gate => poReviewForReceipt(record, gate, context.config.roles.po.approvers ?? [])).find(Boolean);
    if (receiptEligible(record, {reviewRequired: query.reviewRequired, approvers: context.config.roles.po.approvers ?? [], humanReview})) return true;
    return Boolean(query.allowPendingMinor && receiptEligible(record, {reviewRequired: false})
      && record.review.builder !== record.review.reviewer && minorGatePending({enabled: true, ...record.review}));
  });
  const conflicts = [...groups.values()].flatMap(records => {
    const active = records.filter(record => heads.includes(record));
    return new Set(active.map(record => `${record.execution.result}/${record.review.verdict}`)).size > 1 ? active.map(record => record.id) : [];
  });
  return {heads, eligible, reason: conflicts.length ? `conflicting current evidence ${[...new Set(conflicts)].sort().join(', ')}` : eligible ? null : `ineligible current evidence ${heads.map(record => record.id).sort().join(', ') || '(no heads)'}`};
}
export function requireHeads(context, queries) {
  const selected = queries.map(query => selectHeads(context, query));
  const bad = selected.find(result => !result.eligible);
  if (bad) throw new RunnerError(bad.reason, 2);
  return [...new Map(selected.flatMap(result => result.heads).map(record => [record.id, record])).values()];
}

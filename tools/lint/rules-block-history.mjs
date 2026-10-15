import { loadBlockHistory } from '../lib/block-history.mjs';

export function blockHistoryRules(model, P) {
  const history = loadBlockHistory(model.spec);
  const file = model.spec.manifest?.changes?.blocks || 'spec.manifest.json';
  const add = (code, message) => P.add(code, file, 1, message, 'fix the amendment-owned block history record; keep current requirement Markdown clean');
  for (const issue of history.issues) add(issue.code, issue.message);
  const pages = new Set(model.docs.map((d) => d.pageId));
  const refs = new Set([...model.decisions.map((d) => d.id), ...(model.amend?.items || []).map((a) => a.id)]);
  const ids = new Set();
  const previous = new Map();
  for (const record of history.entries) {
    if (ids.has(record.id)) add('B-ID', `duplicate block change id ${record.id}`);
    ids.add(record.id);
    if (record.before) {
      const key = JSON.stringify([record.page, record.before]);
      if (previous.has(key)) add('B-BEFORE-SHARED', `${record.id}: previous block already belongs to ${previous.get(key)}`);
      previous.set(key, record.id);
    }
    if (!pages.has(record.page)) add('B-PAGE', `${record.id}: unknown page ${record.page}`);
    for (const ref of Array.isArray(record.refs) ? record.refs : []) if (!refs.has(ref)) add('B-REF', `${record.id}: unknown decision/amendment ${ref}`);
    const doc = model.docs.find((d) => d.pageId === record.page);
    if (doc && typeof record.after === 'string' && record.after && !doc.body.includes(record.after)) add('B-AFTER', `${record.id}: current block does not occur in the page Markdown`);
    if (typeof record.before !== 'string' || typeof record.after !== 'string') add('B-TEXT', `${record.id}: before and after must be present as strings (empty is valid for new or removed blocks)`);
    if (!record.before && !record.after) add('B-TEXT', `${record.id}: before and after cannot both be empty`);
    if (typeof record.date === 'string' && (!Number.isFinite(Date.parse(record.date)) || new Date(record.date).toISOString().slice(0, 10) !== record.date)) add('B-DATE', `${record.id}: invalid date ${record.date}`);
  }
}

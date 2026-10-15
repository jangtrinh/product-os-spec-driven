import path from 'node:path';
import { slug } from '../../lib/slug.mjs';

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const nat = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const storyIdsIn = (v) => [...new Set(JSON.stringify(v).match(/\b(?:US-(?:\d+|P\d+)|NF-\d+)\b/g) || [])];

/* Reference chain: PRD requirements -> stories -> acceptance criteria -> screens -> boards and scenarios. Returns null (and a reason) when the spec lacks the inputs. */
export function buildChain(model, pagesById, skipped) {
  if (!model.reqs.length || !model.stories.length) { skipped.push({ page: 'reference-chain', reason: 'needs a prd document with a requirement table and at least one us document' }); return null; }
  const stories = model.stories.map(({ doc, ac }) => {
    const scn = [...new Set([...(doc.fm.scenarios || []), ...ac.rows.flatMap((r) => r.scn)])];
    return {
      id: doc.id, title: doc.fm.title, prio: doc.fm.priority || '', epic: doc.fm.epic || '', reqs: [...new Set((doc.fm.trace && doc.fm.trace.req) || [])],
      page: doc.pageId, screens: doc.fm.screens || [], acs: ac.rows.map((a) => ({ id: a.id, when: a.when, then: a.then, scn: a.scn.length })),
      scenarios: scn.length, boards: doc.fm.boards || [], acHead: ac.headingId || '',
    };
  });
  const reqs = model.reqs.map((r) => ({ id: r.id, title: r.title, group: r.group, us: stories.filter((s) => s.reqs.includes(r.id)).map((s) => s.id), prdUs: r.us }));
  const names = Object.fromEntries(model.docs.filter((d) => d.type === 'wireframe-index').flatMap((d) => (d.fm.board_names || []).map((b) => [b.id, b.name])));
  const htmlNames = new Set(model.boardFiles.filter((b) => b.kind === 'html').map((b) => path.posix.basename(b.file)));
  const boards = model.boardFiles.filter((b) => b.kind === 'png').sort((a, b) => nat(a.file, b.file)).map((b) => {
    const base = path.posix.basename(b.file, '.png');
    const html = `${base}.html`;
    return { id: b.id, name: names[b.id] || base.replace(/^W-\d+-/, '').replace(/-/g, ' '), png: `images/${b.file}`, html: htmlNames.has(html) ? `wireframes/html/${html}` : '' };
  });
  const screens = [...new Set(stories.flatMap((s) => s.screens))];
  const hasPrdUs = reqs.some((r) => r.prdUs);
  const totals = {
    reqs: reqs.length, stories: stories.length, storiesWithReq: stories.filter((s) => s.reqs.length).length, acs: stories.reduce((n, s) => n + s.acs.length, 0),
    screens: screens.length, boards: boards.length, scenarios: stories.reduce((n, s) => n + s.scenarios, 0),
    reqsNoStory: reqs.filter((r) => !r.us.length).length, storiesNoReq: stories.filter((s) => !s.reqs.length).length,
    agree: hasPrdUs ? reqs.filter((r) => r.prdUs && sameSet(r.us, r.prdUs.filter((u) => stories.some((s) => s.id === u)))).length : null,
    unknownReqRefs: [...new Set(stories.flatMap((s) => s.reqs).filter((r) => !reqs.some((x) => x.id === r)))],
  };
  const firstOfType = (t) => (model.ofType(t)[0] || {}).pageId || '';
  const inventory = model.docs.find((d) => d.fm.inventory === true);
  return {
    reqs: reqs.map(({ prdUs, ...r }) => r), stories, boards, totals,
    prdPage: model.prd ? model.prd.pageId : (model.prdDocs[0] || {}).pageId || '', prdTitle: model.prd ? model.prd.id.toUpperCase() : '',
    usIndexPage: firstOfType('us-index'), boardsPage: firstOfType('wireframe-index'), inventoryPage: inventory ? inventory.pageId : '',
  };
}

export function buildDecisions(model, skipped) {
  if (!model.ledger || !model.decisions.length) { skipped.push({ page: 'decisions', reason: 'needs a decisions document with ledger: true and a table "Id | Decision | Detail"' }); return null; }
  const items = model.decisions.map((d) => {
    const re = new RegExp(`\\b${d.id}\\b`);
    const mentions = model.docs.filter((p) => p.data && !p.readable && p.pageId !== model.ledger.pageId && re.test(p.raw)).map((p) => ({ id: p.pageId, label: p.stem }));
    return { id: d.id, title: d.title, detail: d.detail, date: d.date, mentions };
  });
  const declared = model.ledger.fm.topics;
  const topics = declared && declared.length ? declared.map((t) => ({ id: t.id, name: t.name, note: t.note || '', ids: t.ids })) : [{ id: 'all', name: 'Decisions', note: 'Every ruling in the ledger', ids: items.map((i) => i.id) }];
  const assigned = new Set(topics.flatMap((t) => t.ids));
  const remaining = items.filter((i) => !assigned.has(i.id)).map((i) => i.id);
  if (remaining.length) topics.push({ id: 'ungrouped', name: 'Other decisions', note: 'Ledger rows without a declared topic', ids: remaining });
  return { pageId: model.ledger.pageId, items, topics };
}

export function buildAmendments(model, skipped) {
  const a = model.amend;
  if (!a || !a.items.length) { skipped.push({ page: 'amendments', reason: 'needs a contract document with "Amendment A-01 (date, source, D-id)" headings' }); return null; }
  const summaries = Object.fromEntries((a.doc.fm.amendments || []).map((x) => [x.id, x.summary]));
  const version = (am) => (a.changes.find((c) => c.ids.startsWith(am.id) || new RegExp(`${am.id}\\b`).test(c.why)) || {}).version || '';
  return {
    label: a.doc.id.toUpperCase(), fcId: a.doc.pageId,
    items: a.items.map((am) => ({ id: am.id, date: am.date, round: am.round, decision: am.decision, title: am.title, summary: summaries[am.id] || '', version: version(am), rows: am.rows.map((r) => ({ id: r.id, change: r.change, detail: r.detail })), headingId: am.headingId })),
    changes: a.changes.map(({ version: v, date, why, approved }) => ({ version: v, date, why, approved })),
  };
}

/* Readable layer: epic-map.json says which epic page holds each story and which stories are hidden. Epic pages named on the map are matched by file name. */
export function buildReadable(model, pages, skipped) {
  const readable = pages.filter((p) => p.layer === 'readable');
  if (!readable.length) { skipped.push({ page: 'readable view', reason: 'no readable documents (types release, epic) in the spec' }); return null; }
  const epicPages = readable.filter((p) => p.kind === 'epic');
  const out = { epics: epicPages.map((p) => ({ id: p.stem.replace(/^epic-(\d+).*/, '$1'), title: p.label, page: p.id, status: '' })), stories: {}, source: 'epic pages', error: '' };
  for (const p of epicPages) for (const id of storyIdsIn(p.md)) if (!out.stories[id]) out.stories[id] = { epic: p.id, epicTitle: p.label };
  const map = model.spec.epicMap;
  if (!map) return out;
  out.source = 'epic-map.json';
  const find = (e) => epicPages.find((p) => p.stem === String(e.page || '').replace(/\.md$/, '')) || epicPages.find((p) => e.title && slug.fold(p.title).includes(slug.fold(e.title)));
  out.epics = [];
  for (const e of map.epics || []) {
    const page = find(e);
    const title = e.title || (page && page.label) || String(e.id);
    out.epics.push({ id: e.id, title, page: page ? page.id : '', token: '', status: e.status || '', goal: e.goal || '' });
    const ids = (e.capabilities || []).flatMap((c) => [...(c.us || []), ...((c.merged || []).map((m) => m.us))]);
    for (const id of ids) out.stories[id] = { epic: page ? page.id : '', epicToken: '', epicTitle: title };
  }
  for (const h of map.hidden || []) for (const id of storyIdsIn(h.us || '')) out.stories[id] = { hidden: true, reason: h.reason || 'no reason recorded', category: h.category || '' };
  return out;
}

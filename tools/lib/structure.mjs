import { parseTables, strip, headings } from './md.mjs';
import { slug } from './slug.mjs';

/* Structured tables that Spec Format v1 defines inside document bodies. Every function takes a loaded doc ({ body, bodyLine }) and
   returns plain data plus 1-based file line numbers, so the linter can point at the exact row. */
export const lineOf = (doc, idx) => doc.bodyLine + idx;

export const REQ_ID = /^REQ-\d+$/;
export const STORY_ID = /^(?:US-(?:\d+|P\d+)|NF-\d+)$/;

/* PRD: the table whose first header cell is ID and whose rows start with REQ-nn. An optional last column named Stories / US lists story ids. */
export function parseReqs(doc) {
  const out = [];
  for (const t of parseTables(doc.body)) {
    if (!/^ID$/i.test(t.header[0]) || !t.rows.some((r) => REQ_ID.test(r[0]))) continue;
    const usCol = t.header.findIndex((h, i) => i > 0 && /^(user stories|stories|us)$/i.test(strip(h)));
    t.rows.forEach((r, k) => {
      if (!REQ_ID.test(r[0])) return;
      const us = usCol < 0 ? null : ((r[usCol] || '').match(/US-(?:P?\d+)|NF-\d+|\bP?\d+\b/g) || []).map(n=>/^(US|NF)-/.test(n)?n:`US-${n.length===1?'0'+n:n}`);
      out.push({ id: r[0], title: strip(r[1] || ''), group: t.heading, us, line: lineOf(doc, t.rowLines[k]) });
    });
  }
  return out;
}

const SCN = /SCN-([A-Z0-9]+)-(\d+)(?:\.\.(?:SCN-[A-Z0-9]+-)?(\d+))?/g;
export function expandScenarios(text) {
  const ids = new Set();
  for (const m of String(text).matchAll(SCN)) {
    const a = parseInt(m[2], 10);
    const b = m[3] ? parseInt(m[3], 10) : a;
    const width = m[2].length;
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b<a || b-a>100000) throw new Error('invalid or excessive scenario range');
    for (let k = a; k <= b; k += 1) ids.add(`SCN-${m[1]}-${String(k).padStart(width, '0')}`);
  }
  return [...ids];
}

/* US section 4 (Acceptance criteria): the first table after the H2 numbered 4. First column ID (or AC); Then column required;
   "Given / When" may be one column or two; a column named Scenario(s) is optional. */
export function parseAcTable(doc) {
  const heads = headings(doc.body);
  const h4 = heads.find((h) => h.level === 2 && /^4[.\-:\s]/.test(h.text));
  if (!h4) return { found: false, rows: [], line: lineOf(doc, 0), problem: 'no H2 numbered 4' };
  const next = heads.find((h) => h.line > h4.line && h.level <= 2);
  const block = doc.body.split('\n').slice(h4.line, next ? next.line : undefined).join('\n');
  const t = parseTables(block)[0];
  if (!t) return { found: true, rows: [], line: lineOf(doc, h4.line), problem: 'no table under the H2 numbered 4' };
  const H = t.header.map((h) => strip(h).toLowerCase());
  const col = (re) => H.findIndex((h) => re.test(h));
  const cols = { id: 0, given: col(/^given\b/), when: col(/^(given\s*\/\s*)?when\b|^given\s*\/\s*when/), then: col(/^then\b/), scn: col(/scenarios?/) };
  const rows = [];
  t.rows.forEach((r, k) => {
    const id = strip(r[cols.id] || '');
    if (!/^AC-\d+/.test(id)) return;
    const given = cols.given >= 0 && cols.given !== cols.when ? strip(r[cols.given] || '') : '';
    const when = cols.when >= 0 ? strip(r[cols.when] || '') : '';
    rows.push({ id: id.match(/^AC-\d+/)[0], when: given && when ? `${given} → ${when}` : given || when, then: cols.then >= 0 ? strip(r[cols.then] || '') : '', scn: cols.scn >= 0 ? expandScenarios(r[cols.scn] || '') : [], cells: r.length, line: lineOf(doc, h4.line + t.line + 2 + k) });
  });
  return { found: true, rows, header: t.header, cols, line: lineOf(doc, h4.line + t.line), headingId: h4.id, hasThen: cols.then >= 0, hasWhen: cols.when >= 0 };
}

/* Decision ledger: the table whose first header cell is Id and whose rows start with D<number>. */
export function parseDecisions(doc) {
  const out = [];
  for (const t of parseTables(doc.body)) {
    if (!/^Id$/i.test(t.header[0])) continue;
    const dateCol = t.header.findIndex((h) => /^date$/i.test(strip(h)));
    const detailCol = t.header.findIndex((h) => /detail|source/i.test(strip(h)));
    t.rows.forEach((r, k) => {
      if (!/^D\d+$/.test(r[0])) return;
      const detail = r[detailCol >= 0 ? detailCol : 2] || '';
      const date = dateCol >= 0 ? strip(r[dateCol] || '') : (detail.match(/\b\d{4}-\d{2}-\d{2}\b/) || [''])[0];
      out.push({ id: r[0], title: strip(r[1] || ''), detail, date, line: lineOf(doc, t.rowLines[k]) });
    });
  }
  return out;
}

/* Contract: "Amendment A-01 (2026-10-01, <source>, D81) - <title>" headings, each followed by a table of A01-01 style rows; then a change log table whose first header is Version. */
export const AMENDMENT_HEADING = /^Amendment (A-\d+) \((\d{4}-\d{2}-\d{2}),\s*([^,)]+),\s*(D\d+)\)\s*(?:—|-|:)?\s*(.*)$/;
export function parseAmendments(doc) {
  const heads = slug.scanHeadings(doc.body);
  const lines = doc.body.split('\n');
  const items = [];
  const malformed = [];
  for (const h of heads) {
    if (!/^Amendment\b/.test(h.text)) continue;
    const m = AMENDMENT_HEADING.exec(h.text);
    if (!m) { malformed.push({ text: h.text, line: lineOf(doc, h.line) }); continue; }
    const next = heads.find((x) => x.line > h.line && x.level <= h.level);
    const block = lines.slice(h.line, next ? next.line : lines.length).join('\n');
    const tbl = parseTables(block)[0];
    const rows = tbl ? tbl.rows.map((r, k) => ({ r, line: lineOf(doc, h.line + tbl.line + 2 + k) })).filter((x) => /^A\d+-\d+$/.test(x.r[0])).map((x) => ({ cells:x.r, id: x.r[0], change: strip(x.r[1] || ''), detail: strip(x.r.slice(2).join(' ')), line: x.line })) : [];
    items.push({ id: m[1], date: m[2], round: m[3].trim(), decision: m[4], title: m[5].trim(), headingId: h.id, rows, header: tbl?.header.map(strip), headerLine: tbl ? lineOf(doc, h.line + tbl.line) : lineOf(doc, h.line), line: lineOf(doc, h.line) });
  }
  const log = parseTables(doc.body).find((x) => /^Version$/i.test(strip(x.header[0])));
  let changes = [];
  if (log) {
    const H = log.header.map((h) => strip(h).toLowerCase());
    const pick = (re, fallback) => { const i = H.findIndex((h) => re.test(h)); return i >= 0 ? i : fallback; };
    const dateI = pick(/^(date|ngày)/, 1);
    const whyI = pick(/^(why|thay đổi|change)(?!d? ids)/, 3 <= H.length - 1 ? 3 : 2);
    const appI = pick(/approv|decision|quyết định|impact/, H.length - 1);
    changes = log.rows.map((r) => ({ version: strip(r[0] || ''), date: strip(r[dateI] || ''), ids: H.some((h) => /ids/.test(h)) ? strip(r[H.findIndex((h) => /ids/.test(h))] || '') : '', why: strip(r[whyI] || ''), approved: strip(r[appI] || '') }));
  }
  return { items: items.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })), changes, malformed, hasLog: !!log };
}

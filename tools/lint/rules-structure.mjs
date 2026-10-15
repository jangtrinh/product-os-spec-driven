import { headings } from '../lib/md.mjs';
import { frontMatterLine } from './rules-docs.mjs';

const dupes = (list, key) => { const seen = new Map(); const out = []; for (const x of list) { const k = key(x); if (seen.has(k)) out.push([seen.get(k), x]); else seen.set(k, x); } return out; };

/* Tables and ids that the format defines: PRD requirements, user stories, decision ledger, amendments and every trace reference. */
export function structureRules(model, P) {
  prdRules(model, P);
  storyRules(model, P);
  ledgerRules(model, P);
  amendmentRules(model, P);
  traceRules(model, P);
  boardRules(model, P);
  primaryRules(model, P);
}

function prdRules(model, P) {
  for (const d of model.prdDocs) if (!model.reqs.some((r) => r.doc === d)) P.add('S-PRD-REQ', d.rel, d.bodyLine, 'a prd document has no requirement table', 'add a table with header "ID | Requirement | Source" and one row per requirement, ids REQ-01, REQ-02, ...');
  for (const [a, b] of dupes(model.reqs, (r) => r.id)) P.add('S-REQ-DUP', b.doc.rel, b.line, `requirement ${b.id} is defined twice (first at ${a.doc.rel}:${a.line})`, 'every REQ id is defined once; rename or merge one');
}

function storyRules(model, P) {
  for (const { doc: d, ac } of model.stories) {
    const heads = headings(d.body).filter((h) => h.level === 2);
    for (let n = 1; n <= 6; n += 1) {
      if (!heads.some((h) => new RegExp(`^${n}[.\\-:\\s]`).test(h.text))) P.add('S-US-SECTION', d.rel, d.bodyLine, `story lacks section ${n}`, `add a heading "## ${n}. ${['User Story', 'Flow', 'Dữ liệu và quy tắc', 'Acceptance Criteria', 'Edge cases', 'UI'][n - 1]}" (sections are numbered 1 to 6; the words after the number may be in your language)`);
    }
    if (ac.found && ac.problem) P.add('S-US-AC-TABLE', d.rel, ac.line, `section 4: ${ac.problem}`, 'put the table "ID | Given | When | Then" under the heading numbered 4');
    else if (ac.found) {
      if (!ac.hasThen || !ac.hasWhen) P.add('S-US-AC-COLUMNS', d.rel, ac.line, `acceptance table header "${ac.header.join(' | ')}" must have an ID column, a Given / When column (or two) and a Then column`, 'use the header "| ID | Given | When | Then |"; an optional last column "Scenario" may follow');
      if (!ac.rows.length) P.add('S-US-AC-ROWS', d.rel, ac.line, 'acceptance table has no AC-<n> row', 'add at least one row whose first cell is AC-01, with the empty-state case as its own row');
      for (const r of ac.rows) if (r.cells !== ac.header.length || !r.when || !r.then) P.add('S-US-AC-ROW', d.rel, r.line, `${r.id} is not a complete Given / When / Then row (${r.cells} cells, header has ${ac.header.length})`, 'fill every cell of the row; write a short reason instead of leaving a cell empty');
      for (const [, b] of dupes(ac.rows, (r) => r.id)) P.add('S-US-AC-DUP', d.rel, b.line, `${b.id} appears twice in the table`, 'AC ids are unique inside a story');

    }
  }
  const cited = new Set(model.stories.flatMap((s) => (s.doc.fm.trace && s.doc.fm.trace.req) || []));
  for (const r of model.reqs) if (!cited.has(r.id) && model.stories.length) P.warn('S-REQ-NO-STORY', r.doc.rel, r.line, `${r.id} is cited by no story`, 'add it to trace.req of the story that delivers it, or mark the requirement as later work in the PRD');
}

function ledgerRules(model, P) {
  const ledgers = model.docs.filter((d) => d.fm.ledger === true);
  if (ledgers.length > 1) P.add('S-LEDGER-MANY', ledgers[1].rel, 1, `two documents set ledger: true (${ledgers.map((l) => l.rel).join(', ')})`, 'only one decision ledger may be the ledger');
  if (model.ledger && !model.decisions.length) P.add('S-LEDGER-EMPTY', model.ledger.rel, model.ledger.bodyLine, 'ledger document has no decision row', 'add a table "Id | Decision | Detail" with rows D1, D2, ... (id is D<number>)');
  for (const [a, b] of dupes(model.decisions, (d) => d.id)) P.add('S-DECISION-DUP', model.ledger.rel, b.line, `decision ${b.id} appears twice (first at line ${a.line})`, 'decision ids are unique; allocate the next free number');
  const ids = new Set(model.decisions.map((d) => d.id));
  for (const t of (model.ledger && model.ledger.fm.topics) || []) for (const id of t.ids) if (!ids.has(id)) P.add('S-TOPIC-ID', model.ledger.rel, frontMatterLine(model.ledger, 'topics'), `topic "${t.id}" lists ${id}, which is not in the ledger table`, 'fix the id or add the decision row');
}

function amendmentRules(model, P) {
  for (const x of model.withAmend) {
    const { doc, amend } = x;
    for (const m of amend.malformed) P.add('S-AMENDMENT-HEADING', doc.rel, m.line, `amendment heading is malformed: "${m.text.slice(0, 70)}"`, 'write: # Amendment A-01 (2026-10-01, <source of the decision>, D81) — <title>');
    const headers = ['#', 'Change (already applied to body)', 'Affected ids', 'Source'];
    for (const a of amend.items) {
      if (!a.rows.length) P.add('S-AMENDMENT-ROWS', doc.rel, a.line, `${a.id} has no change row`, `add a table "${headers.join(' | ')}" with rows A01-01, A01-02, ...`);
      if (a.header && (a.header.length !== headers.length || a.header.some((h, i) => h !== headers[i]))) P.add('S-AMENDMENT-ROWS', doc.rel, a.headerLine, `${a.id} has noncanonical structural table headers`, `use "${headers.join(' | ')}" in this order`);
    }
    for (const [, b] of dupes(amend.items, (a) => a.id)) P.add('S-AMENDMENT-DUP', doc.rel, b.line, `amendment ${b.id} appears twice`, 'amendment ids are unique');
    if (amend.items.length && !amend.hasLog) P.add('S-CHANGELOG', doc.rel, doc.bodyLine, 'contract has amendments but no change log table', 'add a "## Change log" table whose first column is Version, then Date, then the change and who approved it');
  }
  if (model.primaryContract) {
    const known = new Set(((model.amend && model.amend.items) || []).map((a) => a.id));
    for (const a of model.primaryContract.fm.amendments || []) if (!known.has(a.id)) P.add('S-AMENDMENT-SUMMARY', model.primaryContract.rel, frontMatterLine(model.primaryContract, 'amendments'), `front matter amendments lists ${a.id}, which is not an amendment heading in the body`, 'fix the id or add the amendment');
  }
}

function traceRules(model, P) {
  const storyIds = new Set(model.stories.map((s) => s.doc.id));
  const dec = new Set(model.decisions.map((d) => d.id));
  const am = new Set(((model.amend && model.amend.items) || []).map((a) => a.id));
  const reqs = new Set(model.reqs.map((r) => r.id));
  const acOf = new Map(model.stories.map((s) => [s.doc.id, new Set(s.ac.rows.map((r) => r.id))]));
  for (const d of model.docs) {
    const t = d.fm.trace;
    if (!t) continue;
    const line = frontMatterLine(d, 'trace');
    for (const r of t.req || []) if (!reqs.has(r)) P.add('S-TRACE-REQ', d.rel, line, `trace.req cites ${r}, which no PRD defines`, 'fix the id or add the requirement to the PRD table');
    for (const u of t.us || []) if (!storyIds.has(u)) P.add('S-TRACE-US', d.rel, line, `trace.us cites ${u}, but no story document has that id`, 'fix the id or write the story');
    for (const x of t.decisions || []) if (!dec.has(x)) P.add('S-TRACE-DECISION', d.rel, line, `trace.decisions cites ${x}, which is not in the decision ledger`, model.ledger ? 'fix the id or add the ledger row' : 'create a ledger document (type decisions, ledger: true) with a Decision table');
    for (const x of t.amendments || []) if (!x.includes('.') && !am.has(x)) P.add('S-TRACE-AMENDMENT', d.rel, line, `trace.amendments cites ${x}, which is not an amendment heading in the primary contract`, 'fix the id');
    for (const x of t.ac || []) {
      const m = /^((?:US-(?:\d+|P\d+)|NF-\d+))\.(AC-\d+)$/.exec(x);
      if (m && (!storyIds.has(m[1]) || !acOf.get(m[1]).has(m[2]))) P.add('S-TRACE-AC', d.rel, line, `trace.ac cites ${x}, which does not exist`, 'fix the story or AC id');
    }
  }
}

function boardRules(model, P) {
  for (const { doc: d } of model.stories) for (const b of d.fm.boards || []) if (!model.boardIds.has(b)) P.add('S-BOARD', d.rel, frontMatterLine(d, 'boards'), `boards cites ${b}, but no wireframes/png or wireframes/html file starts with ${b}-`, 'fix the id or add the board files (ux/wireframes/png/W-01-name.png and ux/wireframes/html/W-01-name.html)');
  for (const d of model.ofType('wireframe-index')) for (const b of d.fm.board_names || []) if (!model.boardIds.has(b.id)) P.add('S-BOARD', d.rel, frontMatterLine(d, 'board_names'), `board_names lists ${b.id}, but no board file starts with ${b.id}-`, 'fix the id or add the board files');
}

function primaryRules(model, P) {
  for (const [type, list] of [['prd', model.prdDocs], ['contract', model.contractDocs]]) {
    const flagged = list.filter((d) => d.fm.primary === true);
    if (flagged.length > 1) P.add('S-PRIMARY', flagged[1].rel, 1, `more than one ${type} document sets primary: true`, 'only one may be primary');
    if (list.length > 1 && !flagged.length) P.add('S-PRIMARY', list[0].rel, 1, `the spec has ${list.length} ${type} documents and none is primary`, 'set primary: true on the one the reader should chart (reference chain / amendment timeline)');
  }
}

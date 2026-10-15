import { headings, parseTables } from '../../../lib/md.mjs';
import { openItems } from '../../../lib/markdown-prose.mjs';

/* One structured record per user story, read from the same model the linter judges. The role views only join these records. */
const OWNER = /\bOwner:\s*([^\s,;]+@[^\s,;.]+(?:\.[^\s,;]+)*[^\s,;.])/i;
const AFFECTS = /\bAffects?\s+((?:(?:US-\d+\.)?AC-\d+(?:\s*,\s*)?)+)/i;

export const areaOf = (epic) => {
  const m = /^(E\d+|BRD-\d+)\b/.exec(String(epic || '').trim());
  return m ? m[1] : String(epic || '').trim() || 'No epic';
};

export function parseOpen(doc) {
  return openItems(doc).map((o) => ({
    line: o.line, blocking: o.blocking, text: o.text,
    owner: (OWNER.exec(o.text) || [])[1] || '', affects: ((AFFECTS.exec(o.text) || [])[1] || '').split(/\s*,\s*/).filter(Boolean),
  }));
}

export function buildStories(model, readable) {
  return model.stories.map(({ doc, ac }) => {
    const fm = doc.fm, t = fm.trace || {};
    const scenarios = (Array.isArray(fm.scenarios) ? fm.scenarios : []).filter((s) => s && typeof s === 'object').map((s) => ({
      id: s.id, qid: `${doc.id}.${s.id}`, ac: s.ac || [], method: s.method || 'unassigned', test: s.test || '', status: s.status || 'planned',
    }));
    const hidden = readable?.stories?.[doc.id]?.hidden ? { reason: readable.stories[doc.id].reason, category: readable.stories[doc.id].category } : null;
    return {
      id: doc.id, page: doc.pageId, rel: doc.rel, title: fm.title, status: fm.status || '', updated: fm.updated || '', epic: fm.epic || '', area: areaOf(fm.epic),
      priority: fm.priority || '', wave: fm.wave || '', reqs: t.req || [], decisions: t.decisions || [], amendments: t.amendments || [], deps: t.us || [],
      screens: fm.screens || [], boards: fm.boards || [], noUi: fm.no_ui || '', hidden,
      scenarios, acs: ac.rows.map((a) => ({ id: a.id, qid: `${doc.id}.${a.id}`, given: a.when, then: a.then, line: a.line })),
      open: parseOpen(doc).map((o) => ({ ...o, us: doc.id, page: doc.pageId, rel: doc.rel })),
    };
  });
}

const split = (v) => String(v || '').split(',').map((x) => x.trim()).filter((x) => x && x !== '—');
const norm = (h) => String(h).toLowerCase().replace(/[^a-z]/g, '');

/* Rows of every ui-contract table in the spec; the 6-column legacy shape and the 12-column design shape map to one record. */
export function buildUiRows(model) {
  const rows = [];
  for (const d of model.docs.filter((x) => x.type === 'ui-contract')) {
    for (const t of parseTables(d.body)) {
      const H = t.header.map(norm);
      if (!H.includes('screen') || !H.includes('element')) continue;
      const col = (n) => H.indexOf(n);
      t.rows.forEach((r) => {
        const get = (n) => (col(n) >= 0 ? r[col(n)] || '' : '');
        rows.push({
          screen: get('screen'), state: get('state'), route: get('route'), roles: split(get('roles')), scope: split(get('scope')), us: split(get('us')),
          element: get('element'), kind: get('kind'), components: split(get('components')), patterns: split(get('patterns')), target: get('target'),
          scn: split(get('scn') || get('usedby')), extended: col('state') >= 0, rel: d.rel,
        });
      });
    }
  }
  return rows;
}

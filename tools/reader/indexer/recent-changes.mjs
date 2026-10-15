const DAY = 24 * 60 * 60 * 1000;
const validDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

/* The content's newest updated date is the clock, so archived/offline specs stay deterministic. */
export function buildRecentChanges(manifest, pages, decisions, amendments) {
  const config = manifest.changes || {};
  const dates = pages.map((p) => p.updated).filter(validDate).sort();
  const newest = dates.at(-1) || '';
  const recentDays = Number.isInteger(config.recent_days) && config.recent_days >= 0 && config.recent_days <= 36500 ? config.recent_days : 7;
  const since = newest ? new Date(Date.parse(newest) - recentDays * DAY).toISOString().slice(0, 10) : '';
  const locale = config.locale || (/^vi\b/i.test(manifest.language || '') ? 'vi' : 'en');
  const recent = (date) => !!newest && validDate(date) && date >= since && date <= newest;
  const items = [];
  for (const p of pages) {
    p.recent = recent(p.updated);
    if (p.recent) items.push({ kind: 'page', id: p.id, title: p.title, date: p.updated, page: p.id, token: '', mentions: [] });
  }
  for (const d of decisions?.items || []) {
    d.recent = recent(d.date);
    if (d.recent) items.push({ kind: 'decision', id: d.id, title: d.title, date: d.date, page: 'decisions', token: d.id.toLowerCase(), mentions: d.mentions });
  }
  for (const a of amendments?.items || []) {
    a.recent = recent(a.date);
    if (a.recent) items.push({ kind: 'amendment', id: a.id, title: a.summary || a.title || a.round, date: a.date, page: 'amendments', token: a.id.toLowerCase(), mentions: [{ id: amendments.fcId, label: amendments.label }] });
  }
  const rank = { amendment: 0, decision: 1, page: 2 };
  items.sort((a, b) => b.date.localeCompare(a.date) || rank[a.kind] - rank[b.kind] || (a.kind === 'page' ? a.id.localeCompare(b.id, 'en', { numeric: true }) : b.id.localeCompare(a.id, 'en', { numeric: true })));
  return { newest, since, recentDays, locale, items };
}

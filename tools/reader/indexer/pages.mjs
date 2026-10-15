import path from 'node:path';
import { resolveTarget } from '../../lib/resolve.mjs';

const pad = (n, w = 3) => String(n).padStart(w, '0');

/* One reader page per document. Everything the shell shows comes from the front matter and the folder, never from guesses about the text. */
export function makePages(model) {
  const artStatus = Object.fromEntries(model.manifest.artifacts.map((a) => [a.n, a.status]));
  const deny = ((model.manifest.images && model.manifest.images.deny) || []).map((x) => x.replace(/^\.?\//, ''));
  const pages = [];
  for (const d of model.docs) {
    if (!d.data || !d.type || !d.id || !d.fm.title || !d.fm.updated) continue;
    const fm = d.fm;
    const isUs = d.type === 'us';
    const t = fm.trace || {};
    const base = d.stem;
    const kind = d.type === 'epic' ? 'epic' : d.type === 'readable-review' ? 'review' : d.type === 'release' ? 'overview' : '';
    const order = Number.isInteger(fm.order) ? fm.order : null;
    const indexLike = d.type === 'us-index' || d.type === 'overview' || /^(INDEX|README|DAG)$/.test(base);
    let sort = order !== null ? `0-${pad(order)}` : indexLike ? `0-000-${base}` : `1-${base}`;
    let group = fm.group || '';
    if (isUs) group = fm.epic || '';
    if (d.readable) {
      group = kind === 'epic' ? 'Epics' : kind === 'review' ? 'For review' : '';
      sort = `${kind === 'overview' ? 0 : kind === 'epic' ? 1 : 2}-${pad(order ?? 999)}-${base}`;
    }
    const imagesDeclared = (fm.images || []).map((im) => ({ rel: resolveTarget(d.rel, im.src).rel, reason: im.reason || '' }));
    const body = d.body.replace(/^\n+/, '');
    pages.push({
      id: d.pageId, title: isUs ? `${d.id} — ${fm.title}` : fm.title, label: fm.label || (isUs ? `${d.id} · ${fm.title}` : fm.title),
      artifact: d.artifactN, tier: d.tier, group, md: body, fm: '', rel: d.rel, stem: base,
      owner: fm.owner_role || (d.artifact && d.artifact.owner_role) || '', status: fm.status || artStatus[d.artifactN] || (d.readable ? 'Readable view' : ''), updated: fm.updated,
      audience: fm.audience || '', wireframe: fm.wireframe === true, sort,
      trace: { a: t.amendments || [], d: t.decisions || [], req: t.req || [], us: t.us || [], ac: t.ac || [] },
      src: { file: d.rel, first: d.bodyLine + (d.body.length - d.body.replace(/^\n+/, '').length) },
      ...(d.readable ? { layer: 'readable', kind } : {}), imagesDeclared, deny,
    });
  }
  return pages;
}

const nat = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/* Group rank inside an artifact: ungrouped pages first, then groups by the earliest sort key of their pages (ties by name). */
export function groupRanker(pages) {
  const first = new Map();
  for (const p of pages) {
    if (!p.group || p.layer === 'readable') continue;
    const k = `${p.artifact}|${p.group}`;
    if (!first.has(k) || nat(p.sort, first.get(k)) < 0) first.set(k, p.sort);
  }
  const perArt = new Map();
  for (const k of first.keys()) {
    const [a] = k.split('|');
    if (!perArt.has(a)) perArt.set(a, []);
    perArt.get(a).push(k);
  }
  const rank = new Map();
  for (const keys of perArt.values()) keys.sort((a, b) => nat(first.get(a), first.get(b)) || nat(a, b)).forEach((k, i) => rank.set(k, i + 1));
  return (p) => (p.group && p.layer !== 'readable' ? rank.get(`${p.artifact}|${p.group}`) || 0 : 0);
}

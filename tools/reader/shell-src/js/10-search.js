/* Client-side full-text search: titles first, then headings, then body text. No external service. */
let searchIndex = null;
let results = [];
let selected = 0;
let lastQuery = '';

const foldChar = (c) => { const d = c.normalize('NFD')[0]; return c === 'đ' || c === 'Đ' ? 'd' : d.toLowerCase(); };
const foldLen = (s) => String(s).normalize('NFC').replace(/[À-ỹ]/g, foldChar).toLowerCase();

function stripMd(md) {
  return md.replace(/^\s*(```|~~~).*$/gm, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ').replace(/^\s*>+\s?/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' ')
    .replace(/\|/g, ' ').replace(/[#*_`~]/g, '').replace(/\s+/g, ' ').trim();
}

function buildIndex() {
  searchIndex = state.data.pages.map((p) => {
    const blockLabels = [...new Set((p.blockChanges || []).map((r) => changeText(r.date)))].join(' ');
    const body = stripMd(p.md + (p.recent ? ' ' + changeText(p.updated) : '') + ' ' + blockLabels).normalize('NFC');
    const title = p.title.normalize('NFC');
    const heads = scanHeadings(p.md).map((h) => ({ id: h.id, text: h.text.normalize('NFC'), f: foldLen(h.text) }));
    return { p, title, titleF: foldLen(title + ' ' + p.label), heads, body, bodyF: foldLen(body) };
  });
  const row = (page, token, title, body, kind, date, recent) => {
    const p = state.pages[page];
    if (!p) return;
    body = stripMd(body + (recent ? ' ' + changeText(date) : '')).normalize('NFC');
    title = title.normalize('NFC');
    searchIndex.push({ p, title, titleF: foldLen(title), heads: [], body, bodyF: foldLen(body), row: { token, kind } });
  };
  for (const d of (state.data.decisions && state.data.decisions.items) || []) row('decisions', d.id.toLowerCase(), `${d.id} · ${d.title}`, d.detail, 'Decision', d.date, d.recent);
  for (const a of (state.data.amendments && state.data.amendments.items) || []) row('amendments', a.id.toLowerCase(), `${a.id} · ${a.summary || a.title || a.round}`, `${a.decision} ${a.rows.map((r) => r.id + ' ' + r.change + ' ' + (r.detail || '')).join(' ')}`, 'Amendment', a.date, a.recent);
}

function countOf(hay, tok) {
  let n = 0;
  let i = hay.indexOf(tok);
  while (i >= 0 && n < 20) { n += 1; i = hay.indexOf(tok, i + tok.length); }
  return n;
}

function highlight(text, tokens) {
  const f = foldLen(text);
  const marks = [];
  tokens.forEach((t) => { let i = f.indexOf(t); while (i >= 0) { marks.push([i, i + t.length]); i = f.indexOf(t, i + t.length); } });
  marks.sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  marks.forEach(([s, e]) => { if (s < pos) return; out += escapeHtml(text.slice(pos, s)) + '<mark>' + escapeHtml(text.slice(s, e)) + '</mark>'; pos = e; });
  return out + escapeHtml(text.slice(pos));
}

function runSearch(q) {
  if (!searchIndex) buildIndex();
  const tokens = foldLen(q).split(/\s+/).filter(Boolean);
  if (!tokens.length) return { tokens, hits: [] };
  const hits = [];
  searchIndex.forEach((e, order) => {
    const inTitle = tokens.every((t) => e.titleF.includes(t));
    const headHit = e.heads.find((h) => tokens.every((t) => h.f.includes(t)));
    const inBody = tokens.every((t) => e.bodyF.includes(t) || e.titleF.includes(t));
    if (!inTitle && !headHit && !inBody) return;
    let score = 0;
    if (inTitle) score += 1000 + (e.titleF.startsWith(tokens[0]) ? 200 : 0);
    if (headHit) score += 400;
    if (inBody) score += 10 + Math.min(40, tokens.reduce((n, t) => n + countOf(e.bodyF, t), 0));
    if (e.row) score += 500;
    hits.push({ e, order, score, kind: e.row ? e.row.kind : inTitle ? 'Title' : headHit ? 'Heading' : 'Text', head: headHit });
  });
  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return { tokens, hits: hits.slice(0, 40), total: hits.length };
}

function snippetOf(e, tokens) {
  let at = -1;
  tokens.forEach((t) => { const i = e.bodyF.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
  if (at < 0) return '';
  const s = Math.max(0, at - 70);
  const text = e.body.slice(s, at + 150);
  return (s > 0 ? '… ' : '') + highlight(text, tokens) + (at + 150 < e.body.length ? ' …' : '');
}

function whereOf(p) {
  const art = state.arts[p.artifact];
  if (p.layer === 'readable') return 'Readable view' + (p.group ? ' · ' + p.group : '');
  return p.kind === 'view' ? 'Role views' : p.generated ? 'Overview' : `${state.tiers[p.tier].name} · ${art ? art.name : ''}`;
}

function renderResults(q) {
  const list = $('#search-results');
  const meta = $('#search-meta');
  if (!q.trim()) {
    results = ['start', 'changes-to-read', 'reference-chain', 'amendments', 'decisions', 'dossier'].filter((id) => state.pages[id]).map((id) => ({ page: state.pages[id], token: '', quick: true }));
    meta.textContent = 'Jump to an overview page, or type to search all pages.';
    list.innerHTML = results.map((r, i) => `<li class="search-item" role="option" id="sr-${i}" data-i="${i}"><span class="si-title">${escapeHtml(r.page.label)}</span><span class="si-where">Overview</span></li>`).join('');
  } else {
    const { tokens, hits, total } = runSearch(q);
    results = hits.map((h) => ({ page: h.e.p, token: h.e.row ? h.e.row.token : h.kind === 'Heading' && h.head ? h.head.id : '', hit: h, tokens }));
    meta.textContent = total ? `${total} ${total === 1 ? 'match' : 'matches'}${total > hits.length ? ', showing the best 40' : ''}.` : '';
    list.innerHTML = total ? hits.map((h, i) => {
      const where = h.kind === 'Heading' && h.head ? `<span class="si-where">Heading: ${highlight(h.head.text, tokens)}</span>` : `<span class="si-where">${escapeHtml(whereOf(h.e.p))}</span>`;
      return `<li class="search-item" role="option" id="sr-${i}" data-i="${i}"><span class="si-title"><span>${highlight(h.e.title, tokens)}</span><span class="chip">${h.kind}</span></span>${where}<span class="si-snippet">${snippetOf(h.e, tokens)}</span></li>`;
    }).join('') : '<li class="search-empty" role="presentation">No page matches. Try fewer words or check the spelling. Accents are ignored.</li>';
  }
  selected = 0;
  markSelected();
}

function markSelected() {
  $$('#search-results .search-item').forEach((li, i) => li.setAttribute('aria-selected', i === selected ? 'true' : 'false'));
  const cur = $('#sr-' + selected);
  $('#search-input').setAttribute('aria-activedescendant', cur ? 'sr-' + selected : '');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

function openSearch() {
  const layer = $('#search-layer');
  if (!layer.hidden) { $('#search-input').focus(); return; }
  closeDrawer();
  layer.hidden = false;
  const input = $('#search-input');
  input.value = lastQuery;
  renderResults(lastQuery);
  input.focus();
  input.select();
}

function closeSearch() {
  $('#search-layer').hidden = true;
  const btn = $('#btn-search');
  if (btn) btn.focus({ preventScroll: true });
}

function openResult(i) {
  const r = results[i];
  if (!r) return;
  lastQuery = $('#search-input').value;
  $('#search-layer').hidden = true;
  location.hash = hashOf(r.page.id, r.token);
}

function initSearch() {
  const input = $('#search-input');
  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => renderResults(input.value), 60); });
  $('#search-layer').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(results.length - 1, selected + 1); markSelected(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1); markSelected(); }
    else if (e.key === 'Enter' && e.target === input) { e.preventDefault(); openResult(selected); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
    else if (e.key === 'Tab') {
      const f = [input, $('#btn-search-close')];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });
  $('#search-results').addEventListener('click', (e) => { const li = e.target.closest('.search-item'); if (li) openResult(+li.dataset.i); });
  $('#search-results').addEventListener('mousemove', (e) => { const li = e.target.closest('.search-item'); if (li && +li.dataset.i !== selected) { selected = +li.dataset.i; markSelected(); } });
  $('#search-layer').addEventListener('mousedown', (e) => { if (e.target.id === 'search-layer') closeSearch(); });
  $('#btn-search-close').addEventListener('click', closeSearch);
  $('#btn-search').addEventListener('click', openSearch);
}

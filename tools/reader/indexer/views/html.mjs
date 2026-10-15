/* Small HTML helpers for generated view pages. Generated pages are trusted by the shell (raw HTML passes), so every spec value is
   escaped here. Blocks are emitted without blank lines so Markdown keeps each block whole. */
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const TONES = { ok: 'ok', warn: 'warn', bad: 'bad', info: 'info', mute: '' };

/* A status chip. `tone` is one of ok|warn|bad|info; the text always names the state, color never carries it alone. */
export const chip = (text, tone = '') => `<span class="chip${tone ? ` tone-${tone}` : ''}">${esc(text)}</span>`;

/* Anchor to another reader page: href is the already-built hash, label is escaped. */
export const link = (href, label) => `<a href="${esc(href)}">${esc(label)}</a>`;
export const pageLink = (id, label, token = '') => link(`#${id}${token ? `.${token}` : ''}`, label);

/* A table whose cells are already HTML. Header cells are escaped text. */
export function table(headers, rows, { caption = '', cls = '' } = {}) {
  const head = `<tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr>`;
  const body = rows.map((r) => `<tr${r.id ? ` id="${esc(r.id)}"` : ''}>${(r.cells || r).map((c, i) => `<td data-label="${esc(headers[i] || '')}">${c}</td>`).join('')}</tr>`).join('');
  return `<table class="stack${cls ? ` ${cls}` : ''}">${caption ? `<caption class="sr-only">${esc(caption)}</caption>` : ''}<thead>${head}</thead><tbody>${body}</tbody></table>`;
}

/* A labelled facts list: [['Owner','x'], ...] with already-escaped values. */
export const facts = (rows) => `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

/* Empty or missing data is stated, never skipped. */
export const absent = (text) => `<p class="absent" role="note">${esc(text)}</p>`;

export const section = (title, count, inner) => `\n## ${title}${count === undefined || count === '' ? '' : ` ${chip(count)}`}\n\n${inner}\n`;

export const ratio = (n, d) => `${n} of ${d}`;
export const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');

/* Tone for a freshness or status word. */
export function toneOf(word) {
  const w = String(word || '').toUpperCase();
  if (/^(CURRENT|PASS|PASSED|PASSING|APPROVED|ACTIVE|EXACT|AVAILABLE|VERIFIED)$/.test(w)) return 'ok';
  if (/^(FAIL|FAILING|STALE|MISSING|RETIRED|CHANGES_REQUESTED|CONFLICTING|NOT_BUILT|NOT-BUILT|UNCOVERED|DENIED)$/.test(w)) return 'bad';
  if (/^(PENDING|PLANNED|UNVERIFIED|NOT_RUN|NOT-RUN|BLOCKED|PARTIAL|NOT-CREATED|NO-DEMO|UNASSIGNED|DEFER)$/.test(w)) return 'warn';
  return 'info';
}
export const stateChip = (word) => chip(String(word), toneOf(word));

/* Row anchors of the generated pages, built in ONE place so a link and its target cannot drift apart. */
export const stateAnchor = (key) => String(key).toLowerCase().replace('/', '-');
export const screenAnchor = (screen) => `screen-${String(screen).toLowerCase()}`;
export const acAnchor = (qid) => String(qid).toLowerCase().replace('.', '-');

const SCOPE_WORDS = { ac: ['acceptance criterion', 'acceptance criteria'], us: ['story', 'stories'], stage: ['stage', 'stages'], artifact: ['artifact', 'artifacts'], bundle: ['bundle', 'bundles'] };
/* "ac · 1 ids" read as jargon; say what the scope holds and pluralise it. */
export const scopeLabel = (kind, n) => { const w = SCOPE_WORDS[kind]; return w ? `${n} ${w[n === 1 ? 0 : 1]}` : `${n} ${kind || 'scope'} ${n === 1 ? 'item' : 'items'}`; };

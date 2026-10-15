/* PRODUCT:OS Spec Driven reader shell 2.0.0. Project-neutral: all content comes from content.json (Spec Format v2). */
(function () {
'use strict';
const SHELL_VERSION = '2.0.0';
const SHELL_MAJOR = parseInt(SHELL_VERSION, 10);
const MODE = window.SPEC_DATA ? 'offline' : 'folder';
/* Shared by the generator (evaluated in Node) and the reader (concatenated into the page script).
   Plain function declarations only: no imports, no DOM. */
function fold(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

/* Markdown inline syntax to plain text (links keep their label, code keeps its content). */
function plainInline(md) {
  return String(md)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\\([\\`*_{}\[\]()#+\-.!|])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Hash tokens may only hold letters, digits and . _ ~ - ; the dot separates page and section, so slugs never contain one. */
function slugify(text) {
  const s = fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  return s || 'section';
}

/* Page ids must never be reused as heading ids: the browser would scroll to the heading when a page opens. */
const RESERVED = {};
function reserveIds(ids) { ids.forEach((i) => { RESERVED[i] = true; }); }

function uniqueSlug(base, seen) {
  let id = base;
  let n = 1;
  while (seen[id] || RESERVED[id]) { n += 1; id = base + '-' + n; }
  seen[id] = true;
  return id;
}

/* Headings of a markdown body, outside code fences, in document order, with the same ids the renderer assigns. */
function scanHeadings(md) {
  const out = [];
  const seen = {};
  let fence = null;
  const lines = String(md).split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0].repeat(f[1].length);
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (!m) continue;
    const text = plainInline(m[2]);
    out.push({ level: m[1].length, text, id: uniqueSlug(slugify(text), seen), line: i });
  }
  return out;
}

/* "Copy cho AI" text: the clipboard shapes and the source-line arithmetic. Pure functions, no DOM and no I/O, so the reader tests run
   this very source in Node and the browser shell runs it unchanged. */
var COPY_EMPTY_REQUEST = '(chưa nhập)';

/* Source file line of line `i` (0-based) of a page's markdown. `src.map` lists the file line of every markdown line when the reader
   inserted lines (a note under a not-built image); otherwise the lines run on from `src.first`. */
function copyFileLine(src, i) {
  if (src.map) return src.map[Math.min(Math.max(i, 0), src.map.length - 1)];
  return src.first + i;
}

function copyQuote(text) {
  var lines = String(text).replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '').split('\n');
  return lines.map(function (l) { var t = l.replace(/\s+$/, ''); return t ? '> ' + t : '>'; }).join('\n');
}

function copyFilePath(project, rel) {
  return project.specPath ? project.specPath + '/' + rel : rel;
}

/* ":start-end", or nothing when the selection could not be placed (never a guessed line). */
function copyLinesSuffix(c) {
  return c.start == null ? '' : ':' + c.start + '-' + c.end;
}

function copyProjectLine(project) {
  return project.root + ' (spec @ ' + project.rev + ')';
}

function copyRequest(request) {
  var r = String(request || '').trim();
  return r || COPY_EMPTY_REQUEST;
}

function copyHeadingPart(ids, heading) {
  var h = heading ? '"' + heading + '"' : '';
  if (ids.length && h) return ids.join(', ') + ' › ' + h;
  return ids.length ? ids.join(', ') : h || '(không rõ)';
}

/* One line for the box and for the log: where the text came from. */
function copyLocationLine(c) {
  var where = c.generated
    ? 'Trang tạo tự động: ' + c.pageTitle + (c.sources && c.sources.length ? ' · nguồn ' + c.sources.map(function (s) { return copyFilePath(c.project, s); }).join(', ') : '')
    : copyFilePath(c.project, c.rel) + copyLinesSuffix(c);
  var tail = copyHeadingPart(c.ids || [], c.heading);
  return where + (tail === '(không rõ)' ? '' : ' · ' + tail);
}

/* c: { text, rel, start, end, generated, pageId, pageTitle, sources, ids, heading, anchor, project, request } */
function copyFormatSpec(c) {
  var file = c.generated
    ? 'Trang tạo tự động "' + c.pageTitle + '" (generated:' + c.pageId + ')' + (c.sources && c.sources.length ? ' · nguồn: ' + c.sources.map(function (s) { return copyFilePath(c.project, s); }).join(', ') : ' · không có dòng nguồn duy nhất')
    : copyFilePath(c.project, c.rel) + copyLinesSuffix(c);
  return [
    'Sửa đoạn spec này:', '',
    copyQuote(c.text), '',
    '- File: ' + file,
    '- Mục: ' + copyHeadingPart(c.ids || [], c.heading),
    '- Trang reader: #' + c.anchor,
    '- Project: ' + copyProjectLine(c.project), '',
    'Yêu cầu của tôi: ' + copyRequest(c.request),
  ].join('\n');
}

/* c: { screen, title, state, role, text, line, related, project, request } */
function copyFormatPrototype(c) {
  var screen = (c.screen + (c.title ? ' ' + c.title : '')).trim() || '(không rõ)';
  return [
    'Sửa phần tử prototype này:', '',
    '- Màn: ' + screen + ' · state: ' + (c.state || '(không rõ)'),
    '- Phần tử: ' + c.role + (c.text ? ' "' + c.text + '"' : ''),
    '- File: ' + copyFilePath(c.project, 'prototype/index.html') + ':' + c.line,
    '- Liên quan: ' + ((c.related && c.related.length) ? c.related.join(', ') : '(không có)'),
    '- Project: ' + copyProjectLine(c.project), '',
    'Yêu cầu của tôi: ' + copyRequest(c.request),
  ].join('\n');
}

function copyProtoLocationLine(c) {
  return copyFilePath(c.project, 'prototype/index.html') + ':' + c.line + ' · ' + (c.screen || '') + (c.state ? ' ' + c.state : '') + ' › ' + c.role + (c.text ? ' "' + c.text + '"' : '');
}

/* Core: data, lookups, small helpers. */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const store = {
  get(k) { try { return localStorage.getItem('specreader.' + k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem('specreader.' + k, v); } catch (e) { /* storage can be blocked */ } },
};

/* Brand and window title: "product:os / <project>"; a page title goes in front. */
const BRAND = 'product:os';
const docTitle = (pageTitle) => (pageTitle ? pageTitle + ' · ' : '') + BRAND + ' / ' + state.data.title;

const state = { data: null, pages: {}, tiers: {}, arts: {}, stemToId: {}, known: { req: new Set(), d: new Set(), a: new Set() }, view: 'artifact', layer: 'build', current: null, order: { artifact: [], audience: [], readable: [] } };

function indexData(data) {
  state.data = data;
  data.pages = buildGeneratedPages(data).concat(data.pages);
  reserveIds(data.pages.map((p) => p.id));
  state.known.req = new Set(((data.chain && data.chain.reqs) || []).map((r) => r.id));
  state.known.d = new Set(((data.decisions && data.decisions.items) || []).map((d) => d.id));
  state.known.a = new Set(((data.amendments && data.amendments.items) || []).map((a) => a.id));
  data.pages.forEach((p) => { state.pages[p.id] = p; });
  data.tiers.forEach((t) => { state.tiers[t.id] = t; });
  data.artifacts.forEach((a) => { state.arts[a.n] = a; });
  data.pages.forEach((p) => {
    if (p.generated) return;
    const stem = p.rel.split('/').pop().replace(/\.md$/, '');
    state.stemToId[stem] = p.id;
  });
  state.order.artifact = data.orderArtifact;
  state.order.audience = data.orderAudience;
  state.order.readable = data.orderReadable || [];
}

async function loadData() {
  let data;
  if (MODE === 'offline') data = window.SPEC_DATA;
  else {
    const res = await fetch('content.json');
    if (!res.ok) throw new Error('content.json: ' + res.status);
    data = await res.json();
  }
  if (!data || data.format !== '2') throw new Error('content.json is not Spec Format v2 (format=' + (data && data.format) + ')');
  if (data.shellMin && data.shellMin > SHELL_MAJOR) throw new Error('this content needs shell ' + data.shellMin + ' or newer, this is shell ' + SHELL_VERSION);
  return data;
}

const isDark = () => {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
};

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e2) { toast('Copy is not available here. Select the text and copy it.'); ta.remove(); return; }
    ta.remove();
  }
  toast(okMsg);
}

const baseUrl = () => location.href.split('#')[0];
const hashOf = (pageId, token) => '#' + pageId + (token ? '.' + token : '');

function parseHash() {
  let h = location.hash.replace(/^#/, '');
  try { h = decodeURIComponent(h); } catch (e) { /* keep raw */ }
  const i = h.indexOf('.');
  if (!h) return { page: defaultPageId(), token: '' };
  return i < 0 ? { page: h, token: '' } : { page: h.slice(0, i), token: h.slice(i + 1) };
}

/* Target page and token for a trace id such as REQ-13, US-16, D85, A-02. Only ids that exist in the spec link anywhere. */
function idTarget(id) {
  const ac = /^((?:US-(?:\d+|P\d+)|NF-\d+))\.(AC-\d+)$/.exec(id);
  if (ac) {
    const story = state.data.chain && state.data.chain.stories.find((s) => s.id === ac[1] && s.acs.some((a) => a.id === ac[2]));
    return story ? hashOf(story.page, ac[2].toLowerCase()) : '';
  }
  if (/^(US|NF)-/.test(id)) { const p = state.stemToId[id]; return p ? hashOf(p, '') : ''; }
  if (/^REQ-/.test(id)) return state.known.req.has(id) ? hashOf('reference-chain', id.toLowerCase()) : '';
  if (/^D\d+$/.test(id)) return state.known.d.has(id) ? hashOf('decisions', id.toLowerCase()) : '';
  if (/^A-\d+$/.test(id)) return state.known.a.has(id) ? hashOf('amendments', id.toLowerCase()) : '';
  return '';
}

const layerOf = (p) => (p && p.layer === 'readable' ? 'readable' : 'build');
const hasReadable = () => !!(state.data && state.data.readable && state.order.readable.length);
const defaultPageId = () => (hasReadable() ? state.order.readable[0] : 'start');
const treeView = () => (state.layer === 'readable' ? 'readable' : state.view);
const currentOrder = () => (state.layer === 'readable' ? state.order.readable : state.order[state.view]);

/* Markdown to HTML. Source pages never run raw HTML; generated pages are ours and may use chips and details. */
const CLOSING = [
  ['xref', /^(cross-?references?|references|see also)\b/],
  ['open', /^(open (questions?|items?)|unresolved)\b/],
  ['sources', /^(sources?|nguon)\b/],
];
const LINK_ICON = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/></svg>';
let renderCtx = { seen: {}, prefix: '' };
const markedInstances = {};

function buildRenderer(trusted) {
  const r = new marked.Renderer();
  r.heading = function (tok) {
    const inner = this.parser.parseInline(tok.tokens);
    const id = uniqueSlug(slugify(plainInline(tok.text)), renderCtx.seen);
    const depth = Math.max(2, tok.depth);
    return `<h${depth} id="${renderCtx.prefix}${id}"><span class="heading-text">${inner}</span><button type="button" class="anchor-btn" data-anchor="${id}" aria-label="Copy link to section" data-tip="Copy link to section">${LINK_ICON}</button></h${depth}>\n`;
  };
  r.code = function (tok) {
    const lang = (tok.lang || '').split(/\s/)[0];
    if (lang === 'mermaid') return `<div class="diagram is-pending" data-mermaid><pre class="mermaid">${escapeHtml(tok.text)}</pre></div>\n`;
    return `<div class="code-block"><div class="code-head"><span>${escapeHtml(lang || 'text')}</span><button type="button" class="btn" data-copy-code>Copy code</button></div><pre><code>${escapeHtml(tok.text)}</code></pre></div>\n`;
  };
  if (!trusted) {
    r.html = (tok) => {
      const t = tok.text.trim();
      if (/^<!--[\s\S]*-->$/.test(t)) return '';
      if (/^<br\s*\/?>$/i.test(t)) return '<br>';
      return escapeHtml(tok.text);
    };
  }
  return r;
}

function markedFor(trusted) {
  const k = trusted ? 'trusted' : 'source';
  if (!markedInstances[k]) markedInstances[k] = new marked.Marked({ gfm: true, breaks: false, renderer: buildRenderer(trusted) });
  return markedInstances[k];
}

function renderMarkdown(page, prefix) {
  renderCtx = { seen: {}, prefix: prefix || '' };
  if (page.src && !page.generated) return renderSourceBlocks(markedFor(false), page);
  return markedFor(!!page.generated).parse(page.md);
}

function textWalk(root, fn) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest('a, pre, button, h1, h2, h3, h4, h5, h6, script, style, .anchor-btn, .chip')) return NodeFilter.FILTER_REJECT;
      return /\b(US|NF|REQ|D\d|A-\d)/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(fn);
}

const ID_RE = /\b((?:US-(?:\d+|P\d+)|NF-\d+)\.AC-\d+|US-(?:\d+|P\d+)|NF-\d+|REQ-\d+|D\d+|A-\d+)\b/g;

function linkTraceIds(root, page) {
  const self = page && !page.generated ? page.rel.split('/').pop().replace(/\.md$/, '') : '';
  textWalk(root, (node) => {
    const text = node.nodeValue;
    ID_RE.lastIndex = 0;
    if (!ID_RE.test(text)) return;
    ID_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = ID_RE.exec(text))) {
      const target = m[1] === self ? '' : idTarget(m[1]);
      if (!target) continue;
      frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a');
      a.href = target;
      a.textContent = m[1];
      frag.appendChild(a);
      last = m.index + m[1].length;
    }
    if (!last) return;
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  });
  $$('code', root).forEach((c) => {
    if (c.closest('pre, a, h1, h2, h3, h4') || !/^(?:US-(?:\d+|P\d+)|NF-\d+|REQ-\d+|D\d+)$/.test(c.textContent)) return;
    const target = c.textContent === self ? '' : idTarget(c.textContent);
    if (!target) return;
    const a = document.createElement('a');
    a.href = target;
    c.parentNode.replaceChild(a, c);
    a.appendChild(c);
  });
}

const TONES = { note: 'note', info: 'note', tip: 'tip', important: 'important', warning: 'warning', caution: 'warning', 'lưu ý': 'note' };
function decorateCallouts(root) {
  $$('blockquote', root).forEach((bq) => {
    const first = bq.firstElementChild;
    const txt = first ? first.textContent.trim() : '';
    const m = /^(?:\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]|(Note|Tip|Important|Warning|Caution|Lưu ý)\b)/i.exec(txt);
    const div = document.createElement('div');
    ['data-src-start', 'data-src-end'].forEach((a) => { if (bq.hasAttribute(a)) div.setAttribute(a, bq.getAttribute(a)); });
    const key = m ? (m[1] || m[2]).toLowerCase() : '';
    div.className = 'callout tone-' + (TONES[key] || 'quote');
    if (m) {
      const label = document.createElement('div');
      label.className = 'callout-label';
      label.textContent = (m[1] || m[2]).replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());
      div.appendChild(label);
      first.innerHTML = first.innerHTML.replace(/^\s*(?:\[!\w+\]|(?:<(?:strong|b)>)?\s*(?:Note|Tip|Important|Warning|Caution|Lưu ý)\s*[:.]?\s*(?:<\/(?:strong|b)>)?\s*[:.]?)\s*(<br\s*\/?>)?\s*/i, '');
      if (!first.textContent.trim()) first.remove();
    }
    while (bq.firstChild) div.appendChild(bq.firstChild);
    bq.replaceWith(div);
  });
}

const ROW_ID = /^(D\d+|REQ-\d+|A-\d+|A\d+-\d+|AC-\d+|SC-\d+|BR-\d+|C-\d+)$/;
function decorateTables(root, prefix) {
  $$('table', root).forEach((t) => {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Table. Scroll to see more.');
    t.replaceWith(wrap);
    wrap.appendChild(t);
    const cols = t.querySelectorAll('tr:first-child > *').length;
    if (cols > 2) t.style.minWidth = Math.min(760, cols * 120) + 'px';
    $$('tbody tr', t).forEach((tr) => {
      const first = tr.firstElementChild ? tr.firstElementChild.textContent.trim() : '';
      const id = prefix + first.toLowerCase();
      if (!tr.id && ROW_ID.test(first) && !document.getElementById(id)) tr.id = id;
      $$('td', tr).forEach((td) => { const x = td.textContent.trim(); if (x.length <= 16 && /^[\w.\-/]+$/.test(x)) td.classList.add('id-cell'); });
    });
  });
}

function decorateLinksAndImages(root) {
  $$('a[href]', root).forEach((a) => {
    const h = a.getAttribute('href');
    if (/^https?:/.test(h) || /\.html$/.test(h)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  });
  $$('img', root).forEach((img) => {
    img.setAttribute('onerror', "var s=document.createElement('span');s.className='chip tone-bad';s.textContent='Image failed to load';this.hidden=true;this.after(s)");
    img.loading = 'lazy';
    img.decoding = 'async';
    img.setAttribute('data-zoom', '');
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Zoom image: ' + (img.alt || 'image'));
  });
}

/* Cross-references, open questions and sources move to the end in a fixed order and one look. */
function restructureClosings(root) {
  const kids = Array.from(root.children);
  const level = (n) => (/^H[1-6]$/.test(n.tagName) ? +n.tagName[1] : 0);
  const found = [];
  kids.forEach((n, i) => {
    if (level(n) < 1 || level(n) > 2) return;
    if (found.some((f) => i > f.start && i < f.end)) return;
    const title = fold((n.querySelector('.heading-text') || n).textContent).replace(/^[\s\d.§)]+/, '').trim();
    const hit = CLOSING.find(([, re]) => re.test(title));
    if (!hit) return;
    let end = i + 1;
    while (end < kids.length && !(level(kids[end]) && level(kids[end]) <= level(n))) end += 1;
    found.push({ kind: hit[0], start: i, end });
  });
  if (!found.length) return;
  const sections = found.sort((a, b) => CLOSING.findIndex((c) => c[0] === a.kind) - CLOSING.findIndex((c) => c[0] === b.kind)).map((f) => {
    const sec = document.createElement('section');
    sec.className = 'closing closing-' + f.kind;
    kids.slice(f.start, f.end).forEach((n) => sec.appendChild(n));
    return sec;
  });
  sections.forEach((s) => root.appendChild(s));
}

function decorate(root, page, prefix) {
  decorateTables(root, prefix || '');
  decorateChangeRows(root, page);
  decorateCallouts(root);
  decorateLinksAndImages(root);
  linkTraceIds(root, page);
  decorateBlockHistory(root, page);
  if (!page.generated && !page.kind) restructureClosings(root);
}

/* Mermaid. Both modes render client-side with the vendored library: offline has it inlined, folder mode loads libs/mermaid.min.js
   the first time a page has a diagram. A diagram renders when it nears the viewport; a failure shows the source instead. */
let mermaidChain = Promise.resolve();
let mermaidConfigured = false;
let mermaidSeq = 0;
let diagramObserver = null;
let libPromise = null;

const themeVar = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

function mermaidConfig() {
  const dark = isDark();
  const c = {
    bg: themeVar('--color-surface', dark ? '#1F2024' : '#FFFFFF'), node: themeVar('--surface-2', dark ? '#26272C' : '#F0F1F2'),
    border: themeVar('--color-outline', dark ? '#4A4B55' : '#B6B6B6'), text: themeVar('--color-text', dark ? '#ECEDEF' : '#1A1B1E'),
    line: themeVar('--color-text-muted', dark ? '#8F929B' : '#5B5E66'), cluster: themeVar('--surface-3', dark ? '#1B1C20' : '#FBFBFC'),
  };
  return {
    startOnLoad: false, securityLevel: 'loose', theme: 'base',
    themeVariables: {
      fontFamily: themeVar('--font-sans', 'system-ui, sans-serif'), fontSize: '16px', background: c.bg, primaryColor: c.node, primaryTextColor: c.text,
      primaryBorderColor: c.border, lineColor: c.line, secondaryColor: c.node, tertiaryColor: c.cluster, clusterBkg: c.cluster, clusterBorder: c.border,
      edgeLabelBackground: c.bg, textColor: c.text, nodeTextColor: c.text, mainBkg: c.node, nodeBorder: c.border,
    },
    flowchart: { useMaxWidth: false, htmlLabels: true, nodeSpacing: 36, rankSpacing: 44, padding: 10 },
    sequence: { useMaxWidth: false }, state: { useMaxWidth: false }, er: { useMaxWidth: false },
    gantt: { useMaxWidth: false }, journey: { useMaxWidth: false }, class: { useMaxWidth: false },
  };
}

function showDiagramError(div, src) {
  div.dataset.done = 'error';
  div.classList.remove('is-pending');
  div.innerHTML = '<div class="diagram-error"><p>Diagram could not render. The source is shown instead.</p><div class="code-block"><div class="code-head"><span>mermaid</span><button type="button" class="btn" data-copy-code>Copy code</button></div><pre><code></code></pre></div></div>';
  div.querySelector('code').textContent = src;
}

async function renderOne(div) {
  if (div.dataset.done === '1') return;
  const src = div.dataset.src || '';
  try { await loadMermaidLib(); } catch (e) { showDiagramError(div, src); return; }
  if (!mermaidConfigured || div.dataset.theme !== (isDark() ? 'dark' : 'light')) {
    window.mermaid.initialize(mermaidConfig());
    mermaidConfigured = true;
  }
  const id = 'mmd' + (mermaidSeq += 1);
  try {
    await window.mermaid.parse(src);
    const out = await window.mermaid.render(id, src);
    div.innerHTML = out.svg;
    const svg = div.querySelector('svg');
    const vb = svg && svg.viewBox && svg.viewBox.baseVal;
    if (vb && vb.width) svg.style.minWidth = Math.min(vb.width, 640) + 'px';
    if (out.bindFunctions) out.bindFunctions(div);
    div.dataset.done = '1';
    div.dataset.theme = isDark() ? 'dark' : 'light';
    div.classList.remove('is-pending');
  } catch (err) {
    showDiagramError(div, src);
  }
  $$('#d' + id + ', #' + id).forEach((n) => { if (!div.contains(n)) n.remove(); });
}

const queueRender = (div) => { mermaidChain = mermaidChain.then(() => renderOne(div)).catch(() => {}); return mermaidChain; };

function observeDiagrams(root) {
  const nodes = $$('.diagram[data-mermaid]', root).filter((d) => d.dataset.done !== '1' && d.dataset.done !== 'error');
  if (!nodes.length) return;
  if (!diagramObserver) {
    diagramObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { diagramObserver.unobserve(e.target); queueRender(e.target); } });
    }, { rootMargin: '700px 0px' });
  }
  nodes.forEach((n) => diagramObserver.observe(n));
}

function loadMermaidLib() {
  if (window.mermaid) return Promise.resolve();
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = 'libs/mermaid.min.js';
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('libs/mermaid.min.js could not be loaded'));
      document.head.appendChild(el);
    });
  }
  return libPromise;
}

function renderDiagrams(root) {
  $$('.diagram[data-mermaid]', root).forEach((d) => { const pre = d.querySelector('pre.mermaid'); if (!d.dataset.src && pre) d.dataset.src = pre.textContent; });
  if (!$$('.diagram[data-mermaid]', root).length) return;
  loadMermaidLib().then(() => observeDiagrams(root)).catch(() => {
    $$('.diagram[data-mermaid]', root).forEach((d) => showDiagramError(d, d.dataset.src || ''));
  });
}

function rerenderDiagramsForTheme() {
  if (!window.mermaid) return;
  mermaidConfigured = false;
  $$('.diagram[data-mermaid][data-done="1"]').forEach((d) => { d.dataset.done = ''; d.classList.add('is-pending'); });
  observeDiagrams(document);
}

function diagramStats(root) {
  const all = $$('.diagram[data-mermaid]', root);
  return { total: all.length, rendered: all.filter((d) => d.querySelector('svg')).length, failed: all.filter((d) => d.dataset.done === 'error').length };
}

/* Metadata line and tier banner under each page title. */
function idLink(id) {
  const t = idTarget(id);
  return t ? `<a href="${t}">${id}</a>` : id;
}

function metaLine(page) {
  const sep = '<span class="sep" aria-hidden="true">·</span>';
  const stem = page.generated ? page.id : page.rel.split('/').pop().replace(/\.md$/, '');
  const parts = [`id: ${escapeHtml(stem)}`];
  if (page.generated) parts.push('generated from the spec files');
  else if (page.owner) parts.push(`owner: ${escapeHtml(page.owner)}`);
  if (page.status && !page.generated) parts.push(`status: ${escapeHtml(page.status)}`);
  parts.push(`updated: ${page.updated}`);
  if (page.recent) parts.push(changeChip(page.updated, true));
  const t = page.trace || {};
  const ids = [].concat(t.a || [], t.d || [], t.req || [], t.us || [], t.ac || []);
  if (ids.length) {
    const shown = ids.slice(0, 10).map(idLink).join(', ');
    const rest = ids.slice(10);
    const more = rest.length ? `, <details><summary>Show ${rest.length} more ids</summary>${rest.map(idLink).join(', ')}</details>` : '';
    parts.push(`sources: ${shown}${more}`);
  }
  return `<p class="page-meta">${parts.join(sep)}</p>`;
}

function tierBanner(page) {
  if (page.generated || page.layer === 'readable') return '';
  const t = state.tiers[page.tier];
  if (!t) return '';
  const sep = ' <span class="sep" aria-hidden="true">·</span> ';
  return `<div class="tier-banner" role="note"><div><b>Tier:</b> ${escapeHtml(t.name)}${sep}<b>Audience:</b> ${escapeHtml(page.audience || t.audience)}${sep}<b>Updated:</b> ${page.updated}${t.purpose ? `${sep}<b>Purpose:</b> ${escapeHtml(t.purpose)}` : ''}</div><p class="banner-back"><a href="#start">Back to spec index</a></p></div>`;
}

/* Readable layer: which epic this story belongs to, or why it is hidden there. */
function epicLine(page) {
  const r = state.data.readable;
  if (!r || page.generated || page.layer === 'readable') return '';
  const stem = page.rel.split('/').pop().replace(/\.md$/, '');
  const m = r.stories[stem];
  if (!m) return '';
  if (m.hidden) {
    const review = state.order.readable.map((id) => state.pages[id]).find((p) => p.group === 'For review');
    const more = review ? ` <a href="${hashOf(review.id, '')}">For review</a>` : '';
    return `<p class="epic-line"><span class="hidden-note">Hidden in readable view: ${escapeHtml(m.reason || 'no reason recorded')}${more}</span></p>`;
  }
  const e = m.epic ? state.pages[m.epic] : null;
  const label = escapeHtml(String(m.epicTitle || (e && e.label) || '').replace(/^Epic\s*\d+\s*[:.\-–—]\s*/i, ''));
  return `<p class="epic-line">${e ? `<a class="chip epic-chip" href="${hashOf(e.id, m.epicToken || '')}">Epic: ${label}</a>` : `<span class="chip epic-chip">Epic: ${label}</span>`}</p>`;
}

/* Recent-change labels share the indexer's deterministic dates; no browser clock or storage grants. */
function changeLabels(data) {
  const vi = data.changes && data.changes.locale === 'vi';
  return vi ? { title: 'Changes to read', new: 'Mới', page: 'Trang', decision: 'Quyết định', amendment: 'Amendment', empty: 'Không có thay đổi trong khoảng này.' }
    : { title: 'Changes to read', new: 'New', page: 'Page', decision: 'Decision', amendment: 'Amendment', empty: 'No changes in this window.' };
}

function changeText(date, data) {
  if (!date) return '';
  return `${changeLabels(data || state.data).new} · ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/* What the "*" mark means in the code: the page, decision or amendment is dated within the recent window (manifest changes.recent_days,
   default 7) ending at the newest date in the spec. It is not "since you last read": the reader keeps no read history. */
function changeLegend(data) {
  const c = (data || state.data).changes;
  const vi = c.locale === 'vi';
  return vi ? `Đổi trong ${c.recentDays} ngày gần nhất, tính đến ${c.newest}` : `Changed in the last ${c.recentDays} days, up to ${c.newest}`;
}

function changeChip(date, recent, data) {
  if (!recent || !date) return '';
  const label = changeText(date, data);
  const tip = `${label}. ${changeLegend(data)}`;
  return `<span class="chip change-chip" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)} (${escapeHtml(date)})"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg>${escapeHtml(label)}</span>`;
}

function decorateChangeRows(root, page) {
  const data = state.data;
  const decision = Object.fromEntries(((data.decisions && data.decisions.items) || []).map((d) => [d.id, d]));
  const amendment = Object.fromEntries(((data.amendments && data.amendments.items) || []).map((a) => [a.id, a]));
  const ledger = data.decisions && data.decisions.pageId;
  const contract = data.amendments && data.amendments.fcId;
  $$('tbody tr', root).forEach((tr) => {
    const cell = tr.firstElementChild;
    const id = cell ? cell.textContent.trim() : '';
    let item;
    if (page.id === ledger || page.id === 'decisions') item = decision[id];
    if (page.id === contract || page.id === 'amendments') {
      item = amendment[id] || Object.values(amendment).find((a) => a.rows.some((r) => r.id === id));
    }
    if (item && item.recent && !cell.querySelector('.change-chip')) cell.insertAdjacentHTML('beforeend', changeChip(item.date, true));
  });
}

function gpChanges(data) {
  const labels = changeLabels(data);
  const changes = data.changes;
  const md = [`${changes.since} — ${changes.newest}`, '', data.changes.locale === 'vi'
    ? 'Đọc các trang spec đã đổi trước khi quyết định có code hay không. Các link đưa đến đúng trang hoặc dòng quyết định/amendment; ngày mới nhất đứng trước.'
    : 'Read the changed spec before deciding whether to code. Links open the exact page or decision/amendment row, newest first.', ''];
  if (!changes.items.length) md.push(labels.empty);
  else {
    md.push('| Date | Type | Read | Impacted pages |', '|---|---|---|---|');
    changes.items.forEach((item) => {
      const text = `${item.kind === 'page' ? '' : item.id + ' · '}${item.title}`;
      const impacted = item.mentions.map((p) => `<a href="${hashOf(p.id, '')}">${escapeHtml(p.label)}</a>`).join(' · ');
      md.push(`| ${item.date} ${changeChip(item.date, true, data)} | ${labels[item.kind]} | <a href="${hashOf(item.page, item.token)}">${gpCell(escapeHtml(text))}</a> | ${gpCell(impacted) || '—'} |`);
    });
  }
  return gpPage(data, 'changes-to-read', labels.title, labels.title, md.join('\n'));
}

/* Historical wording is rendered separately; current Markdown and the search index never include it. */
function historyText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('.change-chip, .anchor-btn, .block-history' + (node.tagName === 'LI' ? ', ul, ol' : '')).forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function historyBlock(text, kind) {
  const host = document.createElement('div');
  let md = text;
  if (kind === 'row') {
    const cols = text.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).length;
    md = '| ' + Array(cols).fill('Column').join(' | ') + ' |\n| ' + Array(cols).fill('---').join(' | ') + ' |\n' + text;
  }
  host.innerHTML = markedFor(false).parse(md);
  return host.querySelector(kind === 'row' ? 'tbody tr' : kind === 'list' ? 'li' : 'p') || host;
}

function historyLabel(record, target) {
  const linked = new Set(Array.from(target?.querySelectorAll('a') || []).map(a => a.textContent.trim()));
  const vi = state.data.changes.locale === 'vi';
  const box = document.createElement('div');
  box.className = 'block-history';
  box.dataset.change = record.id;
  box.setAttribute('role', 'note');
  const description = !record.before ? (vi ? 'Nội dung mới' : 'New block') : !record.after ? (vi ? 'Nội dung đã bỏ' : 'Removed block') : (vi ? 'Nội dung trước thay đổi' : 'Previous wording');
  box.setAttribute('aria-label', description);
  box.innerHTML = changeChip(record.date, true) + ' ' + Array.from(new Set(record.refs)).filter(id => !linked.has(id)).map((id) => {
    const target = idTarget(id);
    return `<a href="${escapeHtml(target)}">${escapeHtml(id)}</a>`;
  }).join(' · ');
  return box;
}

function historyBefore(box, text, showLabel = true) {
  const label = document.createElement('span');
  label.className = 'history-label';
  label.textContent = state.data.changes.locale === 'vi' ? 'Trước thay đổi: ' : 'Previous wording: ';
  const old = document.createElement('del');
  old.className = 'previous-wording';
  old.innerHTML = markedFor(false).parseInline(text);
  old.querySelectorAll('a').forEach((a) => a.replaceWith(document.createTextNode(a.textContent)));
  old.querySelectorAll('img').forEach((img) => img.replaceWith(document.createTextNode(img.alt)));
  box.append(document.createElement('br'));
  if (showLabel) box.append(label);
  box.append(old);
}

function decorateBlockHistory(root, page) {
  if (page.generated || !page.blockChanges?.length) return;
  const selectors = { row: 'tbody tr', paragraph: 'p', list: 'li' };
  const occupied = new Set();
  const previous = new Set();
  for (const original of page.blockChanges) {
    const record = {...original};
    if (record.before && previous.has(record.before)) record.before = "";
    if (root.querySelector(`[data-change="${record.id}"]`)) continue;
    const expected = record.after ? historyBlock(record.after, record.kind) : null;
    const candidates = Array.from(root.querySelectorAll(selectors[record.kind])).filter((n) => !n.closest('.block-history'));
    const target = expected && candidates.filter((n) => historyText(n) === historyText(expected))[record.occurrence || 0];
    if (target && occupied.has(target)) continue;
    if (target) occupied.add(target);
    if (record.before) previous.add(record.before);
    if (record.after && !target) continue;
    if (!record.after) {
      const removed = historyLabel(record);
      removed.classList.add('removed-block');
      historyBefore(removed, record.before);
      const next = record.next && historyBlock(record.next, record.kind);
      const following = next && candidates.find((n) => historyText(n) === historyText(next));
      const anchor = following?.closest('.table-wrap') || following;
      if (anchor) anchor.before(removed); else root.append(removed);
      continue;
    }
    const linkedRefs = new Set();
    target.querySelectorAll('a').forEach(a => {
      const id = a.textContent.trim();
      if (!/^(A-\d+|D\d+)$/.test(id)) return;
      if (linkedRefs.has(id)) a.replaceWith(document.createTextNode(id));
      else linkedRefs.add(id);
    });
    const label = historyLabel(record, target);
    const existingChip = target.querySelector('.change-chip');
    if (existingChip?.getAttribute('aria-label')?.includes(record.date)) label.querySelector('.change-chip')?.remove();
    else existingChip?.remove();
    if (record.kind === 'row') {
      target.classList.add('changed-block');
      target.cells[0].append(label);
      if (record.before) {
        const before = historyBlock(record.before, 'row');
        let labelled = false;
        const seen = new Set();
        Array.from(target.cells).forEach((cell, i) => {
          const old = before.cells?.[i];
          if (!old || historyText(old) === historyText(cell)) return;
          const previous = document.createElement('div');
          previous.className = 'block-history previous-cell';
          previous.dataset.change = record.id;
          const raw = record.before.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/)[i]?.trim() || old.textContent;
          if (seen.has(raw)) return;
          seen.add(raw);
          historyBefore(previous, raw, !labelled);
          labelled = true;
          cell.prepend(previous);
        });
      }
    } else {
      target.classList.add('changed-block');
      if (record.before) historyBefore(label, record.before);
      target.prepend(label);
    }
  }
}

/* Pages tree: grouped by artifact or by audience, collapsible, current page highlighted. */
const CHEV = '<svg class="ico chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
const treeCache = {};
let openGroups = new Set();

function loadOpen(view) {
  try { openGroups = new Set(JSON.parse(store.get('open.' + view) || '[]')); } catch (e) { openGroups = new Set(); }
  if (view === 'readable' && !store.get('open.readable')) openGroups.add('r:Epics');
}
const saveOpen = () => store.set('open.' + treeView(), JSON.stringify([...openGroups]));

function groupKeyOf(page, view) {
  if (view === 'readable') return page.group ? 'r:' + page.group : 'r:';
  return view === 'artifact' ? 'a' + page.artifact : 't' + page.tier;
}
function groupLabel(key, view) {
  if (view === 'readable') return { text: key.slice(2) || 'Readable view', num: '' };
  if (view === 'artifact') {
    const a = state.arts[+key.slice(1)];
    return { text: a.name, num: a.n && a.n < 90 ? a.n : '' };
  }
  return { text: state.tiers[key.slice(1)].name, num: '' };
}

function toggleButton(label, key, count) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tree-toggle';
  b.dataset.key = key;
  b.setAttribute('aria-expanded', openGroups.has(key) ? 'true' : 'false');
  b.innerHTML = `${CHEV}<span class="tree-label">${escapeHtml(label)}</span><span class="chip">${count}</span>`;
  return b;
}

function linkItem(p) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'tree-link';
  a.href = hashOf(p.id, '');
  a.dataset.page = p.id;
  a.innerHTML = '<span></span>';
  a.firstChild.textContent = p.label;
  a.insertAdjacentHTML('beforeend', changeChip(p.updated, p.recent));
  a.title = p.title;
  li.appendChild(a);
  return li;
}

function buildTree(view) {
  const nav = document.createElement('div');
  if (state.pages['changes-to-read']) {
    const top = document.createElement('ul');
    top.className = 'tree-top';
    top.appendChild(linkItem(state.pages['changes-to-read']));
    nav.appendChild(top);
  }
  const groups = new Map();
  state.order[view].filter((id) => id !== 'changes-to-read').map((id) => state.pages[id]).forEach((p) => {
    const k = groupKeyOf(p, view);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  });
  groups.forEach((list, key) => {
    if (key === 'r:') {
      const top = document.createElement('ul');
      top.className = 'tree-top';
      list.forEach((p) => top.appendChild(linkItem(p)));
      nav.appendChild(top);
      return;
    }
    const sec = document.createElement('div');
    sec.className = 'tree-group';
    const lab = groupLabel(key, view);
    const btn = toggleButton((lab.num ? lab.num + '  ' : '') + lab.text, key, list.length);
    const ul = document.createElement('ul');
    ul.className = 'tree-children';
    ul.hidden = !openGroups.has(key);
    const subs = new Map();
    list.forEach((p) => {
      if (!p.group || view === 'readable') { ul.appendChild(linkItem(p)); return; }
      if (!subs.has(p.group)) subs.set(p.group, []);
      subs.get(p.group).push(p);
    });
    subs.forEach((items, name) => {
      const subKey = key + '/' + name;
      const li = document.createElement('li');
      li.className = 'tree-sub';
      const sb = toggleButton(name, subKey, items.length);
      const sul = document.createElement('ul');
      sul.className = 'tree-children';
      sul.hidden = !openGroups.has(subKey);
      items.forEach((p) => sul.appendChild(linkItem(p)));
      li.append(sb, sul);
      ul.appendChild(li);
    });
    sec.append(btn, ul);
    nav.appendChild(sec);
  });
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('.tree-toggle');
    if (b) {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.nextElementSibling.hidden = !open;
      if (open) openGroups.add(b.dataset.key); else openGroups.delete(b.dataset.key);
      saveOpen();
      return;
    }
    if (e.target.closest('.tree-link')) closeDrawer();
  });
  return nav;
}

function showTree() {
  const view = treeView();
  loadOpen(view);
  const host = $('#tree');
  host.setAttribute('aria-label', view === 'readable' ? 'Readable view pages' : 'Build spec pages grouped by ' + view);
  host.replaceChildren(buildTree(view));
  $('#pages-count').textContent = view === 'readable' ? state.order.readable.length : state.data.pages.length - state.order.readable.length;
}

function syncTreeToPage(page) {
  const host = $('#tree');
  const key = groupKeyOf(page, treeView());
  const need = [key];
  if (page.group) need.push(key + '/' + page.group);
  need.forEach((k) => {
    const b = host.querySelector(`.tree-toggle[data-key="${CSS.escape(k)}"]`);
    if (b && b.getAttribute('aria-expanded') !== 'true') { b.click(); }
  });
  $$('.tree-link[aria-current]', host).forEach((a) => a.removeAttribute('aria-current'));
  const cur = host.querySelector(`.tree-link[data-page="${CSS.escape(page.id)}"]`);
  if (cur) {
    cur.setAttribute('aria-current', 'page');
    const box = $('#tree');
    const r = cur.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top + 8 || r.bottom > b.bottom - 8) box.scrollTop += r.top - b.top - b.height / 3;
  }
}

/* On this page: built from the rendered headings, with scroll spy. */
let spyHeads = [];
let spyLinks = [];
let spyBound = false;

function tocHeadings(root) {
  const all = $$('h1, h2, h3', root).filter((h) => h.id);
  if (!all.length) return [];
  const min = Math.min(...all.map((h) => +h.tagName[1]));
  return all.map((h) => ({ el: h, level: Math.min(3, +h.tagName[1] - min + 1), text: h.querySelector('.heading-text').textContent }));
}

function tocList(items, pageId) {
  const ul = document.createElement('ul');
  items.forEach((it) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'toc-link lvl-' + it.level;
    a.href = hashOf(pageId, it.el.id);
    a.textContent = it.text;
    a.dataset.target = it.el.id;
    li.appendChild(a);
    ul.appendChild(li);
  });
  return ul;
}

function buildToc(root, page) {
  const items = tocHeadings(root);
  const toc = $('#toc');
  const inline = $('#toc-inline');
  toc.replaceChildren();
  $('#toc-count').textContent = items.length;
  $('#toc-count').hidden = !items.length;
  if (inline) inline.remove();
  $('#shell').classList.toggle('no-toc', !items.length);
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'toc-empty';
    p.textContent = 'This page has no sections.';
    toc.appendChild(p);
    spyHeads = [];
    spyLinks = [];
    return;
  }
  toc.appendChild(tocList(items, page.id));
  const det = document.createElement('details');
  det.className = 'toc-inline';
  det.id = 'toc-inline';
  det.innerHTML = `<summary>On this page <span class="chip">${items.length}</span></summary>`;
  det.appendChild(tocList(items, page.id));
  $('.page-head').after(det);
  spyHeads = items.map((i) => i.el);
  spyLinks = $$('.toc-link', toc);
  bindSpy();
  updateSpy();
}

function updateSpy() {
  if (!spyHeads.length) return;
  const line = $('#topbar').offsetHeight + 40;
  let idx = 0;
  spyHeads.forEach((h, i) => { if (h.getBoundingClientRect().top <= line) idx = i; });
  spyLinks.forEach((a, i) => { if (i === idx) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  const cur = spyLinks[idx];
  const box = $('#toc');
  if (cur && box.scrollHeight > box.clientHeight) {
    const r = cur.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - b.height / 3;
  }
}

function bindSpy() {
  if (spyBound) return;
  spyBound = true;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; updateSpy(); });
  }, { passive: true });
}

/* Page view: breadcrumb, header, body, pager, and the hash router. */
let firstRoute = true;

function firstPageOfGroup(page) {
  const list = currentOrder().map((id) => state.pages[id]);
  const key = groupKeyOf(page, treeView());
  return list.find((p) => groupKeyOf(p, treeView()) === key) || page;
}

function renderCrumbs(page) {
  const items = [[state.data.title, '#' + defaultPageId()]];
  if (layerOf(page) === 'readable') {
    if (page.id !== state.order.readable[0]) items.push(['Readable view', '#' + state.order.readable[0]]);
    if (page.group) items.push([page.group, '']);
  } else if (page.id !== 'start') {
    const lab = groupLabel(groupKeyOf(page, state.view), state.view);
    items.push([lab.text, hashOf(firstPageOfGroup(page).id, '')]);
    if (page.group) items.push([page.group, '']);
  }
  const ol = document.createElement('ol');
  ol.className = 'breadcrumb-list';
  items.forEach(([text, href]) => {
    const li = document.createElement('li');
    if (href) { const a = document.createElement('a'); a.href = href; a.textContent = text; li.appendChild(a); } else li.textContent = text;
    ol.appendChild(li);
  });
  const cur = document.createElement('li');
  cur.setAttribute('aria-current', 'page');
  cur.textContent = page.label;
  ol.appendChild(cur);
  $('#crumbs').replaceChildren(ol);
}

function renderPager(page) {
  const order = currentOrder();
  const i = order.indexOf(page.id);
  const link = (id, cls, kicker) => {
    const p = state.pages[id];
    return `<a class="${cls}" href="${hashOf(id, '')}" aria-label="${kicker} ${escapeHtml(p.label)}"><span class="pager-kicker">${kicker}</span><span class="pager-title">${escapeHtml(p.label)}</span></a>`;
  };
  $('#pager').innerHTML = (i > 0 ? link(order[i - 1], 'prev', 'Previous:') : '<span></span>') + (i < order.length - 1 ? link(order[i + 1], 'next', 'Next:') : '');
}

function pageHead(page) {
  return `<header class="page-head"><h1 class="page-title" id="page-title">${escapeHtml(page.title)}</h1>${epicLine(page)}${metaLine(page)}${tierBanner(page)}</header>`;
}

function scrollToToken(page, token) {
  if (!token) { window.scrollTo(0, 0); return; }
  const id = page.kind === 'dossier' ? 'dos-' + token : token;
  const el = document.getElementById(id);
  if (!el) { window.scrollTo(0, 0); return; }
  el.scrollIntoView({ block: 'start' });
  if (el.tagName === 'TR') { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2400); }
  holdScroll(page, token, el);
}

/* Diagrams and images above a deep link grow after the first scroll; keep the target in place until the reader scrolls. */
let userScrolled = false;
['wheel', 'touchmove', 'keydown', 'mousedown'].forEach((ev) => window.addEventListener(ev, () => { userScrolled = true; }, { passive: true }));
let holdTimers = [];
function holdScroll(page, token, el) {
  holdTimers.forEach(clearTimeout);
  userScrolled = false;
  const again = () => {
    if (userScrolled || state.current !== page.id || parseHash().token !== token) return;
    const t = document.getElementById(page.kind === 'dossier' ? 'dos-' + token : token);
    if (t) t.scrollIntoView({ block: 'start' });
  };
  const before = $$('.diagram[data-mermaid]').filter((d) => el.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_PRECEDING);
  Promise.all(before.map(queueRender)).then(again);
  holdTimers = [300, 1000, 2400, 4500].map((ms) => setTimeout(again, ms));
}

function showNotFound(id) {
  state.current = null;
  $('#crumbs').replaceChildren();
  $('#article').innerHTML = `<div class="not-found"><h1 class="page-title">Page not found</h1><p>No page has the id <code>${escapeHtml(id)}</code>. Open the overview or search the pages.</p><p><a class="btn primary" href="#start">Open the overview</a></p></div>`;
  $('#pager').replaceChildren();
  $('#toc').replaceChildren();
  $('#toc-count').hidden = true;
  document.title = docTitle('Page not found');
}

function syncLayerUI() {
  const on = hasReadable();
  $('#layer-row').hidden = !on;
  $$('#layer-switch [role="radio"]').forEach((b) => b.setAttribute('aria-checked', b.dataset.layer === state.layer ? 'true' : 'false'));
  $('#foot-build').hidden = state.layer === 'readable';
  $('#foot-readable').hidden = state.layer !== 'readable';
}

function setLayer(layer) {
  const last = store.get('last.' + layer);
  const ok = last && state.pages[last] && layerOf(state.pages[last]) === layer;
  location.hash = '#' + (ok ? last : layer === 'readable' ? state.order.readable[0] : 'start');
}

function showPage(page, token) {
  const same = state.current === page.id;
  state.current = page.id;
  if (layerOf(page) !== state.layer) { state.layer = layerOf(page); showTree(); }
  syncLayerUI();
  store.set('last.' + state.layer, page.id);
  if (same) {
    if (page.id === 'reference-chain' && /^(req|us|nf)-/i.test(token || '')) applyChainToken(token);
    else scrollToToken(page, token);
    return;
  }
  document.title = docTitle(page.title === state.data.title ? page.label : page.title);
  renderCrumbs(page);
  const art = $('#article');
  art.innerHTML = pageHead(page) + '<div class="prose" id="prose"></div>';
  const prose = $('#prose');
  if (page.kind === 'dossier') {
    renderDossier(prose, page, token);
  } else if (page.kind === 'prototype') {
    renderPrototypePage(prose, page);
    buildToc(prose, page);
    window.scrollTo(0, 0);
  } else {
    prose.innerHTML = renderMarkdown(page, '');
    if (page.fm) {
      const d = document.createElement('details');
      d.className = 'fm-box';
      d.innerHTML = '<summary>Show front matter</summary><div class="code-block"><pre><code></code></pre></div>';
      d.querySelector('code').textContent = page.fm;
      prose.prepend(d);
    }
    decorate(prose, page, '');
    if (page.kind === 'wireframes') decorateWireframes(prose, page);
    const h6 = labelAsciiWireframes(prose);
    addWireframeBoards(prose, page, h6);
    markWireframeImages(prose, page);
    mountWidgets(prose, page, token);
    renderDiagrams(prose);
    buildToc(prose, page);
    scrollToToken(page, token);
  }
  renderPager(page);
  syncTreeToPage(page);
  if (!firstRoute) art.focus({ preventScroll: true });
  firstRoute = false;
}

function route() {
  const { page, token } = parseHash();
  const p = state.pages[page];
  if (!p) { showNotFound(page); return; }
  showPage(p, token);
}

function changeView(view) {
  state.view = view;
  store.set('view', view);
  $('#sel-group').value = view;
  showTree();
  if (state.current) {
    const p = state.pages[state.current];
    renderCrumbs(p);
    renderPager(p);
    syncTreeToPage(p);
  }
}

/* Wireframe sections: the ASCII wireframe from the story, then the HTML board for the screens it draws. */
const NOT_BUILT_MARK = 'Coded screen not built yet';

function labelAsciiWireframes(prose) {
  const h = $$('h2', prose).find((x) => /^6[.\-]/.test(x.id) || /^6\./.test(x.textContent.trim()));
  if (!h) return null;
  let n = h.nextElementSibling;
  while (n && !/^H[12]$/.test(n.tagName)) {
    if (n.classList && n.classList.contains('code-block')) {
      const label = n.querySelector('.code-head span');
      if (label && /^(text|ascii)?$/i.test(label.textContent.trim())) label.textContent = 'ASCII wireframe';
      else if (label && /^text$/i.test(label.textContent)) label.textContent = 'ASCII wireframe';
    }
    n = n.nextElementSibling;
  }
  return h;
}

function scaleBoard(box) {
  const frame = $('iframe', box);
  if (!frame) return;
  const s = Math.min(1, box.clientWidth / 1440);
  frame.style.width = '1440px';
  frame.style.height = Math.round(760 / s) + 'px';
  frame.style.transform = 'scale(' + s + ')';
  box.style.height = '760px';
}

function boardCard(b) {
  const det = document.createElement('details');
  det.className = 'board';
  det.dataset.board = b.id;
  const open = b.html ? ` <a class="board-open" href="${b.html}" target="_blank" rel="noopener noreferrer">Open HTML wireframe</a>` : '';
  det.innerHTML = `<summary>${b.html ? 'Show HTML wireframe' : 'Show wireframe image'}: ${escapeHtml(b.id)} ${escapeHtml(b.name)}</summary><div class="board-box"></div>${open ? `<p class="board-links">${open}</p>` : ''}`;
  det.addEventListener('toggle', () => {
    const box = $('.board-box', det);
    if (!det.open || box.firstChild) { if (det.open) scaleBoard(box); return; }
    if (MODE === 'offline' && b.html) {
      const f = document.createElement('iframe');
      f.setAttribute('sandbox', '');
      f.setAttribute('loading', 'lazy');
      f.title = 'HTML wireframe ' + b.id;
      f.src = b.html;
      box.appendChild(f);
      scaleBoard(box);
    } else {
      const img = document.createElement('img');
      img.src = b.png;
      img.alt = 'Wireframe board ' + b.id + ' ' + b.name;
      img.loading = 'lazy';
      img.setAttribute('data-zoom', '');
      box.classList.add('board-img');
      box.appendChild(img);
    }
  });
  return det;
}

function addWireframeBoards(prose, page, h6) {
  const chain = state.data.chain;
  const st = chain && chain.stories.find((s) => s.page === page.id);
  if (!st || !h6 || !st.boards.length) return;
  const boards = st.boards.map((id) => state.data.chain.boards.find((b) => b.id === id)).filter(Boolean);
  const wrap = document.createElement('div');
  wrap.className = 'boards';
  wrap.innerHTML = `<h3 class="boards-title">HTML wireframes for these screens <span class="chip">${boards.length}</span></h3>`;
  boards.forEach((b) => wrap.appendChild(boardCard(b)));
  let n = h6.nextElementSibling;
  let last = h6;
  while (n && !/^H[12]$/.test(n.tagName)) { last = n; n = n.nextElementSibling; }
  last.after(wrap);
}

/* Marks images that are wireframes shown only because no coded screen exists. */
function markWireframeImages(root, page) {
  $$('img', root).forEach((img) => {
    const src = img.getAttribute('src') || '';
    const role = (page.imgRoles || {})[src];
    if (role === 'section' || role === 'not-built') img.setAttribute('data-wireframe', role);
  });
}

/* Wireframes page: each state's ASCII drawing is shown as a screen, not as a code listing; flows read as arrows. */
const WF_STATE_TONE = { normal: 'ok', empty: 'warn', error: 'bad', loading: 'info' };
const WF_HEAD = /^(SCR-\d{3,})--(normal|empty|error|loading)$/;
const FLOW_STEP = /^SCR-\d{3,}(?:\s+--[^\n]+?-->\s+SCR-\d{3,})+$/;

function flowArrows(path) {
  const parts = path.trim().split(/\s+--(.+?)-->\s+/);
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 2) out += ' → ' + parts[i + 1] + ' (' + parts[i].trim() + ')';
  return out;
}

function decorateWireframes(root, page) {
  const info = page.stage || { screens: [] };
  const screen = Object.fromEntries(info.screens.map((s) => [s.id, s]));
  const normalHead = {};
  $$('h3', root).forEach((h) => {
    const text = h.querySelector('.heading-text');
    const m = WF_HEAD.exec(text.textContent.trim());
    if (!m) return;
    const sc = screen[m[1]] || {};
    text.textContent = m[1] + ' · ' + (sc.title ? sc.title + ' — ' : '') + m[2];
    h.dataset.screen = m[1];
    if (m[2] === 'normal') normalHead[m[1]] = h.id;
    const block = h.nextElementSibling;
    if (!block || !block.classList.contains('code-block')) return;
    const fig = document.createElement('figure');
    fig.className = 'screen-frame';
    fig.dataset.state = m[2];
    ['data-src-start', 'data-src-end', 'data-src-fence'].forEach((a) => { if (block.hasAttribute(a)) fig.setAttribute(a, block.getAttribute(a)); });
    const bar = document.createElement('figcaption');
    bar.className = 'screen-frame-bar';
    const chip = document.createElement('span');
    chip.className = 'chip tone-' + (WF_STATE_TONE[m[2]] || 'neutral');
    chip.textContent = m[2];
    bar.appendChild(chip);
    const serves = [...(sc.us || [])];
    if (serves.length) { const s = document.createElement('span'); s.className = 'screen-frame-ids'; s.textContent = 'Phục vụ ' + serves.join(' · '); bar.appendChild(s); }
    const pre = document.createElement('pre');
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', 'Wireframe ' + h.querySelector('.heading-text').textContent);
    const code = document.createElement('code');
    code.textContent = block.querySelector('code').textContent;
    pre.appendChild(code);
    fig.append(bar, pre);
    block.replaceWith(fig);
  });
  $$('tbody tr', root).forEach((tr) => {
    const cell = tr.cells[1];
    if (cell && tr.cells.length === 2 && FLOW_STEP.test(cell.textContent.trim())) {
      cell.textContent = flowArrows(cell.textContent);
      cell.classList.add('flow-cell');
    }
  });
  $$('tbody tr', root).forEach((tr) => {
    const first = tr.cells[0];
    const id = first ? first.textContent.trim() : '';
    if (/^SCR-\d{3,}$/.test(id) && normalHead[id]) {
      const a = document.createElement('a');
      a.href = hashOf(page.id, normalHead[id]);
      a.textContent = id;
      first.replaceChildren(a);
    }
  });
}

/* Reference chain picker: choose a requirement or a story, see the chain to screens and evidence. */
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);
const mmText = (s) => String(s).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
let chainHost = null;

function chainLookup(id) {
  const c = state.data.chain;
  const up = id.toUpperCase();
  const req = c.reqs.find((r) => r.id === up);
  if (req) return { kind: 'req', req, stories: req.us.map((u) => c.stories.find((s) => s.id === u)).filter(Boolean) };
  const story = c.stories.find((s) => s.id === up);
  if (story) return { kind: 'story', story, reqs: story.reqs.map((r) => c.reqs.find((x) => x.id === r)).filter(Boolean), stories: [story] };
  return null;
}

function chainDiagram(res) {
  const lines = ['%%{init: {"flowchart": {"rankSpacing": 22, "nodeSpacing": 16, "useMaxWidth": true}}}%%', 'flowchart LR'];
  const reqs = res.kind === 'req' ? [res.req] : res.reqs;
  reqs.forEach((r, i) => lines.push(`R${i}["${r.id}<br/>${mmText(clip(r.title, 22))}"]`));
  res.stories.forEach((s, j) => {
    lines.push(`U${j}["${s.id}<br/>${mmText(clip(s.title, 22))}"]`, `A${j}["${s.acs.length} ACs"]`,
      `S${j}["${s.screens.length ? s.screens.slice(0, 2).join(' ') + (s.screens.length > 2 ? ' +' + (s.screens.length - 2) : '') : 'no screen'}"]`,
      `E${j}["${s.boards.length} boards<br/>${s.scenarios} scenarios"]`, `U${j} --> A${j} --> S${j} --> E${j}`, `click U${j} href "${hashOf(s.page, '')}"`);
    reqs.forEach((r, i) => { if (s.reqs.includes(r.id)) lines.push(`R${i} --> U${j}`); });
  });
  return lines.join('\n');
}

function storyCard(s) {
  const c = state.data.chain;
  const boards = s.boards.map((b) => c.boards.find((x) => x.id === b)).filter(Boolean);
  const rows = s.acs.map((a) => `<tr><td><a href="${hashOf(s.page, s.acHead || '')}">${a.id}</a></td><td>${escapeHtml(clip(a.when, 160))}</td><td>${a.scn}</td></tr>`).join('');
  return `<article class="chain-story"><div class="chain-story-head"><a href="${hashOf(s.page, '')}">${s.id}</a><span>${escapeHtml(s.title)}</span>
    <span>Acceptance criteria</span><span class="chip">${s.acs.length}</span><span>Scenarios</span><span class="chip">${s.scenarios}</span></div>
    <div class="chain-evidence"><span>Screens</span>${s.screens.map((x) => `<span class="chip">${x}</span>`).join('') || '<span>none</span>'}
    <span>Boards</span>${boards.map((b) => `<a class="chip" href="${b.png}" title="${escapeHtml(b.name)}">${b.id}</a>`).join('') || '<span>none</span>'}</div>
    ${s.acs.length ? `<details><summary>Show ${s.acs.length} acceptance criteria</summary><div class="table-wrap chain-acs" tabindex="0"><table><thead><tr><th>AC</th><th>Given / when</th><th>Scenarios</th></tr></thead><tbody>${rows}</tbody></table></div></details>` : ''}</article>`;
}

function renderChainResult(id) {
  const out = $('#chain-result', chainHost);
  const res = chainLookup(id);
  if (!res) { out.innerHTML = '<p class="chain-empty">No requirement or story has that id.</p>'; return; }
  const c = state.data.chain;
  let head;
  if (res.kind === 'req') {
    const grp = res.req.group && c.prdPage ? ` <a href="${hashOf(c.prdPage, slugify(res.req.group))}">${escapeHtml(res.req.group)}</a>` : '';
    head = `<div class="chain-head"><h3>${res.req.id}</h3><span>${escapeHtml(res.req.title)}</span><span>Stories</span><span class="chip">${res.stories.length}</span><span>Acceptance criteria</span><span class="chip">${res.stories.reduce((n, s) => n + s.acs.length, 0)}</span></div><p class="chain-empty">PRD section:${grp || ' none'}</p>`;
  } else {
    head = `<div class="chain-head"><h3>${res.story.id}</h3><span>${escapeHtml(res.story.title)}</span><span>Requirements</span><span class="chip">${res.reqs.length}</span></div><p class="chain-empty">${res.reqs.map((r) => `<a href="${hashOf('reference-chain', r.id.toLowerCase())}">${r.id}</a> ${escapeHtml(clip(r.title, 90))}`).join('<br>')}</p>`;
  }
  const list = res.stories.length ? `<div class="chain-list">${res.stories.map(storyCard).join('')}</div>` : '<p class="chain-empty">No story file cites this requirement.</p>';
  out.innerHTML = `${head}<div class="diagram is-pending" data-mermaid><pre class="mermaid">${escapeHtml(chainDiagram(res))}</pre></div>${list}`;
  decorate(out, { generated: true }, 'chain-');
  $$('img', out).forEach(() => {});
  renderDiagrams(out);
}

function mountChain(prose, token) {
  chainHost = $('[data-widget="reference-chain"]', prose);
  const c = state.data.chain;
  const opts = (list, fmt) => list.map((x) => `<option value="${x.id}">${escapeHtml(fmt(x))}</option>`).join('');
  chainHost.innerHTML = `<div class="picker"><div class="picker-row"><label for="chain-select">Pick a requirement or a story</label>
    <select id="chain-select" class="select"><optgroup label="Requirements">${opts(c.reqs, (r) => `${r.id} · ${clip(r.title, 70)}`)}</optgroup>
    <optgroup label="User stories">${opts(c.stories, (s) => `${s.id} · ${clip(s.title, 70)}`)}</optgroup></select></div><div id="chain-result"></div></div>`;
  $('#chain-select', chainHost).addEventListener('change', (e) => {
    history.replaceState(null, '', hashOf('reference-chain', e.target.value.toLowerCase()));
    renderChainResult(e.target.value);
  });
  applyChainToken(/^(req|us|nf)-/i.test(token || '') ? token : '');
}

function applyChainToken(token) {
  const sel = $('#chain-select', chainHost);
  if (!sel) return;
  const first = (state.data.chain.reqs[0] || state.data.chain.stories[0]).id;
  const want = (token || first).toUpperCase();
  if (token && !chainLookup(want)) { sel.selectedIndex = -1; $('#chain-result', chainHost).innerHTML = `<p class="chain-empty" role="alert">No requirement or story has the id ${escapeHtml(want)}.</p>`; return; }
  sel.value = want;
  renderChainResult(want);
}

function mountWidgets(prose, page, token) {
  if (page.id === 'reference-chain') mountChain(prose, token);
  else if (token) setTimeout(() => scrollToToken(page, token), 0);
}

/* Generated pages: built in the browser from content.json, so the content stays project data and every behaviour lives in the shell.
   Pages that need data the spec does not carry are skipped; the indexer lists the skipped ones in content.json (data.skipped). */
const gpEsc = (s) => String(s).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
const gpStatus = (s) => String(s || '').split(/[:;(]/)[0].trim().replace(/^Draft for .*/, 'Draft').replace(/^Current to .*/, 'Current').replace(/^./, (c) => c.toUpperCase());
const gpShort = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const gpCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const gpChip = (text, tone) => `<span class="chip${tone ? ` tone-${tone}` : ''}">${text}</span>`;
const gpTone = (s) => (/done|locked|written|current|reviewed|built/i.test(s || '') ? 'ok' : /draft|progress|per wave|planned|review/i.test(s || '') ? 'warn' : '');
const gpFence = (src) => `\`\`\`mermaid\n${src}\n\`\`\``;
const VIEW_BLURB = {
  'po-view': 'Release, epics, design preview, approvals and open questions.',
  'dev-view': 'One panel per story: flow, rules, selectors, screens, design-system references.',
  'qa-view': 'Each acceptance criterion with its scenarios, screen states, methods and evidence.',
  'open-items': 'Every unanswered question, blocking ones first.',
  'coverage': 'Passed, reviewed and covered acceptance criteria per area, with denominators.',
  'design-view': 'Every screen and state with its design source, preview and evidence.',
  'evidence-view': 'Evidence receipts and their freshness.',
  'source-ledger': 'Preserved source items and how each maps to typed spec items.',
};
const GP_ORDER = ['start', 'changes-to-read', 'reference-chain', 'amendments', 'decisions', 'dossier'];

function gpPage(data, id, title, label, md, extra) {
  return {
    id, title, label, md, rel: `generated/${id}`, artifact: 0, tier: 'index', group: '', generated: true, sort: `0-${GP_ORDER.indexOf(id)}`,
    owner: '', updated: data.date, status: 'Generated', trace: { a: [], d: [], req: [], us: [] }, ...(extra || {}),
  };
}

function gpStart(data) {
  const chain = data.chain;
  const tiers = data.tiers.filter((t) => t.id !== 'index' && t.count > 0);
  const rows = tiers.map((t) => `| <span class="nw">${t.name} ${gpChip(t.count)}</span> | ${t.audience || ''} | ${t.status ? gpChip(t.status, gpTone(t.status)) : ''} | ${t.purpose || ''} | <span class="nw">[Open ${t.name}](#${t.first})</span> |`);
  const arts = data.artifacts.filter((a) => a.n > 0);
  const nodes = []; const links = []; const classes = { ok: [], warn: [], planned: [] };
  arts.forEach((a) => {
    nodes.push(`A${a.n}["${a.n} · ${gpEsc(a.name)}<br/>${a.exported ? `${a.files} ${a.files === 1 ? 'file' : 'files'}` : 'not exported'}<br/>${gpEsc(gpStatus(a.status))}"]`);
    classes[!a.exported ? 'planned' : gpTone(a.status) === 'ok' ? 'ok' : 'warn'].push(`A${a.n}`);
    if (a.first) links.push(`click A${a.n} href "#${a.first}"`);
  });
  const ids = arts.map((a) => `A${a.n}`);
  const rowsOf = []; for (let i = 0; i < ids.length; i += 4) rowsOf.push(ids.slice(i, i + 4));
  const flow = [
    '%%{init: {"flowchart": {"rankSpacing": 24, "nodeSpacing": 24, "useMaxWidth": true}}}%%', 'flowchart TB',
    ...rowsOf.flatMap((r, i) => [`subgraph R${i + 1}[" "]`, 'direction LR', r.join(' --> '), 'end']),
    ...rowsOf.slice(1).map((_, i) => `R${i + 1} ~~~ R${i + 2}`), ...nodes, ...links,
    'classDef ok stroke:#1F8A5B,stroke-width:2px', 'classDef warn stroke:#9A6200,stroke-width:2px', 'classDef planned stroke:#8A8D95,stroke-dasharray:4 3',
    ...Object.entries(classes).filter(([, v]) => v.length).map(([k, v]) => `class ${v.join(',')} ${k}`),
    ...rowsOf.map((_, i) => `style R${i + 1} fill:none,stroke:none`),
  ].join('\n');
  const artRows = arts.map((a) => `| ${a.n} | ${a.name} | ${gpChip(a.exported ? a.files : 0)} | ${a.status ? gpChip(a.status, gpTone(a.status)) : ''} | ${a.first ? `[Open ${a.name}](#${a.first})` : 'Not in this spec'} |`);
  const md = [];
  if (data.changes) md.push(`<p class="changes-entry"><a href="#changes-to-read">${escapeHtml(changeLabels(data).title)}</a> ${gpChip(data.changes.items.length)}</p>`, '');
  if (data.readable && data.orderReadable && data.orderReadable.length) md.push(`Looking for the plain-language version? [Open the Readable view](#${data.orderReadable[0]}). This page opens the Build spec, the layer written for builders and testers.`, '');
  md.push(`Read the ${data.title} as one connected set: ${gpChip(data.counts.sourcePages)} pages across ${arts.length} artifacts. Pick the tier that matches your role${data.readingOrder.length ? ', follow the reading order' : ''}, or open the [full dossier](#dossier) to scan everything on one page.`);
  const viewIds = ['po-view', 'dev-view', 'qa-view', 'open-items', 'coverage', 'design-view', 'evidence-view', 'source-ledger'];
  const viewPages = viewIds.map((id) => data.pages.find((p) => p.id === id)).filter(Boolean);
  if (viewPages.length) md.push('', '## Role views', '', 'Generated from the same spec files for each role. They hold no authority of their own.', '', '| View | What it answers |', '|---|---|', ...viewPages.map((p) => `| [${p.title}](#${p.id}) | ${VIEW_BLURB[p.id] || ''} |`));
  if (rows.length) md.push('', '## Read by audience', '', '| Tier | Audience | Status | Purpose | Open |', '|---|---|---|---|---|', ...rows);
  md.push('', '## Artifact flow', '', 'Each artifact feeds the next one. Click a node to open its first page.', '', gpFence(flow), '', '| # | Artifact | Files | Status | Open |', '|---|---|---|---|---|', ...artRows);
  if (chain) {
    const t = chain.totals;
    const trace = ['%%{init: {"flowchart": {"rankSpacing": 24, "useMaxWidth": true}}}%%', 'flowchart LR',
      `REQ["${t.reqs} requirements${chain.prdTitle ? `<br/>${gpEsc(chain.prdTitle)}` : ''}"] --> US["${t.stories} user stories<br/>${t.storiesWithReq} cite a REQ"]`,
      `US --> AC["${t.acs} acceptance criteria"] --> SCR["${t.screens} screens"] --> EV["${t.boards} boards · ${t.scenarios} scenarios"]`];
    if (chain.prdPage) trace.push(`click REQ href "#${chain.prdPage}"`);
    if (chain.usIndexPage) trace.push(`click US href "#${chain.usIndexPage}"`);
    if (chain.inventoryPage) trace.push(`click SCR href "#${chain.inventoryPage}"`);
    if (chain.boardsPage) trace.push(`click EV href "#${chain.boardsPage}"`);
    md.push('', '## How requirements trace to evidence', '', 'Every requirement should end in a screen and a scenario that proves it. The counts below come from the PRD and the story files. [Open the reference chain map](#reference-chain) to pick a requirement or a story.', '', gpFence(trace.join('\n')));
  }
  if (data.readingOrder.length) {
    md.push('', '## Reading order', '', ...data.readingOrder.map((r, i) => `${i + 1}. ${r.links.map((l) => `[${l.label}](#${l.id})`).join(', then ')}${r.note ? `: ${r.note}` : ''}`));
  }
  md.push('');
  return gpPage(data, 'start', data.title, 'Spec overview', md.join('\n'));
}

function gpChain(data) {
  const t = data.chain.totals;
  const md = ['Pick a requirement to see the stories and acceptance criteria that cover it, or pick a story to see the requirements it serves. Ids come from the PRD requirement table and the story files.',
    '', '<div data-widget="reference-chain"></div>', '', '## Coverage', '',
    `- ${gpChip(t.reqsNoStory)} requirements are cited by no story file.`, `- ${gpChip(t.storiesNoReq)} story files cite no requirement.`];
  if (t.agree !== null && t.agree !== undefined) md.push(`- The PRD table and the story files name the same stories for ${gpChip(t.agree)} of ${gpChip(t.reqs)} requirements.`);
  md.push('');
  return gpPage(data, 'reference-chain', 'Reference chain map', 'Reference chain map', md.join('\n'));
}

function gpAmendments(data) {
  const am = data.amendments;
  const key = (a) => a.id.replace('-', '');
  const first = am.changes[0];
  const nodes = [`V0["${first ? `v${first.version}` : 'Locked'}<br/>Locked${first && first.date ? ` · ${first.date}` : ''}"]`];
  const edges = []; let prev = 'V0';
  am.items.forEach((a, i) => {
    nodes.push(`${key(a)}["${a.id}<br/>${gpEsc(a.round)} · ${a.decision}<br/>${a.rows.length} changes"]`, `V${i + 1}["${a.version ? `v${a.version}` : 'next'}<br/>${a.date}"]`);
    edges.push(`${prev} --> ${key(a)} --> V${i + 1}`);
    prev = `V${i + 1}`;
  });
  const flow = ['%%{init: {"flowchart": {"rankSpacing": 22, "nodeSpacing": 20, "useMaxWidth": true}}}%%', 'flowchart LR', ...nodes, ...edges,
    ...am.items.map((a) => `click ${key(a)} href "#amendments.${a.id.toLowerCase()}"`), 'classDef amend stroke:#4C5FD5,stroke-width:2px', `class ${am.items.map(key).join(',')} amend`].join('\n');
  const rows = am.items.map((a) => `| ${a.id} | ${a.version ? `v${a.version}` : ''} | ${a.date} | ${gpCell(a.round)} | ${a.decision} | ${gpChip(a.rows.length)} | ${gpCell(a.summary || a.title)} |`);
  const detail = am.items.map((a) => [`### ${a.id} · ${a.round} · ${a.decision}`, '',
    ...a.rows.slice(0, 5).map((r) => `- **${r.id}** ${gpShort(r.change, 190)}`), `- [Read all ${a.rows.length} rows in ${am.label}](#${am.fcId}.${a.headingId})`, ''].join('\n'));
  const md = [`${am.label} was locked at ${first ? `v${first.version}` : 'its first version'} and then amended ${am.items.length} ${am.items.length === 1 ? 'time' : 'times'} in place. Each amendment adds rows to the body and to the change log. Source: [${am.label}](#${am.fcId}).`,
    '', gpFence(flow), '', '## Amendments', '', '| Amendment | Version | Date | Source | Decision | Changes | What changed |', '|---|---|---|---|---|---|---|', ...rows,
    '', '## Largest changes per amendment', '', ...detail];
  if (am.changes.length) md.push('## Change log', '', '| Version | Date | Why | Approved by |', '|---|---|---|---|', ...am.changes.map((c) => `| ${c.version} | ${c.date} | ${gpCell(gpShort(c.why, 150))} | ${gpCell(gpShort(c.approved, 90))} |`), '');
  return gpPage(data, 'amendments', 'Amendment timeline', 'Amendment timeline', md.join('\n'));
}

function gpDecisions(data) {
  const dec = data.decisions;
  const byId = Object.fromEntries(dec.items.map((d) => [d.id, d]));
  const topics = dec.topics.map((t) => ({ ...t, items: t.ids.map((i) => byId[i]).filter(Boolean) })).filter((t) => t.items.length);
  const range = `${dec.items[0].id} to ${dec.items[dec.items.length - 1].id}`;
  const flow = ['%%{init: {"flowchart": {"rankSpacing": 36, "nodeSpacing": 10, "useMaxWidth": true}}}%%', 'flowchart LR', `ROOT(["${range}"])`];
  topics.forEach((t) => {
    flow.push(`ROOT --> ${t.id}(["${gpEsc(t.name)} · ${t.items.length}"])`);
    t.items.forEach((d) => flow.push(`${t.id} --> ${d.id}["${d.id} · ${gpEsc(gpShort(d.title, 34))}"]`));
  });
  topics.forEach((t) => t.items.forEach((d) => flow.push(`click ${d.id} href "#decisions.${d.id.toLowerCase()}"`)));
  flow.push('classDef topic stroke-width:2px', `class ${topics.map((t) => t.id).join(',')} topic`);
  const sections = topics.map((t) => [`## ${t.name} ${gpChip(t.items.length)}`, '', t.note ? `${t.note}.` : '', '', '| Id | Decision | Mentioned in | Source |', '|---|---|---|---|',
    ...t.items.map((d) => {
      const m = d.mentions;
      const firstFour = m.slice(0, 4).map((x) => `[${x.label}](#${x.id})`).join(' · ');
      const more = m.length > 4 ? ` <details class="more"><summary>${m.length - 4} more pages</summary>${m.slice(4).map((x) => `<a href="#${x.id}">${x.label}</a>`).join(' · ')}</details>` : '';
      const refinement = Array.from((d.detail || '').matchAll(/\b(?:Refined|Superseded) by [^.]+\./g), m => m[0]).join(' ');
      return `| ${d.id} | ${gpCell(d.title)}${refinement ? '<br>' + escapeHtml(refinement) : ''} | ${m.length ? `${gpChip(m.length)} ${firstFour}${more}` : 'No other page'} | <span class="nw">[Open source row](#${dec.pageId}.${d.id.toLowerCase()})</span> |`;
    }), ''].join('\n'));
  const md = [`The decisions ${range}, grouped by topic. Each id links to its row here and to the page that holds the full ruling; the pages that mention it come from a search of the spec. Source: [decision ledger](#${dec.pageId}).`,
    '', gpFence(flow.join('\n')), '', ...sections];
  return gpPage(data, 'decisions', 'Decision map', 'Decision map', md.join('\n'));
}

function buildGeneratedPages(data) {
  const out = [gpStart(data)];
  if (data.changes) out.push(gpChanges(data));
  if (data.chain) out.push(gpChain(data));
  if (data.amendments) out.push(gpAmendments(data));
  if (data.decisions) out.push(gpDecisions(data));
  out.push(gpPage(data, 'dossier', 'Full dossier', 'Full dossier', '', { kind: 'dossier' }));
  return out;
}

function showLintBanner(lint) {
  const el = $('#lint-banner');
  if (!lint || !lint.errors) { el.hidden = true; return; }
  const items = lint.problems.slice(0, 12).map((p) => `<li>${escapeHtml(p)}</li>`).join('');
  const more = lint.errors > 12 ? `<li>${lint.errors - 12} more problems. Run spec-lint to see them all.</li>` : '';
  el.innerHTML = `<details><summary>Rendered with ${lint.errors} lint problem(s) (--force). Do not treat this as a checkpoint.</summary><ul>${items}${more}</ul></details>`;
  el.hidden = false;
}

/* Full dossier: every page in tier order on one long page, for scanning and Ctrl+F. */
let dossierRun = 0;

function dossierPages() {
  const rank = (p) => state.data.tiers.findIndex((t) => t.id === p.tier);
  return state.order.audience.map((id) => state.pages[id]).filter((p) => !p.generated && p.layer !== 'readable').sort((a, b) => rank(a) - rank(b) || state.order.audience.indexOf(a.id) - state.order.audience.indexOf(b.id));
}

function dossierHeadings(page) {
  const hs = scanHeadings(page.md);
  if (!hs.length) return [];
  const min = Math.min(...hs.map((h) => h.level));
  return hs.filter((h) => h.level === min || h.level === min + 1).slice(0, 60);
}

function buildDossierToc(pages) {
  const toc = $('#toc');
  const frag = document.createDocumentFragment();
  let tierBlock = null;
  let ul = null;
  let lastTier = '';
  pages.forEach((p) => {
    if (p.tier !== lastTier) {
      lastTier = p.tier;
      tierBlock = document.createElement('details');
      tierBlock.className = 'toc-tier';
      tierBlock.open = false;
      const count = pages.filter((x) => x.tier === p.tier).length;
      tierBlock.innerHTML = `<summary>${escapeHtml(state.tiers[p.tier].name)} <span class="chip">${count}</span></summary>`;
      ul = document.createElement('ul');
      tierBlock.appendChild(ul);
      frag.appendChild(tierBlock);
    }
    const li = document.createElement('li');
    const hs = dossierHeadings(p);
    const d = document.createElement('details');
    d.className = 'toc-page-group';
    const s = document.createElement('summary');
    const a = document.createElement('a');
    a.className = 'toc-link page-link';
    a.href = hashOf('dossier', p.id);
    a.textContent = p.label;
    a.dataset.target = 'dos-' + p.id;
    s.appendChild(a);
    d.appendChild(s);
    if (hs.length) {
      const inner = document.createElement('ul');
      hs.forEach((h) => {
        const l = document.createElement('li');
        const x = document.createElement('a');
        x.className = 'toc-link lvl-2';
        x.href = hashOf('dossier', `${p.id}--${h.id}`);
        x.textContent = h.text;
        l.appendChild(x);
        inner.appendChild(l);
      });
      d.appendChild(inner);
    }
    li.appendChild(d);
    ul.appendChild(li);
  });
  toc.replaceChildren(frag);
  const det = document.createElement('details');
  det.className = 'toc-inline';
  det.id = 'toc-inline';
  det.innerHTML = `<summary>On this page <span class="chip">${pages.length}</span></summary>`;
  const copy = toc.cloneNode(true);
  copy.removeAttribute('id');
  det.appendChild(copy);
  $('.page-head').after(det);
  $('#toc-count').textContent = pages.length;
  $('#toc-count').hidden = false;
  spyHeads = [];
  spyLinks = [];
}

function renderDossier(prose, page, token) {
  const run = (dossierRun += 1);
  const pages = dossierPages();
  buildDossierToc(pages);
  const progress = document.createElement('p');
  progress.className = 'dossier-progress';
  progress.setAttribute('role', 'status');
  prose.before(progress);
  let i = 0;
  let lastTier = '';
  const chunk = () => {
    if (run !== dossierRun || state.current !== 'dossier') return;
    const end = Math.min(pages.length, i + 6);
    for (; i < end; i += 1) {
      const p = pages[i];
      if (p.tier !== lastTier) {
        lastTier = p.tier;
        const t = state.tiers[p.tier];
        const band = document.createElement('div');
        band.className = 'dossier-tier';
        band.innerHTML = `<h2>${escapeHtml(t.name)}</h2><span class="chip">${pages.filter((x) => x.tier === p.tier).length}</span><span class="chip tone-${statusToneOf(t.status)}">${escapeHtml(t.status)}</span><p>${escapeHtml(t.audience)}. ${escapeHtml(t.purpose)}</p>`;
        prose.appendChild(band);
      }
      const sec = document.createElement('section');
      sec.className = 'dossier-page';
      sec.id = 'dos-' + p.id;
      sec.innerHTML = `<header><h2 class="dossier-title" id="dos-${p.id}--title">${escapeHtml(p.title)}</h2>${metaLine(p)}<a class="dossier-open" href="${hashOf(p.id, '')}">Open this page on its own</a></header><div class="prose dossier-body"></div>`;
      const body = sec.querySelector('.dossier-body');
      body.innerHTML = renderMarkdown(p, `dos-${p.id}--`);
      prose.appendChild(sec);
      decorate(body, p, `dos-${p.id}--`);
      renderDiagrams(body);
    }
    progress.textContent = i < pages.length ? `Rendering pages: ${i} of ${pages.length}` : `${pages.length} pages rendered in tier order. Use the browser find command to search all of them.`;
    if (i < pages.length) setTimeout(chunk, 0);
    else if (token) scrollToToken(page, token);
  };
  chunk();
  bindDossierSpy();
}

const statusToneOf = (s) => (/done|locked|written|current|reviewed/i.test(s) ? 'ok' : /draft|progress|per wave/i.test(s) ? 'warn' : '');

let dossierSpyBound = false;
function bindDossierSpy() {
  if (dossierSpyBound) return;
  dossierSpyBound = true;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (state.current !== 'dossier' || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const line = $('#topbar').offsetHeight + 40;
      const secs = $$('.dossier-page');
      let cur = null;
      secs.forEach((s) => { if (s.getBoundingClientRect().top <= line) cur = s; });
      $$('#toc .page-link[aria-current]').forEach((a) => a.removeAttribute('aria-current'));
      if (!cur) return;
      const a = $(`#toc .page-link[data-target="${cur.id}"]`);
      if (!a) return;
      a.setAttribute('aria-current', 'true');
      const group = a.closest('details.toc-page-group');
      const tier = a.closest('details.toc-tier');
      if (tier && !tier.open) tier.open = true;
      if (group && !group.open) group.open = true;
    });
  }, { passive: true });
}

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

/* Shell: theme, page-tree visibility, keyboard, image zoom, start-up. */
const wide = window.matchMedia('(min-width: 1280px)');

function applyTheme(t) {
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  const dark = isDark();
  const b = $('#btn-theme');
  b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  b.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
  if (typeof syncThemeIcon === 'function') syncThemeIcon();
}

function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
  rerenderDiagramsForTheme();
}

function setPagesHidden(hidden) {
  $('#shell').classList.toggle('pages-hidden', hidden);
  store.set('pages-hidden', hidden ? '1' : '0');
  syncPagesToggle();
}

function syncPagesToggle() {
  const b = $('#btn-pages-show');
  const open = wide.matches ? !$('#shell').classList.contains('pages-hidden') : document.body.classList.contains('pages-open');
  b.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function openDrawer() {
  document.body.classList.add('pages-open');
  $('#scrim').hidden = false;
  syncPagesToggle();
  const cur = $('.tree-link[aria-current="page"]') || $('.tree-toggle');
  if (cur) cur.focus({ preventScroll: true });
}
function closeDrawer() {
  if (!document.body.classList.contains('pages-open')) return;
  document.body.classList.remove('pages-open');
  $('#scrim').hidden = true;
  syncPagesToggle();
}

function openLightbox(src, cap) {
  $('#lightbox-img').src = src;
  $('#lightbox-img').alt = cap || '';
  $('#lightbox-cap').textContent = cap || '';
  $('#lightbox').hidden = false;
  $('#btn-lightbox-close').focus();
}
const BLANK_IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const closeLightbox = () => { $('#lightbox').hidden = true; $('#lightbox-img').src = BLANK_IMG; };

function bindGlobalEvents() {
  document.addEventListener('click', (e) => {
    const t = e.target;
    const copy = t.closest('[data-copy-code]');
    if (copy) { copyText(copy.closest('.code-block').querySelector('code').textContent, 'Code copied'); return; }
    const anchor = t.closest('.anchor-btn');
    if (anchor) {
      const dos = state.current === 'dossier';
      const token = dos ? anchor.parentElement.id.replace(/^dos-/, '') : anchor.dataset.anchor;
      copyText(baseUrl() + hashOf(state.current, token), 'Link to section copied');
      return;
    }
    const img = t.closest('img[data-zoom]');
    if (img) { openLightbox(img.currentSrc || img.src, img.alt); return; }
    const png = t.closest('a[href$=".png"]');
    if (png) { e.preventDefault(); openLightbox(png.getAttribute('href'), png.title || png.textContent); return; }
    if (t.closest('#btn-top')) { e.preventDefault(); window.scrollTo({ top: 0 }); }
    if (t.closest('.toc-link') && !wide.matches) closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if ($('#search-layer').hidden) openSearch(); else closeSearch(); return; }
    if (e.key === 'Escape') {
      if (!$('#lightbox').hidden) closeLightbox();
      else closeDrawer();
    }
    const img = e.target.closest && e.target.closest('img[data-zoom]');
    if (img && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLightbox(img.currentSrc || img.src, img.alt); }
  });
  $('#lightbox').addEventListener('mousedown', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
  $('#btn-lightbox-close').addEventListener('click', closeLightbox);
  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#btn-pages-hide').addEventListener('click', () => { if (wide.matches) setPagesHidden(true); else closeDrawer(); });
  $('#btn-pages-show').addEventListener('click', () => { if (wide.matches) setPagesHidden(false); else openDrawer(); });
  $('#scrim').addEventListener('click', closeDrawer);
  $('#sel-group').addEventListener('change', (e) => changeView(e.target.value));
  $('#layer-switch').addEventListener('click', (e) => { const b = e.target.closest('[data-layer]'); if (b && b.dataset.layer !== state.layer) setLayer(b.dataset.layer); });
  $('#layer-switch').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = state.layer === 'readable' ? 'build' : 'readable';
    setLayer(next);
    requestAnimationFrame(() => $(`#layer-switch [data-layer="${next}"]`).focus());
  });
  window.addEventListener('hashchange', route);
  wide.addEventListener('change', () => { closeDrawer(); setPagesHidden(store.get('pages-hidden') === '1'); });
}

async function start() {
  if (window.mermaid) { window.mermaid.initialize({ startOnLoad: false }); }
  const saved = store.get('theme');
  applyTheme(saved === 'dark' || saved === 'light' ? saved : null);
  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $('#kbd-hint').textContent = '⌘ K';
  $('#article').innerHTML = '<p class="dossier-progress" role="status">Loading pages…</p>';
  try {
    indexData(await loadData());
  } catch (err) {
    $('#article').innerHTML = `<div class="not-found"><h1 class="page-title">Pages could not load</h1><p>${escapeHtml(err.message)}. Reload the page to try again.</p></div>`;
    return;
  }
  $('#brand-name').textContent = BRAND;
  $('#brand-spec').textContent = '/ ' + state.data.title;
  $('#brand').setAttribute('aria-label', BRAND + ' / ' + state.data.title + ', open the overview');
  showLintBanner(state.data.lint);
  if (state.data.changes && state.data.changes.items.length) { $('#recent-legend-text').textContent = changeLegend(); $('#recent-legend').hidden = false; }
  const v = store.get('view');
  state.view = v === 'audience' ? 'audience' : 'artifact';
  $('#sel-group').value = state.view;
  setPagesHidden(wide.matches && store.get('pages-hidden') === '1');
  $('#brand').setAttribute('href', '#' + defaultPageId());
  showTree();
  initSearch();
  bindGlobalEvents();
  bindCopyBox();
  bindTooltips();
  route();
  bootSkin();
  window.specReader = {
    state, diagramStats, route, runSearch, renderDiagrams, mermaidReady: () => !!window.mermaid, shellVersion: SHELL_VERSION, mode: MODE,
    renderAll: () => { $$('.diagram[data-mermaid]').forEach((d) => { if (d.dataset.done !== '1' && d.dataset.done !== 'error') queueRender(d); }); return mermaidChain; },
  };
}

/* Brand cube frames, generated by tools/reader/make-brand-frames.mjs. Data only; regenerate instead of hand-editing. */
const CUBE_FRAME_RATE = 60;
const CUBE_VIEW_BOX = '34 34 188 188';
const CUBE_FRAMES = [[[62.7,165.7,128,128,128,52.6,62.7,90.3],[62.7,165.7,128,128,193.3,165.7,128,203.4],[128,128,128,52.6,193.3,90.3,193.3,165.7],[128,203.4,193.3,165.7,193.3,90.3,128,128],[62.7,90.3,128,52.6,193.3,90.3,128,128],[62.7,165.7,62.7,90.3,128,128,128,203.4]],[[128,128,128,52.6,193.3,90.3,193.3,165.7],[62.7,165.7,128,128,193.3,165.7,128,203.4],[62.7,165.7,128,128,128,52.6,62.7,90.3],[128,203.4,193.3,165.7,193.3,90.3,128,128],[62.7,90.3,128,52.6,193.3,90.3,128,128],[62.7,165.7,62.7,90.3,128,128,128,203.4]],[[128,128,128,52.6,193.3,90.3,193.3,165.7],[62.7,165.7,128,128,193.3,165.7,128,203.4],[62.7,165.7,128,128,128,52.6,62.7,90.3],[128,203.4,193.3,165.7,193.3,90.3,128,128],[62.7,90.3,128,52.6,193.3,90.3,128,128],[62.7,165.7,62.7,90.3,128,128,128,203.4]],[[128,128,128,52.6,193.3,90.3,193.3,165.7],[62.7,165.7,128,128,193.3,165.7,128,203.4],[62.7,165.7,128,128,128,52.6,62.7,90.3],[128,203.4,193.3,165.7,193.3,90.3,128,128],[62.7,90.3,128,52.6,193.3,90.3,128,128],[62.7,165.7,62.7,90.3,128,128,128,203.4]],[[127.9,128,127.9,52.6,193.3,90.2,193.3,165.7],[62.7,165.8,127.9,128,193.3,165.7,128.1,203.4],[62.7,165.8,127.9,128,127.9,52.6,62.7,90.3],[128.1,203.4,193.3,165.7,193.3,90.2,128.1,128],[62.7,90.3,127.9,52.6,193.3,90.2,128.1,128],[62.7,165.8,62.7,90.3,128.1,128,128.1,203.4]],[[127.9,128,127.9,52.6,193.3,90.2,193.3,165.6],[62.7,165.8,127.9,128,193.3,165.6,128.1,203.4],[62.7,165.8,127.9,128,127.9,52.6,62.7,90.4],[128.1,203.4,193.3,165.6,193.3,90.2,128.1,128],[62.7,90.4,127.9,52.6,193.3,90.2,128.1,128],[62.7,165.8,62.7,90.4,128.1,128,128.1,203.4]],[[127.8,128,127.8,52.6,193.3,90.1,193.3,165.6],[62.7,165.9,127.8,128,193.3,165.6,128.2,203.4],[62.7,165.9,127.8,128,127.8,52.6,62.7,90.4],[128.2,203.4,193.3,165.6,193.3,90.1,128.2,128],[62.7,90.4,127.8,52.6,193.3,90.1,128.2,128],[62.7,165.9,62.7,90.4,128.2,128,128.2,203.4]],[[127.6,128,127.6,52.6,193.3,90.1,193.3,165.5],[62.7,165.9,127.6,128,193.3,165.5,128.4,203.4],[62.7,165.9,127.6,128,127.6,52.6,62.7,90.5],[128.4,203.4,193.3,165.5,193.3,90.1,128.4,128],[62.7,90.5,127.6,52.6,193.3,90.1,128.4,128],[62.7,165.9,62.7,90.5,128.4,128,128.4,203.4]],[[127.4,128,127.4,52.6,193.3,89.9,193.3,165.4],[62.7,166.1,127.4,128,193.3,165.4,128.6,203.4],[62.7,166.1,127.4,128,127.4,52.6,62.7,90.6],[128.6,203.4,193.3,165.4,193.3,89.9,128.6,128],[62.7,90.6,127.4,52.6,193.3,89.9,128.6,128],[62.7,166.1,62.7,90.6,128.6,128,128.6,203.4]],[[127.2,128,127.2,52.6,193.3,89.8,193.3,165.2],[62.7,166.2,127.2,128,193.3,165.2,128.8,203.4],[62.7,166.2,127.2,128,127.2,52.6,62.7,90.8],[128.8,203.4,193.3,165.2,193.3,89.8,128.8,128],[62.7,90.8,127.2,52.6,193.3,89.8,128.8,128],[62.7,166.2,62.7,90.8,128.8,128,128.8,203.4]],[[126.9,128,126.9,52.6,193.3,89.6,193.3,165.1],[62.7,166.4,126.9,128,193.3,165.1,129.1,203.4],[62.7,166.4,126.9,128,126.9,52.6,62.7,90.9],[129.1,203.4,193.3,165.1,193.3,89.6,129.1,128],[62.7,90.9,126.9,52.6,193.3,89.6,129.1,128],[62.7,166.4,62.7,90.9,129.1,128,129.1,203.4]],[[126.5,128,126.5,52.6,193.3,89.4,193.3,164.8],[62.7,166.6,126.5,128,193.3,164.8,129.5,203.4],[62.7,166.6,126.5,128,126.5,52.6,62.7,91.2],[129.5,203.4,193.3,164.8,193.3,89.4,129.5,128],[62.7,91.2,126.5,52.6,193.3,89.4,129.5,128],[62.7,166.6,62.7,91.2,129.5,128,129.5,203.4]],[[126,128,126,52.6,193.3,89.1,193.3,164.6],[62.7,166.9,126,128,193.3,164.6,130,203.4],[62.7,166.9,126,128,126,52.6,62.7,91.4],[130,203.4,193.3,164.6,193.3,89.1,130,128],[62.7,91.4,126,52.6,193.3,89.1,130,128],[62.7,166.9,62.7,91.4,130,128,130,203.4]],[[125.5,128,125.5,52.6,193.3,88.8,193.3,164.3],[62.7,167.2,125.5,128,193.3,164.3,130.5,203.4],[62.7,167.2,125.5,128,125.5,52.6,62.7,91.7],[130.5,203.4,193.3,164.3,193.3,88.8,130.5,128],[62.7,91.7,125.5,52.6,193.3,88.8,130.5,128],[62.7,167.2,62.7,91.7,130.5,128,130.5,203.4]],[[124.9,128,124.9,52.6,193.2,88.5,193.2,163.9],[62.8,167.5,124.9,128,193.2,163.9,131.1,203.4],[62.8,167.5,124.9,128,124.9,52.6,62.8,92.1],[131.1,203.4,193.2,163.9,193.2,88.5,131.1,128],[62.8,92.1,124.9,52.6,193.2,88.5,131.1,128],[62.8,167.5,62.8,92.1,131.1,128,131.1,203.4]],[[124.1,128.1,124.1,52.6,193.2,88.1,193.2,163.5],[62.8,167.9,124.1,128.1,193.2,163.5,131.9,203.4],[62.8,167.9,124.1,128.1,124.1,52.6,62.8,92.5],[131.9,203.4,193.2,163.5,193.2,88.1,131.9,127.9],[62.8,92.5,124.1,52.6,193.2,88.1,131.9,127.9],[62.8,167.9,62.8,92.5,131.9,127.9,131.9,203.4]],[[123.3,128.1,123.3,52.7,193.2,87.6,193.2,163],[62.8,168.4,123.3,128.1,193.2,163,132.7,203.3],[62.8,168.4,123.3,128.1,123.3,52.7,62.8,93],[132.7,203.3,193.2,163,193.2,87.6,132.7,127.9],[62.8,93,123.3,52.7,193.2,87.6,132.7,127.9],[62.8,168.4,62.8,93,132.7,127.9,132.7,203.3]],[[122.4,128.1,122.4,52.7,193.1,87,193.1,162.5],[62.9,169,122.4,128.1,193.1,162.5,133.6,203.3],[62.9,169,122.4,128.1,122.4,52.7,62.9,93.5],[133.6,203.3,193.1,162.5,193.1,87,133.6,127.9],[62.9,93.5,122.4,52.7,193.1,87,133.6,127.9],[62.9,169,62.9,93.5,133.6,127.9,133.6,203.3]],[[121.3,128.2,121.3,52.8,193,86.4,193,161.9],[63,169.6,121.3,128.2,193,161.9,134.7,203.2],[63,169.6,121.3,128.2,121.3,52.8,63,94.1],[134.7,203.2,193,161.9,193,86.4,134.7,127.8],[63,94.1,121.3,52.8,193,86.4,134.7,127.8],[63,169.6,63,94.1,134.7,127.8,134.7,203.2]],[[120.2,128.3,120.2,52.8,192.8,85.8,192.8,161.2],[63.2,170.2,120.2,128.3,192.8,161.2,135.8,203.2],[63.2,170.2,120.2,128.3,120.2,52.8,63.2,94.8],[135.8,203.2,192.8,161.2,192.8,85.8,135.8,127.7],[63.2,94.8,120.2,52.8,192.8,85.8,135.8,127.7],[63.2,170.2,63.2,94.8,135.8,127.7,135.8,203.2]],[[118.9,128.4,118.9,52.9,192.7,85,192.7,160.4],[63.3,171,118.9,128.4,192.7,160.4,137.1,203.1],[63.3,171,118.9,128.4,118.9,52.9,63.3,95.6],[137.1,203.1,192.7,160.4,192.7,85,137.1,127.6],[63.3,95.6,118.9,52.9,192.7,85,137.1,127.6],[63.3,171,63.3,95.6,137.1,127.6,137.1,203.1]],[[117.4,128.5,117.4,53.1,192.5,84.2,192.5,159.6],[63.5,171.8,117.4,128.5,192.5,159.6,138.6,202.9],[63.5,171.8,117.4,128.5,117.4,53.1,63.5,96.4],[138.6,202.9,192.5,159.6,192.5,84.2,138.6,127.5],[63.5,96.4,117.4,53.1,192.5,84.2,138.6,127.5],[63.5,171.8,63.5,96.4,138.6,127.5,138.6,202.9]],[[115.9,128.7,115.9,53.2,192.2,83.3,192.2,158.7],[63.8,172.7,115.9,128.7,192.2,158.7,140.1,202.8],[63.8,172.7,115.9,128.7,115.9,53.2,63.8,97.3],[140.1,202.8,192.2,158.7,192.2,83.3,140.1,127.3],[63.8,97.3,115.9,53.2,192.2,83.3,140.1,127.3],[63.8,172.7,63.8,97.3,140.1,127.3,140.1,202.8]],[[114.2,128.9,114.2,53.4,191.8,82.3,191.8,157.7],[64.2,173.7,114.2,128.9,191.8,157.7,141.8,202.6],[64.2,173.7,114.2,128.9,114.2,53.4,64.2,98.3],[141.8,202.6,191.8,157.7,191.8,82.3,141.8,127.1],[64.2,98.3,114.2,53.4,191.8,82.3,141.8,127.1],[64.2,173.7,64.2,98.3,141.8,127.1,141.8,202.6]],[[112.3,129.1,112.3,53.7,191.4,81.2,191.4,156.6],[64.6,174.8,112.3,129.1,191.4,156.6,143.7,202.3],[64.6,174.8,112.3,129.1,112.3,53.7,64.6,99.4],[143.7,202.3,191.4,156.6,191.4,81.2,143.7,126.9],[64.6,99.4,112.3,53.7,191.4,81.2,143.7,126.9],[64.6,174.8,64.6,99.4,143.7,126.9,143.7,202.3]],[[110.3,129.4,110.3,54,190.9,80.1,190.9,155.5],[65.1,175.9,110.3,129.4,190.9,155.5,145.7,202],[65.1,175.9,110.3,129.4,110.3,54,65.1,100.5],[145.7,202,190.9,155.5,190.9,80.1,145.7,126.6],[65.1,100.5,110.3,54,190.9,80.1,145.7,126.6],[65.1,175.9,65.1,100.5,145.7,126.6,145.7,202]],[[108.2,129.8,108.2,54.4,190.2,78.8,190.2,154.3],[65.8,177.2,108.2,129.8,190.2,154.3,147.8,201.6],[65.8,177.2,108.2,129.8,108.2,54.4,65.8,101.7],[147.8,201.6,190.2,154.3,190.2,78.8,147.8,126.2],[65.8,101.7,108.2,54.4,190.2,78.8,147.8,126.2],[65.8,177.2,65.8,101.7,147.8,126.2,147.8,201.6]],[[105.9,130.2,105.9,54.8,189.5,77.5,189.5,152.9],[66.5,178.5,105.9,130.2,189.5,152.9,150.1,201.2],[66.5,178.5,105.9,130.2,105.9,54.8,66.5,103.1],[150.1,201.2,189.5,152.9,189.5,77.5,150.1,125.8],[66.5,103.1,105.9,54.8,189.5,77.5,150.1,125.8],[66.5,178.5,66.5,103.1,150.1,125.8,150.1,201.2]],[[103.4,130.8,103.4,55.3,188.5,76.1,188.5,151.5],[67.5,179.9,103.4,130.8,188.5,151.5,152.6,200.7],[67.5,179.9,103.4,130.8,103.4,55.3,67.5,104.5],[152.6,200.7,188.5,151.5,188.5,76.1,152.6,125.2],[67.5,104.5,103.4,55.3,188.5,76.1,152.6,125.2],[67.5,179.9,67.5,104.5,152.6,125.2,152.6,200.7]],[[100.9,131.4,100.9,56,187.4,74.6,187.4,150.1],[68.6,181.4,100.9,131.4,187.4,150.1,155.1,200],[68.6,181.4,100.9,131.4,100.9,56,68.6,105.9],[155.1,200,187.4,150.1,187.4,74.6,155.1,124.6],[68.6,105.9,100.9,56,187.4,74.6,155.1,124.6],[68.6,181.4,68.6,105.9,155.1,124.6,155.1,200]],[[98.2,132.2,98.2,56.7,186.1,73.1,186.1,148.5],[69.9,182.9,98.2,132.2,186.1,148.5,157.8,199.3],[69.9,182.9,98.2,132.2,98.2,56.7,69.9,107.5],[157.8,199.3,186.1,148.5,186.1,73.1,157.8,123.8],[69.9,107.5,98.2,56.7,186.1,73.1,157.8,123.8],[69.9,182.9,69.9,107.5,157.8,123.8,157.8,199.3]],[[95.4,133,95.4,57.6,184.6,71.5,184.6,146.9],[71.4,184.5,95.4,133,184.6,146.9,160.6,198.4],[71.4,184.5,95.4,133,95.4,57.6,71.4,109.1],[160.6,198.4,184.6,146.9,184.6,71.5,160.6,123],[71.4,109.1,95.4,57.6,184.6,71.5,160.6,123],[71.4,184.5,71.4,109.1,160.6,123,160.6,198.4]],[[92.5,134.1,92.5,58.6,182.8,69.8,182.8,145.2],[73.2,186.2,92.5,134.1,182.8,145.2,163.5,197.4],[73.2,186.2,92.5,134.1,92.5,58.6,73.2,110.8],[163.5,197.4,182.8,145.2,182.8,69.8,163.5,121.9],[73.2,110.8,92.5,58.6,182.8,69.8,163.5,121.9],[73.2,186.2,73.2,110.8,163.5,121.9,163.5,197.4]],[[89.5,135.3,89.5,59.8,180.7,68,180.7,143.5],[75.3,188,89.5,135.3,180.7,143.5,166.5,196.2],[75.3,188,89.5,135.3,89.5,59.8,75.3,112.5],[166.5,196.2,180.7,143.5,180.7,68,166.5,120.7],[75.3,112.5,89.5,59.8,180.7,68,166.5,120.7],[75.3,188,75.3,112.5,166.5,120.7,166.5,196.2]],[[86.4,136.6,86.4,61.2,178.4,66.3,178.4,141.7],[77.6,189.7,86.4,136.6,178.4,141.7,169.6,194.8],[77.6,189.7,86.4,136.6,86.4,61.2,77.6,114.3],[169.6,194.8,178.4,141.7,178.4,66.3,169.6,119.4],[77.6,114.3,86.4,61.2,178.4,66.3,169.6,119.4],[77.6,189.7,77.6,114.3,169.6,119.4,169.6,194.8]],[[83.3,138.2,83.3,62.8,175.7,64.5,175.7,139.9],[80.3,191.5,83.3,138.2,175.7,139.9,172.7,193.2],[80.3,191.5,83.3,138.2,83.3,62.8,80.3,116.1],[172.7,193.2,175.7,139.9,175.7,64.5,172.7,117.8],[80.3,116.1,83.3,62.8,175.7,64.5,172.7,117.8],[80.3,191.5,80.3,116.1,172.7,117.8,172.7,193.2]],[[80.3,139.9,80.3,64.5,172.7,62.8,172.7,138.2],[83.3,193.2,80.3,139.9,172.7,138.2,175.7,191.5],[175.7,191.5,172.7,138.2,172.7,62.8,175.7,116.1],[83.3,193.2,80.3,139.9,80.3,64.5,83.3,117.8],[83.3,117.8,80.3,64.5,172.7,62.8,175.7,116.1],[83.3,193.2,83.3,117.8,175.7,116.1,175.7,191.5]],[[77.6,141.7,77.6,66.3,169.6,61.2,169.6,136.6],[86.4,194.8,77.6,141.7,169.6,136.6,178.4,189.7],[178.4,189.7,169.6,136.6,169.6,61.2,178.4,114.3],[86.4,194.8,77.6,141.7,77.6,66.3,86.4,119.4],[86.4,119.4,77.6,66.3,169.6,61.2,178.4,114.3],[86.4,194.8,86.4,119.4,178.4,114.3,178.4,189.7]],[[75.3,143.5,75.3,68,166.5,59.8,166.5,135.3],[89.5,196.2,75.3,143.5,166.5,135.3,180.7,188],[180.7,188,166.5,135.3,166.5,59.8,180.7,112.5],[89.5,196.2,75.3,143.5,75.3,68,89.5,120.7],[89.5,120.7,75.3,68,166.5,59.8,180.7,112.5],[89.5,196.2,89.5,120.7,180.7,112.5,180.7,188]],[[73.2,145.2,73.2,69.8,163.5,58.6,163.5,134.1],[92.5,197.4,73.2,145.2,163.5,134.1,182.8,186.2],[182.8,186.2,163.5,134.1,163.5,58.6,182.8,110.8],[92.5,197.4,73.2,145.2,73.2,69.8,92.5,121.9],[92.5,121.9,73.2,69.8,163.5,58.6,182.8,110.8],[92.5,197.4,92.5,121.9,182.8,110.8,182.8,186.2]],[[71.4,146.9,71.4,71.5,160.6,57.6,160.6,133],[95.4,198.4,71.4,146.9,160.6,133,184.6,184.5],[184.6,184.5,160.6,133,160.6,57.6,184.6,109.1],[95.4,198.4,71.4,146.9,71.4,71.5,95.4,123],[95.4,123,71.4,71.5,160.6,57.6,184.6,109.1],[95.4,198.4,95.4,123,184.6,109.1,184.6,184.5]],[[69.9,148.5,69.9,73.1,157.8,56.7,157.8,132.2],[98.2,199.3,69.9,148.5,157.8,132.2,186.1,182.9],[186.1,182.9,157.8,132.2,157.8,56.7,186.1,107.5],[98.2,199.3,69.9,148.5,69.9,73.1,98.2,123.8],[98.2,123.8,69.9,73.1,157.8,56.7,186.1,107.5],[98.2,199.3,98.2,123.8,186.1,107.5,186.1,182.9]],[[68.6,150.1,68.6,74.6,155.1,56,155.1,131.4],[100.9,200,68.6,150.1,155.1,131.4,187.4,181.4],[187.4,181.4,155.1,131.4,155.1,56,187.4,105.9],[100.9,200,68.6,150.1,68.6,74.6,100.9,124.6],[100.9,124.6,68.6,74.6,155.1,56,187.4,105.9],[100.9,200,100.9,124.6,187.4,105.9,187.4,181.4]],[[67.5,151.5,67.5,76.1,152.6,55.3,152.6,130.8],[103.4,200.7,67.5,151.5,152.6,130.8,188.5,179.9],[188.5,179.9,152.6,130.8,152.6,55.3,188.5,104.5],[103.4,200.7,67.5,151.5,67.5,76.1,103.4,125.2],[103.4,125.2,67.5,76.1,152.6,55.3,188.5,104.5],[103.4,200.7,103.4,125.2,188.5,104.5,188.5,179.9]],[[66.5,152.9,66.5,77.5,150.1,54.8,150.1,130.2],[105.9,201.2,66.5,152.9,150.1,130.2,189.5,178.5],[189.5,178.5,150.1,130.2,150.1,54.8,189.5,103.1],[105.9,201.2,66.5,152.9,66.5,77.5,105.9,125.8],[105.9,125.8,66.5,77.5,150.1,54.8,189.5,103.1],[105.9,201.2,105.9,125.8,189.5,103.1,189.5,178.5]],[[65.8,154.3,65.8,78.8,147.8,54.4,147.8,129.8],[108.2,201.6,65.8,154.3,147.8,129.8,190.2,177.2],[190.2,177.2,147.8,129.8,147.8,54.4,190.2,101.7],[108.2,201.6,65.8,154.3,65.8,78.8,108.2,126.2],[108.2,126.2,65.8,78.8,147.8,54.4,190.2,101.7],[108.2,201.6,108.2,126.2,190.2,101.7,190.2,177.2]],[[65.1,155.5,65.1,80.1,145.7,54,145.7,129.4],[110.3,202,65.1,155.5,145.7,129.4,190.9,175.9],[190.9,175.9,145.7,129.4,145.7,54,190.9,100.5],[110.3,202,65.1,155.5,65.1,80.1,110.3,126.6],[110.3,126.6,65.1,80.1,145.7,54,190.9,100.5],[110.3,202,110.3,126.6,190.9,100.5,190.9,175.9]],[[64.6,156.6,64.6,81.2,143.7,53.7,143.7,129.1],[112.3,202.3,64.6,156.6,143.7,129.1,191.4,174.8],[191.4,174.8,143.7,129.1,143.7,53.7,191.4,99.4],[112.3,202.3,64.6,156.6,64.6,81.2,112.3,126.9],[112.3,126.9,64.6,81.2,143.7,53.7,191.4,99.4],[112.3,202.3,112.3,126.9,191.4,99.4,191.4,174.8]],[[64.2,157.7,64.2,82.3,141.8,53.4,141.8,128.9],[114.2,202.6,64.2,157.7,141.8,128.9,191.8,173.7],[191.8,173.7,141.8,128.9,141.8,53.4,191.8,98.3],[114.2,202.6,64.2,157.7,64.2,82.3,114.2,127.1],[114.2,127.1,64.2,82.3,141.8,53.4,191.8,98.3],[114.2,202.6,114.2,127.1,191.8,98.3,191.8,173.7]],[[63.8,158.7,63.8,83.3,140.1,53.2,140.1,128.7],[115.9,202.8,63.8,158.7,140.1,128.7,192.2,172.7],[192.2,172.7,140.1,128.7,140.1,53.2,192.2,97.3],[115.9,202.8,63.8,158.7,63.8,83.3,115.9,127.3],[115.9,127.3,63.8,83.3,140.1,53.2,192.2,97.3],[115.9,202.8,115.9,127.3,192.2,97.3,192.2,172.7]],[[63.5,159.6,63.5,84.2,138.6,53.1,138.6,128.5],[117.4,202.9,63.5,159.6,138.6,128.5,192.5,171.8],[192.5,171.8,138.6,128.5,138.6,53.1,192.5,96.4],[117.4,202.9,63.5,159.6,63.5,84.2,117.4,127.5],[117.4,127.5,63.5,84.2,138.6,53.1,192.5,96.4],[117.4,202.9,117.4,127.5,192.5,96.4,192.5,171.8]],[[63.3,160.4,63.3,85,137.1,52.9,137.1,128.4],[118.9,203.1,63.3,160.4,137.1,128.4,192.7,171],[192.7,171,137.1,128.4,137.1,52.9,192.7,95.6],[118.9,203.1,63.3,160.4,63.3,85,118.9,127.6],[118.9,127.6,63.3,85,137.1,52.9,192.7,95.6],[118.9,203.1,118.9,127.6,192.7,95.6,192.7,171]],[[63.2,161.2,63.2,85.8,135.8,52.8,135.8,128.3],[120.2,203.2,63.2,161.2,135.8,128.3,192.8,170.2],[192.8,170.2,135.8,128.3,135.8,52.8,192.8,94.8],[120.2,203.2,63.2,161.2,63.2,85.8,120.2,127.7],[120.2,127.7,63.2,85.8,135.8,52.8,192.8,94.8],[120.2,203.2,120.2,127.7,192.8,94.8,192.8,170.2]],[[63,161.9,63,86.4,134.7,52.8,134.7,128.2],[121.3,203.2,63,161.9,134.7,128.2,193,169.6],[193,169.6,134.7,128.2,134.7,52.8,193,94.1],[121.3,203.2,63,161.9,63,86.4,121.3,127.8],[121.3,127.8,63,86.4,134.7,52.8,193,94.1],[121.3,203.2,121.3,127.8,193,94.1,193,169.6]],[[62.9,162.5,62.9,87,133.6,52.7,133.6,128.1],[122.4,203.3,62.9,162.5,133.6,128.1,193.1,169],[193.1,169,133.6,128.1,133.6,52.7,193.1,93.5],[122.4,203.3,62.9,162.5,62.9,87,122.4,127.9],[122.4,127.9,62.9,87,133.6,52.7,193.1,93.5],[122.4,203.3,122.4,127.9,193.1,93.5,193.1,169]],[[62.8,163,62.8,87.6,132.7,52.7,132.7,128.1],[123.3,203.3,62.8,163,132.7,128.1,193.2,168.4],[193.2,168.4,132.7,128.1,132.7,52.7,193.2,93],[123.3,203.3,62.8,163,62.8,87.6,123.3,127.9],[123.3,127.9,62.8,87.6,132.7,52.7,193.2,93],[123.3,203.3,123.3,127.9,193.2,93,193.2,168.4]],[[62.8,163.5,62.8,88.1,131.9,52.6,131.9,128.1],[124.1,203.4,62.8,163.5,131.9,128.1,193.2,167.9],[193.2,167.9,131.9,128.1,131.9,52.6,193.2,92.5],[124.1,203.4,62.8,163.5,62.8,88.1,124.1,127.9],[124.1,127.9,62.8,88.1,131.9,52.6,193.2,92.5],[124.1,203.4,124.1,127.9,193.2,92.5,193.2,167.9]],[[62.8,163.9,62.8,88.5,131.1,52.6,131.1,128],[124.9,203.4,62.8,163.9,131.1,128,193.2,167.5],[193.2,167.5,131.1,128,131.1,52.6,193.2,92.1],[124.9,203.4,62.8,163.9,62.8,88.5,124.9,128],[124.9,128,62.8,88.5,131.1,52.6,193.2,92.1],[124.9,203.4,124.9,128,193.2,92.1,193.2,167.5]],[[62.7,164.3,62.7,88.8,130.5,52.6,130.5,128],[125.5,203.4,62.7,164.3,130.5,128,193.3,167.2],[193.3,167.2,130.5,128,130.5,52.6,193.3,91.7],[125.5,203.4,62.7,164.3,62.7,88.8,125.5,128],[125.5,128,62.7,88.8,130.5,52.6,193.3,91.7],[125.5,203.4,125.5,128,193.3,91.7,193.3,167.2]],[[62.7,164.6,62.7,89.1,130,52.6,130,128],[126,203.4,62.7,164.6,130,128,193.3,166.9],[193.3,166.9,130,128,130,52.6,193.3,91.4],[126,203.4,62.7,164.6,62.7,89.1,126,128],[126,128,62.7,89.1,130,52.6,193.3,91.4],[126,203.4,126,128,193.3,91.4,193.3,166.9]],[[62.7,164.8,62.7,89.4,129.5,52.6,129.5,128],[126.5,203.4,62.7,164.8,129.5,128,193.3,166.6],[193.3,166.6,129.5,128,129.5,52.6,193.3,91.2],[126.5,203.4,62.7,164.8,62.7,89.4,126.5,128],[126.5,128,62.7,89.4,129.5,52.6,193.3,91.2],[126.5,203.4,126.5,128,193.3,91.2,193.3,166.6]],[[62.7,165.1,62.7,89.6,129.1,52.6,129.1,128],[126.9,203.4,62.7,165.1,129.1,128,193.3,166.4],[193.3,166.4,129.1,128,129.1,52.6,193.3,90.9],[126.9,203.4,62.7,165.1,62.7,89.6,126.9,128],[126.9,128,62.7,89.6,129.1,52.6,193.3,90.9],[126.9,203.4,126.9,128,193.3,90.9,193.3,166.4]],[[62.7,165.2,62.7,89.8,128.8,52.6,128.8,128],[127.2,203.4,62.7,165.2,128.8,128,193.3,166.2],[193.3,166.2,128.8,128,128.8,52.6,193.3,90.8],[127.2,203.4,62.7,165.2,62.7,89.8,127.2,128],[127.2,128,62.7,89.8,128.8,52.6,193.3,90.8],[127.2,203.4,127.2,128,193.3,90.8,193.3,166.2]],[[62.7,165.4,62.7,89.9,128.6,52.6,128.6,128],[127.4,203.4,62.7,165.4,128.6,128,193.3,166.1],[193.3,166.1,128.6,128,128.6,52.6,193.3,90.6],[127.4,203.4,62.7,165.4,62.7,89.9,127.4,128],[127.4,128,62.7,89.9,128.6,52.6,193.3,90.6],[127.4,203.4,127.4,128,193.3,90.6,193.3,166.1]],[[62.7,165.5,62.7,90.1,128.4,52.6,128.4,128],[127.6,203.4,62.7,165.5,128.4,128,193.3,165.9],[193.3,165.9,128.4,128,128.4,52.6,193.3,90.5],[127.6,203.4,62.7,165.5,62.7,90.1,127.6,128],[127.6,128,62.7,90.1,128.4,52.6,193.3,90.5],[127.6,203.4,127.6,128,193.3,90.5,193.3,165.9]],[[62.7,165.6,62.7,90.1,128.2,52.6,128.2,128],[127.8,203.4,62.7,165.6,128.2,128,193.3,165.9],[193.3,165.9,128.2,128,128.2,52.6,193.3,90.4],[127.8,203.4,62.7,165.6,62.7,90.1,127.8,128],[127.8,128,62.7,90.1,128.2,52.6,193.3,90.4],[127.8,203.4,127.8,128,193.3,90.4,193.3,165.9]],[[62.7,165.6,62.7,90.2,128.1,52.6,128.1,128],[127.9,203.4,62.7,165.6,128.1,128,193.3,165.8],[193.3,165.8,128.1,128,128.1,52.6,193.3,90.4],[127.9,203.4,62.7,165.6,62.7,90.2,127.9,128],[127.9,128,62.7,90.2,128.1,52.6,193.3,90.4],[127.9,203.4,127.9,128,193.3,90.4,193.3,165.8]],[[62.7,165.7,62.7,90.2,128.1,52.6,128.1,128],[127.9,203.4,62.7,165.7,128.1,128,193.3,165.8],[193.3,165.8,128.1,128,128.1,52.6,193.3,90.3],[127.9,203.4,62.7,165.7,62.7,90.2,127.9,128],[127.9,128,62.7,90.2,128.1,52.6,193.3,90.3],[127.9,203.4,127.9,128,193.3,90.3,193.3,165.8]],[[62.7,165.7,62.7,90.3,128,52.6,128,128],[128,203.4,62.7,165.7,128,128,193.3,165.7],[193.3,165.7,128,128,128,52.6,193.3,90.3],[128,203.4,62.7,165.7,62.7,90.3,128,128],[128,128,62.7,90.3,128,52.6,193.3,90.3],[128,203.4,128,128,193.3,90.3,193.3,165.7]],[[62.7,165.7,62.7,90.3,128,52.6,128,128],[128,203.4,62.7,165.7,128,128,193.3,165.7],[193.3,165.7,128,128,128,52.6,193.3,90.3],[128,203.4,62.7,165.7,62.7,90.3,128,128],[128,128,62.7,90.3,128,52.6,193.3,90.3],[128,203.4,128,128,193.3,90.3,193.3,165.7]],[[62.7,165.7,62.7,90.3,128,52.6,128,128],[128,203.4,62.7,165.7,128,128,193.3,165.7],[193.3,165.7,128,128,128,52.6,193.3,90.3],[128,203.4,62.7,165.7,62.7,90.3,128,128],[128,128,62.7,90.3,128,52.6,193.3,90.3],[128,203.4,128,128,193.3,90.3,193.3,165.7]],[[193.3,165.7,128,128,128,52.6,193.3,90.3],[128,203.4,62.7,165.7,128,128,193.3,165.7],[62.7,165.7,62.7,90.3,128,52.6,128,128],[128,203.4,62.7,165.7,62.7,90.3,128,128],[128,128,62.7,90.3,128,52.6,193.3,90.3],[128,203.4,128,128,193.3,90.3,193.3,165.7]]];

/* Lucide icon data used by the standard reader skin (D15), ISC license (see LICENSE-lucide.txt next to the shell).
   Source: lucide-react 1.48.0 icon nodes as bundled in the Public Docs reader skin; the sun icon is the Lucide "sun" shape. */
const SKIN_ICONS = {"search":[["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],"moon":[["path",{"d":"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]],"menu":[["path",{"d":"M4 5h16"}],["path",{"d":"M4 12h16"}],["path",{"d":"M4 19h16"}]],"chevron-right":[["path",{"d":"m9 18 6-6-6-6"}]],"link":[["path",{"d":"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"}],["path",{"d":"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"}]],"sparkles":[["path",{"d":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{"d":"M20 2v4"}],["path",{"d":"M22 4h-4"}],["circle",{"cx":"4","cy":"20","r":"2"}]],"file-text":[["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"M10 9H8"}],["path",{"d":"M16 13H8"}],["path",{"d":"M16 17H8"}]],"sun":[["circle",{"cx":"12","cy":"12","r":"4"}],["path",{"d":"M12 2v2"}],["path",{"d":"M12 20v2"}],["path",{"d":"m4.93 4.93 1.41 1.41"}],["path",{"d":"m17.66 17.66 1.41 1.41"}],["path",{"d":"M2 12h2"}],["path",{"d":"M20 12h2"}],["path",{"d":"m6.34 17.66-1.41 1.41"}],["path",{"d":"m19.07 4.93-1.41 1.41"}]]};

/* Standard skin: the brand cube. Baked frames drawn as SVG paths by one requestAnimationFrame loop that exists only while it plays.
   Reduced motion keeps frame 0 static. Fill and stroke come from CSS (.brand-mark). */
const SVG_NS = 'http://www.w3.org/2000/svg';
const CUBE_LAST = CUBE_FRAMES.length - 1;
const cubeOutline = (f) => `M${f[0]},${f[1]}L${f[2]},${f[3]}L${f[4]},${f[5]}L${f[6]},${f[7]}Z`;

function mountCubePlayer(host) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', CUBE_VIEW_BOX);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const paths = CUBE_FRAMES[0].flatMap(() => {
    const fill = svg.appendChild(document.createElementNS(SVG_NS, 'path'));
    const edge = svg.appendChild(document.createElementNS(SVG_NS, 'path'));
    edge.setAttribute('fill-opacity', '0');
    return [fill, edge];
  });
  const draw = (n) => CUBE_FRAMES[n].forEach((face, i) => { const d = cubeOutline(face); paths[2 * i].setAttribute('d', d); paths[2 * i + 1].setAttribute('d', d); });
  draw(0);
  host.appendChild(svg);
  let raf = 0, startedAt = 0, elapsed = 0, playing = false;
  const tick = (now) => {
    elapsed = Math.max(0, now - startedAt);
    const n = Math.min(CUBE_LAST, Math.floor((elapsed * CUBE_FRAME_RATE) / 1000));
    draw(n);
    if (n === CUBE_LAST) { playing = false; return; }
    raf = requestAnimationFrame(tick);
  };
  const run = (from) => { playing = true; startedAt = performance.now() - from; raf = requestAnimationFrame(tick); };
  return {
    play: () => { cancelAnimationFrame(raf); run(0); },
    pause: () => { if (playing) { cancelAnimationFrame(raf); playing = false; } },
    resume: () => { if (!playing && elapsed > 0 && elapsed < (CUBE_LAST * 1000) / CUBE_FRAME_RATE) run(elapsed); },
    isPlaying: () => playing,
    destroy: () => { cancelAnimationFrame(raf); playing = false; svg.remove(); },
  };
}

function mountBrand() {
  const host = $('.brand-mark');
  if (!host) return;
  host.replaceChildren();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let player = mountCubePlayer(host);
  const sync = () => { host.dataset.brandCube = motion.matches ? 'static' : 'animated'; };
  sync();
  if (!motion.matches) player.play();
  $('#brand').addEventListener('mouseenter', () => { if (!motion.matches && !player.isPlaying()) player.play(); });
  let wasPlaying = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { wasPlaying = player.isPlaying(); player.pause(); } else if (wasPlaying) { wasPlaying = false; player.resume(); }
  });
  motion.addEventListener('change', () => { player.destroy(); player = mountCubePlayer(host); sync(); if (!motion.matches) player.play(); });
}

/* Standard skin: local Lucide icons replace the placeholder glyphs of the native controls. Icons supplement names, never replace them. */
function fillIcon(svg, name) {
  const nodes = SKIN_ICONS[name];
  if (!nodes) return;
  svg.replaceChildren(...nodes.map(([tag, attrs]) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  }));
  svg.dataset.icon = name;
}

function installIcons() {
  $$('.tree-link:not(:has(.reader-leaf-icon))').forEach((leaf) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('ico', 'reader-leaf-icon');
    leaf.prepend(svg);
  });
  $$('svg.ico:not([data-icon])').forEach((svg) => {
    const name = svg.matches('.reader-leaf-icon') ? 'file-text' : svg.matches('.chev') ? 'chevron-right' : svg.closest('.anchor-btn') ? 'link'
      : svg.closest('.change-chip') ? 'sparkles' : svg.closest('#btn-theme') ? (isDark() ? 'sun' : 'moon')
      : svg.closest('#btn-pages-show') ? 'menu' : svg.closest('.search-field, #btn-search') ? 'search' : '';
    if (name) fillIcon(svg, name);
  });
}

function syncThemeIcon() {
  const svg = $('#btn-theme svg');
  if (svg) fillIcon(svg, isDark() ? 'sun' : 'moon');
}

/* Standard skin: overlay floor for search, the page drawer and the image preview. An open overlay makes the background inert, locks
   scrolling, contains Tab and Shift+Tab, and returns focus to the opener (or the search button) on close. Native routing stays in charge. */
const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]';
const isVisibleFocus = (el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert],[hidden]') && el.getClientRects().length > 0 && !['hidden', 'collapse'].includes(getComputedStyle(el).visibility);

function installOverlayFloors() {
  const search = $('#search-layer'), drawer = $('#pages-card'), lightbox = $('#lightbox');
  let active = null, opener = null, release = () => {};
  const candidates = () => [...(active ? active.querySelectorAll(FOCUSABLE) : [])].filter(isVisibleFocus);
  const current = () => (!lightbox.hidden ? lightbox : !search.hidden ? search : document.body.classList.contains('pages-open') ? drawer : null);
  const first = () => candidates()[0] || active;
  const restore = () => { const target = opener && opener.isConnected && isVisibleFocus(opener) ? opener : $('#btn-search'); if (target) target.focus({ preventScroll: true }); };
  const sync = () => {
    const next = current();
    if (next === active) return;
    const previous = active;
    release(); release = () => {}; active = next;
    if (!next) { if (previous) restore(); return; }
    const inerted = [];
    let branch = next;
    while (branch.parentElement) {
      for (const sibling of [...branch.parentElement.children]) {
        if (sibling !== branch && sibling.id !== 'scrim' && !sibling.inert) { sibling.inert = true; inerted.push(sibling); }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const role = next.getAttribute('role'), modal = next.getAttribute('aria-modal');
    if (next === drawer) { next.setAttribute('role', 'dialog'); next.setAttribute('aria-modal', 'true'); }
    release = () => {
      inerted.forEach((el) => { el.inert = false; });
      document.body.style.overflow = overflow;
      if (next === drawer) {
        if (role === null) next.removeAttribute('role'); else next.setAttribute('role', role);
        if (modal === null) next.removeAttribute('aria-modal'); else next.setAttribute('aria-modal', modal);
      }
    };
    if (!next.contains(document.activeElement)) { const f = first(); if (f) f.focus({ preventScroll: true }); }
  };
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#btn-search,#btn-pages-show,img[data-zoom],a[href$=".png"]')) opener = e.target.closest('button,a,img');
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && search.hidden) opener = document.activeElement;
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('#btn-search,#btn-pages-show')) opener = e.target;
    sync();
    if (!active || e.key !== 'Tab') return;
    const items = candidates(), at = items.indexOf(document.activeElement);
    if (at < 0 || (e.shiftKey && at === 0) || (!e.shiftKey && at === items.length - 1)) {
      e.preventDefault(); e.stopPropagation();
      const target = e.shiftKey ? items[items.length - 1] : items[0];
      if (target) target.focus({ preventScroll: true });
    }
  }, true);
  document.addEventListener('focusin', () => {
    sync();
    if (active && !active.contains(document.activeElement)) { const f = first(); if (f) f.focus({ preventScroll: true }); }
  });
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  [search, lightbox].forEach((el) => observer.observe(el, { attributes: true, attributeFilter: ['hidden'] }));
  sync();
}

/* Standard skin: a short cross-fade between pages through the View Transition API when the browser has it. The router decides the
   destination; the skin only wraps the same route callback. Reduced motion routes directly. */
function installNavigationMotion() {
  if (!document.startViewTransition) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pending;
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', () => {
    if (pending) pending.skipTransition();
    if (reduced.matches) { route(); return; }
    pending = document.startViewTransition(() => route());
    pending.ready.catch((error) => { if (error.name !== 'AbortError') console.error(error); });
    pending.finished.catch((error) => { if (error.name !== 'AbortError') console.error(error); });
  });
  document.documentElement.dataset.readerNavigationMotion = 'ready';
}

/* Standard skin: adapters over the native DOM. Nothing here edits content, ids, data or routes. */
let epicExpanded = false;

/* Nests per-epic tree groups under one "Epics and stories" wrapper when a parent holds at least two of them. */
function groupEpicNavigation() {
  const tree = $('#tree');
  if (!tree) return;
  let parent = tree.querySelector('[data-reader-epic-group]');
  if (!parent) {
    const epics = $$('.tree-sub', tree).filter((n) => /^(?:EP-\d+|E\d+)\b/.test(((n.querySelector(':scope > button .tree-label') || {}).textContent) || ''));
    if (epics.length < 2 || !epics.every((n) => n.parentElement === epics[0].parentElement)) return;
    parent = document.createElement('li');
    parent.className = 'tree-sub';
    parent.dataset.readerEpicGroup = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tree-toggle';
    const icon = epics[0].querySelector(':scope > button .chev');
    if (icon) button.append(icon.cloneNode(true));
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = 'Epics and stories';
    const count = document.createElement('span');
    count.className = 'chip';
    count.textContent = String(epics.length);
    button.append(label, count);
    const children = document.createElement('ul');
    children.className = 'tree-children';
    parent.append(button, children);
    epics[0].before(parent);
    epics.forEach((n) => children.append(n));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      epicExpanded = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(epicExpanded));
      children.hidden = !epicExpanded;
    });
  }
  const current = parent.querySelector('.tree-link[aria-current="page"]');
  if (current) epicExpanded = true;
  parent.querySelector(':scope > button').setAttribute('aria-expanded', String(epicExpanded));
  const children = parent.querySelector(':scope > ul');
  if (children) children.hidden = !epicExpanded;
}

/* The native "Group pages by" select stays as the backbone; buttons drive it. */
function mountGrouping() {
  const select = $('#sel-group');
  if (!select || $('.reader-group')) return;
  select.classList.add('reader-native-backbone');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  const group = document.createElement('div');
  group.className = 'reader-group';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Group pages by');
  const buttons = [...select.options].map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = option.text;
    button.addEventListener('click', () => { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); sync(); });
    group.appendChild(button);
    return { button, value: option.value };
  });
  const sync = () => buttons.forEach(({ button, value }) => button.setAttribute('aria-pressed', String(select.value === value)));
  select.addEventListener('change', sync);
  window.addEventListener('hashchange', sync);
  select.after(group);
  sync();
}

/* Role switch: one row of links to the generated role views, kept in the page drawer on narrow screens. */
const ROLE_NAV = [['po-view', 'PO'], ['dev-view', 'Dev'], ['qa-view', 'QA'], ['open-items', 'Open items']];
function mountRoleNav() {
  const host = $('#role-row');
  if (!host) return;
  const links = ROLE_NAV.filter(([id]) => state.pages[id]);
  host.hidden = !links.length;
  host.querySelector('.role-nav').replaceChildren(...links.map(([id, text]) => {
    const a = document.createElement('a');
    a.className = 'btn role-link';
    a.href = hashOf(id, '');
    a.dataset.page = id;
    a.textContent = text;
    a.addEventListener('click', closeDrawer);
    return a;
  }));
  syncRoleNav();
}
/* Below 1280 the page tree is a drawer, so the role switch is repeated under the page header: a role page never strands its reader. */
function mountInlineRoleNav() {
  const cur = state.pages[state.current];
  const head = $('.page-head');
  const old = $('#role-inline');
  if (!cur || cur.kind !== 'view' || !head) { if (old) old.remove(); return; }
  if (old && old.dataset.page === state.current) return;
  if (old) old.remove();
  const nav = document.createElement('nav');
  nav.id = 'role-inline'; nav.className = 'role-inline'; nav.dataset.page = state.current; nav.setAttribute('aria-label', 'Role views');
  ROLE_NAV.filter(([id]) => state.pages[id]).forEach(([id, text]) => {
    const a = document.createElement('a'); a.className = 'btn role-link'; a.href = hashOf(id, ''); a.dataset.page = id; a.textContent = text; nav.appendChild(a);
  });
  head.after(nav);
}
function syncRoleNav() {
  mountInlineRoleNav();
  const cur = state.current || '';
  const active = cur.startsWith('dev-') && state.pages[cur] && state.pages[cur].kind === 'view' ? 'dev-view' : cur;
  $$('.role-link').forEach((a) => { if (a.dataset.page === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}

function adaptArticle() {
  groupEpicNavigation();
  $$('.change-chip').forEach((m) => { if (m.textContent !== '*') m.replaceChildren('*'); });
  installIcons();
  syncRoleNav();
  fitStackTables();
  $$('.table-wrap').forEach((box) => {
    if (box.scrollWidth > box.clientWidth + 1) {
      box.setAttribute('tabindex', '0');
      if (!box.previousElementSibling || !box.previousElementSibling.matches('.reader-table-hint')) {
        const hint = document.createElement('span');
        hint.className = 'reader-table-hint';
        hint.textContent = 'Scroll table horizontally';
        box.before(hint);
      }
    }
  });
  // A diagram wider than its column scrolls inside its own box: name the region and say so.
  $$('.diagram[data-done="1"]').forEach((box) => {
    if (box.scrollWidth > box.clientWidth + 1) {
      box.setAttribute('tabindex', '0');
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', 'Diagram. Scroll horizontally to see all of it.');
      if (!box.previousElementSibling || !box.previousElementSibling.matches('.reader-table-hint')) {
        const hint = document.createElement('span');
        hint.className = 'reader-table-hint';
        hint.textContent = 'Scroll diagram horizontally';
        box.before(hint);
      }
    }
  });
  // A native browser tooltip over a styled control is replaced by an accessible name.
  $$('[title]').forEach((el) => {
    if (el.getAttribute('aria-label') || el.matches('button,.tree-link,.tree-toggle')) {
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.title);
      el.removeAttribute('title');
    }
  });
}

/* The fixed page tree starts where the top bar ends, also while the forced-render banner pushes the bar down. */
function syncTopbarEdge() {
  const bar = $('#topbar');
  document.documentElement.style.setProperty('--topbar-bottom', Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) + 'px');
}

function bootSkin() {
  syncTopbarEdge();
  window.addEventListener('scroll', () => requestAnimationFrame(syncTopbarEdge), { passive: true });
  window.addEventListener('resize', syncTopbarEdge);
  mountBrand();
  mountGrouping();
  mountRoleNav();
  installNavigationMotion();
  installOverlayFloors();
  adaptArticle();
  $('#search-input').setAttribute('aria-label', 'Search pages');
  let queued = false;
  new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; adaptArticle(); }); }).observe($('#shell'), { childList: true, subtree: true });
  window.addEventListener('resize', adaptArticle);
  $('#btn-theme').addEventListener('click', () => { syncThemeIcon(); adaptArticle(); });
  document.documentElement.dataset.readerSkin = 'ready';
}

/* A generated role table (QA, Design, Evidence, Coverage, Dev, Source ledger) must never hide a column or a status chip behind a sideways
   scroll. It stays a table while it fits its column; the moment its natural width is wider than the box it sits in, it becomes one stacked
   card per row. The measure is the real content width (sidebar, rail, font, user zoom included), not a guessed viewport breakpoint. */
function fitStackTables() {
  $$('.prose table.stack').forEach((table) => {
    const box = table.closest('.table-wrap');
    if (!box) return;
    table.classList.remove('cards');
    const overflows = box.scrollWidth > box.clientWidth + 1;
    if (overflows) table.classList.add('cards');
    const hint = box.previousElementSibling;
    if (hint && hint.matches('.reader-table-hint') && !(box.scrollWidth > box.clientWidth + 1)) hint.remove();
  });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStackTables);

/* Tooltips for [data-tip] elements (the "*" mark). One dark bubble with a caret, shown after a short hover delay and on keyboard focus.
   No native title tooltip is used. */
function bindTooltips() {
  const tip = document.createElement('div');
  tip.id = 'reader-tip';
  tip.className = 'reader-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  let target = null;
  let timer = 0;
  const hide = () => { clearTimeout(timer); target = null; tip.hidden = true; };
  const show = (el) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), document.documentElement.clientWidth - w - 8);
    const above = r.top - h - 10 >= 8;
    tip.dataset.side = above ? 'top' : 'bottom';
    tip.style.left = left + 'px';
    tip.style.top = (above ? r.top - h - 8 : r.bottom + 8) + 'px';
    tip.style.setProperty('--tip-caret', (r.left + r.width / 2 - left) + 'px');
  };
  const pick = (e, delay) => {
    const el = e.target.closest ? e.target.closest('[data-tip]:not(.anchor-btn)') : null;
    if (el === target) return;
    hide();
    if (!el) return;
    target = el;
    timer = window.setTimeout(() => show(el), delay);
  };
  document.addEventListener('mouseover', (e) => pick(e, 150));
  document.addEventListener('focusin', (e) => pick(e, 0));
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) hide(); });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
  window.addEventListener('scroll', hide, { passive: true });
}

/* Source positions for "Copy cho AI". The page markdown is rendered one top-level block at a time and every block element carries
   data-src-start / data-src-end: the real first and last line of that block in its spec file (not in the rendered markdown).
   Table rows and list items carry their own line. A selection then maps to the union of the blocks it touches. */
const srcCount = (s) => (s.match(/\n/g) || []).length;

function listItemLines(list, startLine, out) {
  let ok = true;
  let off = 0;
  list.items.forEach((item) => {
    const first = startLine + off;
    out.push([first, first + srcCount(item.raw.replace(/\n+$/, ''))]);
    const rows = item.raw.split('\n');
    let from = 1;
    (item.tokens || []).filter((t) => t.type === 'list').forEach((t) => {
      const needle = t.raw.split('\n')[0].trim();
      let at = -1;
      for (let j = from; j < rows.length; j += 1) if (rows[j].trim() === needle) { at = j; break; }
      if (at < 0) { ok = false; return; }
      from = at + 1;
      if (!listItemLines(t, first + at, out)) ok = false;
    });
    off += srcCount(item.raw);
  });
  return ok;
}

function addAttrs(html, tag, attrs) {
  return html.replace(new RegExp('^<' + tag + '(?=[\\s>/])'), '<' + tag + attrs);
}

function markBlock(html, tok, start, src) {
  const at = (i) => copyFileLine(src, i);
  const end = start + srcCount(tok.raw.replace(/\n+$/, ''));
  const fenced = tok.type === 'code' && /^ {0,3}(```|~~~)/.test(tok.raw);
  let out = html.replace(/^<([a-zA-Z][a-zA-Z0-9]*)/, '<$1 data-src-start="' + at(start) + '" data-src-end="' + at(end) + '"' + (fenced ? ' data-src-fence="1"' : ''));
  if (tok.type === 'table') {
    let k = -1;
    out = out.replace(/<tr>/g, () => { k += 1; const line = at(k === 0 ? start : start + 1 + k); return '<tr data-src-start="' + line + '" data-src-end="' + line + '">'; });
  } else if (tok.type === 'list') {
    const items = [];
    if (listItemLines(tok, start, items) && (out.match(/<li[ >]/g) || []).length === items.length) {
      let k = -1;
      out = out.replace(/<li(?=[ >])/g, () => { k += 1; return '<li data-src-start="' + at(items[k][0]) + '" data-src-end="' + at(items[k][1]) + '"'; });
    }
  }
  return out;
}

function renderSourceBlocks(inst, page) {
  let line = 0;
  let html = '';
  inst.lexer(page.md).forEach((tok) => {
    const start = line;
    line += srcCount(tok.raw);
    if (tok.type === 'space') return;
    html += markBlock(inst.parser([tok], inst.defaults), tok, start, page.src);
  });
  return html;
}

/* "Copy cho AI": a small box next to a text selection in rendered spec content (or next to an element picked in the prototype).
   It shows where the text lives, takes an optional request and copies a Markdown block an AI CLI can act on. */
let copyBox = null; // { el, build(request) -> text, kind }

const COPY_TEXT = {
  kickerSpec: 'Vị trí trong spec', kickerProto: 'Phần tử prototype', button: 'Copy cho AI', placeholder: 'Yêu cầu của bạn (không bắt buộc)',
  copied: 'Đã copy cho AI', manual: 'Trình duyệt không cho ghi clipboard. Văn bản đã được chọn sẵn: nhấn Ctrl/Cmd+C.', close: 'Đóng',
};

function ensureCopyBox() {
  if ($('#copy-box')) return $('#copy-box');
  const el = document.createElement('div');
  el.id = 'copy-box';
  el.className = 'copy-box';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', COPY_TEXT.button);
  el.dataset.copyState = 'idle';
  el.innerHTML = `<p class="copy-box-kicker" id="copy-box-kicker"></p>
<code class="copy-box-loc" id="copy-box-loc"></code>
<label class="copy-box-field"><span class="sr-only">${COPY_TEXT.placeholder}</span><input id="copy-box-request" class="input" type="text" maxlength="500" autocomplete="off" spellcheck="false" placeholder="${COPY_TEXT.placeholder}"></label>
<div class="copy-box-actions"><button type="button" class="btn primary" id="copy-box-copy">${COPY_TEXT.button}</button><button type="button" class="btn" id="copy-box-close">${COPY_TEXT.close}</button><span class="copy-box-keys"><kbd class="chip" id="copy-box-key">Ctrl Enter</kbd><kbd class="chip">Esc</kbd></span></div>
<div class="copy-box-manual" id="copy-box-manual" hidden><p>${COPY_TEXT.manual}</p><textarea id="copy-box-text" class="input" readonly rows="7" spellcheck="false" aria-label="Văn bản cho AI, đã chọn sẵn"></textarea></div>
<p class="copy-box-status" id="copy-box-status" role="status" aria-live="polite"></p>`;
  document.body.appendChild(el);
  $('#copy-box-key').textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘ Enter' : 'Ctrl Enter';
  $('#copy-box-copy').addEventListener('click', runCopy);
  $('#copy-box-close').addEventListener('click', closeCopyBox);
  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCopy(); }
  });
  return el;
}

/* rect: viewport rectangle of the thing the box is about. The box sits below it (above when there is no room), in page coordinates so it scrolls with the text. */
function openCopyBox({ rect, kind, location, build }) {
  const el = ensureCopyBox();
  copyBox = { el, build, kind };
  $('#copy-box-kicker').textContent = kind === 'proto' ? COPY_TEXT.kickerProto : COPY_TEXT.kickerSpec;
  $('#copy-box-loc').textContent = location;
  $('#copy-box-manual').hidden = true;
  $('#copy-box-status').textContent = '';
  $('#copy-box-request').value = '';
  el.dataset.copyState = 'idle';
  el.dataset.copyKind = kind;
  el.hidden = false;
  const w = el.offsetWidth, h = el.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  let left = Math.min(Math.max(8, rect.left), vw - w - 8);
  let top = rect.bottom + 8;
  if (top + h > vh - 8 && rect.top - h - 8 > 8) top = rect.top - h - 8;
  el.style.left = (left + window.scrollX) + 'px';
  el.style.top = (top + window.scrollY) + 'px';
  /* After a click in the prototype frame the keyboard is inside the frame: bring it to the box so Enter and Esc work. A text selection keeps its focus (Cmd+C must still copy the text). */
  if (kind === 'proto') $('#copy-box-request').focus({ preventScroll: true });
}

function closeCopyBox() {
  if (copyBox) copyBox.el.hidden = true;
  copyBox = null;
}

async function runCopy() {
  if (!copyBox) return;
  const el = copyBox.el;
  const text = copyBox.build($('#copy-box-request').value);
  let mode = 'api';
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    mode = 'refused';
  }
  if (mode === 'refused') {
    const manual = $('#copy-box-manual');
    const ta = $('#copy-box-text');
    manual.hidden = false;
    ta.value = text;
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    mode = ok ? 'exec' : 'manual';
    if (ok) manual.hidden = true;
  }
  el.dataset.copyState = mode;
  $('#copy-box-status').textContent = mode === 'manual' ? COPY_TEXT.manual : COPY_TEXT.copied;
  if (mode !== 'manual') { toast(COPY_TEXT.copied); window.setTimeout(() => { if (copyBox && copyBox.el === el) closeCopyBox(); }, 700); }
}

/* ---- Spec text selection ---- */
const SRC_ID = /\b((?:US-(?:\d+|P\d+)|NF-\d+)\.AC-\d+|US-(?:\d+|P\d+)|NF-\d+|REQ-\d+|SCR-\d{3,}|D\d+|A-\d+)\b/g;

function selectedTextNodes(range) {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return [root];
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!range.intersectsNode(n)) continue;
    const from = n === range.startContainer ? range.startOffset : 0;
    const to = n === range.endContainer ? range.endOffset : n.nodeValue.length;
    if (n.nodeValue.slice(from, to).trim()) out.push(n);
  }
  return out;
}

const srcUnitOf = (node) => (node.nodeType === Node.TEXT_NODE ? node.parentElement : node).closest('[data-src-start]');
const newlinesIn = (s) => (s.match(/\n/g) || []).length;

/* Source lines touched by one end of the selection. A fenced code block is exact (its own line); anything else is its block, row or item. */
function endpointLines(range, node, which) {
  const unit = srcUnitOf(node);
  if (!unit) return null;
  /* Exact lines only inside the <code> text. A chip or caption of the same block, and a Mermaid fence (drawn as SVG, no text-to-line mapping), cite the block. */
  const code = unit.hasAttribute('data-src-fence') ? unit.querySelector('code') : null;
  if (!code || !code.contains(node)) return [Number(unit.dataset.srcStart), Number(unit.dataset.srcEnd)];
  const first = Number(unit.dataset.srcStart) + 1;
  const probe = document.createRange();
  probe.setStart(code, 0);
  if (which === 'start') probe.setEnd(node, node === range.startContainer ? range.startOffset : 0);
  else probe.setEnd(node, node === range.endContainer ? range.endOffset : node.nodeValue.length);
  const at = newlinesIn(probe.toString());
  const line = which === 'end' && probe.toString().endsWith('\n') ? first + Math.max(0, at - 1) : first + at;
  return [line, line];
}

function nearestHeading(prose, node) {
  let found = null;
  $$('h1, h2, h3, h4, h5, h6', prose).forEach((h) => { if (h.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING || h.contains(node)) found = h; });
  return found;
}

function uniqueIds(text) {
  const out = [];
  String(text).replace(SRC_ID, (m) => { if (!out.includes(m)) out.push(m); return m; });
  return out.slice(0, 8);
}

/* Files behind a generated page: the source pages its links point to. Lines are unknown there, so none are given. */
function generatedSources(range) {
  const links = Array.from(range.cloneContents().querySelectorAll('a[href^="#"]'));
  [range.startContainer, range.endContainer].forEach((n) => { const a = (n.nodeType === 3 ? n.parentElement : n).closest('a[href^="#"]'); if (a) links.push(a); });
  const files = [];
  links.forEach((a) => {
    const id = decodeURIComponent(a.getAttribute('href').slice(1)).split('.')[0];
    const p = state.pages[id];
    if (p && !p.generated && p.src && !files.includes(p.src.file)) files.push(p.src.file);
  });
  return files.slice(0, 6);
}

/* The selected text as the reader shows it, without the marks the reader adds (anchor buttons, "*" chips, previous-wording notes). */
function selectionPlainText(sel, range) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;visibility:hidden';
  box.appendChild(range.cloneContents());
  box.querySelectorAll('.block-history, .change-chip, .anchor-btn, button').forEach((n) => n.remove());
  document.body.appendChild(box);
  const text = box.innerText;
  box.remove();
  return text && text.trim() ? text : sel.toString();
}

function specSelectionContext() {
  const sel = window.getSelection();
  const prose = $('#prose');
  if (!sel || sel.isCollapsed || !sel.rangeCount || !prose) return null;
  const range = sel.getRangeAt(0);
  /* In the full dossier every section is one spec page with its own source file. */
  const host = (range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer);
  const dossier = host && host.closest ? host.closest('.dossier-page') : null;
  const page = dossier ? state.pages[dossier.id.replace(/^dos-/, '')] : state.pages[state.current];
  if (!page) return null;
  if (!prose.contains(range.commonAncestorContainer) || range.commonAncestorContainer.parentElement.closest('.fm-box, .copy-box, .block-history, button, input, textarea, .proto-toolbar')) return null;
  const nodes = selectedTextNodes(range);
  if (!nodes.length) return null;
  /* The browser separates table cells with a tab; the quote reads better with the cell bars of the source row. */
  const inTable = nodes.some((n) => n.parentElement.closest('td, th'));
  const plain = selectionPlainText(sel, range);
  const text = inTable ? plain.replace(/\t/g, ' | ') : plain;
  if (!text.trim()) return null;
  const heading = nearestHeading(prose, nodes[0]);
  /* Headings the reader writes itself (role views, dossier titles) have no .heading-text span. */
  const headingText = heading ? (heading.querySelector('.heading-text') || heading).textContent.trim() : '';
  const ids = uniqueIds(text + ' ' + headingText);
  if (!ids.length && !page.generated && page.rel) { const stem = page.rel.split('/').pop().replace(/\.md$/, ''); if (uniqueIds(stem).length) ids.push(stem); }
  const base = { text, ids, heading: headingText, anchor: page.id + (heading && heading.id ? '.' + heading.id.replace('dos-' + page.id + '--', '') : ''), project: state.data.source, pageId: page.id, pageTitle: page.title };
  const rect = (() => { const rs = range.getClientRects(); return rs.length ? rs[rs.length - 1] : range.getBoundingClientRect(); })();
  if (page.generated || !page.src) return { ...base, generated: true, sources: generatedSources(range), rect };
  const a = endpointLines(range, nodes[0], 'start');
  const b = endpointLines(range, nodes[nodes.length - 1], 'end');
  const lines = [a, b].filter(Boolean);
  return { ...base, rel: page.src.file, start: lines.length ? Math.min(...lines.map((l) => l[0])) : null, end: lines.length ? Math.max(...lines.map((l) => l[1])) : null, rect };
}

function showSpecBox() {
  const ctx = specSelectionContext();
  if (!ctx) { if (copyBox && copyBox.kind === 'spec' && !copyBox.el.contains(document.activeElement)) closeCopyBox(); return; }
  openCopyBox({ rect: ctx.rect, kind: 'spec', location: copyLocationLine(ctx), build: (request) => copyFormatSpec({ ...ctx, request }) });
}

function bindCopyBox() {
  ensureCopyBox();
  const article = $('#article');
  article.addEventListener('mouseup', () => window.setTimeout(showSpecBox, 0));
  article.addEventListener('keyup', (e) => { if (e.shiftKey && /^(Arrow|Home|End|Page)/.test(e.key)) showSpecBox(); });
  document.addEventListener('mousedown', (e) => {
    if (copyBox && !copyBox.el.contains(e.target) && !e.target.closest('.proto-frame')) closeCopyBox();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!copyBox) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCopyBox(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCopy(); }
  }, true);
  window.addEventListener('hashchange', closeCopyBox);
}

/* Prototype page: the click-through prototype shown in a sandboxed frame, a screen list, and Annotate (hover outlines an element,
   click opens the same Copy cho AI box). The frame is cross-origin on purpose (sandbox without allow-same-origin): it talks to the
   page by postMessage only. Its script is injected here; the prototype file itself is never changed (the new-tab link opens the clean copy). */

/* Runs INSIDE the frame. Its source is taken from this function's text, so it must not use anything from the reader. */
function protoFrameScript() {
  var CH = 'spec-reader';
  var annotate = false, hover = null, picked = null;
  var style = document.createElement('style');
  style.textContent = '.reader-annotate-on *{cursor:crosshair !important}.reader-annotate-hover{outline:2px solid #E00026 !important;outline-offset:2px !important}.reader-annotate-picked{outline:2px solid #E00026 !important;outline-offset:2px !important;background-color:rgba(224,0,38,.1) !important}';
  document.head.appendChild(style);
  var ROLES = { a: 'link', button: 'button', input: 'textbox', textarea: 'textbox', select: 'combobox', option: 'option', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', li: 'listitem', ul: 'list', ol: 'list', nav: 'navigation', header: 'banner', footer: 'contentinfo', main: 'main', section: 'region', table: 'table', tr: 'row', td: 'cell', th: 'columnheader', img: 'image', label: 'label', figure: 'figure', pre: 'code', code: 'code', svg: 'graphic' };
  function role(el) {
    var tag = el.tagName.toLowerCase();
    var explicit = el.getAttribute('role');
    if (explicit) return explicit;
    if (tag === 'a' && !el.hasAttribute('href')) return 'text';
    if (tag === 'input') { var t = (el.getAttribute('type') || 'text').toLowerCase(); return t === 'checkbox' ? 'checkbox' : t === 'radio' ? 'radio' : (t === 'button' || t === 'submit') ? 'button' : 'textbox'; }
    if (ROLES[tag]) return ROLES[tag];
    return tag === 'div' ? 'group' : 'text';
  }
  function squash(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function label(el) {
    var aria = el.getAttribute('aria-label');
    if (aria) return squash(aria);
    var by = el.getAttribute('aria-labelledby');
    if (by) { var t = by.split(/\s+/).map(function (id) { var n = document.getElementById(id); return n ? n.textContent : ''; }).join(' '); if (squash(t)) return squash(t); }
    if (el.labels && el.labels.length) return squash(el.labels[0].textContent);
    if (el.tagName === 'IMG') return squash(el.getAttribute('alt'));
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName)) return squash(el.getAttribute('placeholder') || el.value);
    return squash(el.textContent);
  }
  function lineOf(el) { var n = el.closest('[data-src-line]'); return n ? Number(n.getAttribute('data-src-line')) : 0; }
  function related(el) {
    var out = [];
    for (var n = el; n && n.getAttribute; n = n.parentElement) {
      ['data-us', 'data-ac', 'data-trace'].forEach(function (a) { (n.getAttribute(a) || '').split(/[\s,;]+/).forEach(function (v) { if (v && out.indexOf(v) < 0) out.push(v); }); });
    }
    return out;
  }
  function mark(el, cls, on) { if (el) el.classList[on ? 'add' : 'remove'](cls); }
  function send(msg) { msg.channel = CH; parent.postMessage(msg, '*'); }
  document.addEventListener('mouseover', function (e) {
    if (!annotate) return;
    mark(hover, 'reader-annotate-hover', false);
    hover = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    mark(hover, 'reader-annotate-hover', true);
  });
  document.addEventListener('mouseout', function () { if (hover) { mark(hover, 'reader-annotate-hover', false); hover = null; } });
  document.addEventListener('click', function (e) {
    /* A fragment link in a srcdoc frame would resolve against the reader's address, so it is followed here. */
    var link = !annotate && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (link) { e.preventDefault(); location.hash = link.getAttribute('href'); var t = document.getElementById(link.getAttribute('href').slice(1)); if (t) t.scrollIntoView(); return; }
    if (!annotate) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    mark(picked, 'reader-annotate-picked', false);
    picked = el;
    mark(picked, 'reader-annotate-picked', true);
    var sec = el.closest('section[id]');
    var r = el.getBoundingClientRect();
    send({ type: 'pick', role: role(el), text: label(el).slice(0, 80), line: lineOf(el), section: sec ? sec.id : '', related: related(el), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
  }, true);
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.channel !== CH) return;
    if (d.type === 'annotate') { annotate = !!d.on; document.documentElement.classList[annotate ? 'add' : 'remove']('reader-annotate-on'); if (!annotate) { mark(hover, 'reader-annotate-hover', false); mark(picked, 'reader-annotate-picked', false); picked = null; } }
    if (d.type === 'goto') { location.hash = d.id; var t = document.getElementById(d.id); if (t) t.scrollIntoView(); }
  });
  window.addEventListener('hashchange', function () { send({ type: 'screen', id: location.hash.replace(/^#/, '') }); });
  send({ type: 'ready' });
}

const PROTO_SCRIPT = '<script>(' + protoFrameScript.toString() + ')();<\/script>';
const PROTO_STATE_TONE = { normal: 'ok', empty: 'warn', error: 'bad', loading: 'info' };

function protoSrcdoc(html) {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => PROTO_SCRIPT + '</body>') : html + PROTO_SCRIPT;
}

function renderPrototypePage(prose, page) {
  const proto = state.data.prototype;
  if (!proto) { prose.innerHTML = '<p>This spec has no prototype file.</p>'; return; }
  const screens = proto.screens;
  const names = [];
  screens.forEach((s) => { if (!names.find((n) => n.screen === s.screen)) names.push({ screen: s.screen, title: s.title }); });
  const wrap = document.createElement('div');
  wrap.className = 'proto';
  wrap.innerHTML = `<div class="proto-toolbar" role="toolbar" aria-label="Prototype">
  <div class="proto-group" role="group" aria-label="Màn hình" id="proto-screens"></div>
  <div class="proto-group" role="group" aria-label="State" id="proto-states"></div>
  <div class="proto-tools"><button type="button" class="btn" id="proto-annotate" aria-pressed="false">Annotate</button><a class="btn" id="proto-open" href="${escapeHtml(proto.file)}" target="_blank" rel="noopener noreferrer">Mở tab mới</a></div>
</div>
<p class="proto-hint" id="proto-hint">Annotate tắt: bấm trong prototype như người dùng. Bật Annotate để chọn một phần tử và copy cho AI.</p>
<iframe class="proto-frame" id="proto-frame" title="Prototype" sandbox="allow-scripts"></iframe>`;
  prose.appendChild(wrap);
  const frame = $('#proto-frame', wrap);
  let current = '', annotateOn = false, ready = false;
  const post = (msg) => { if (frame.contentWindow) frame.contentWindow.postMessage({ channel: 'spec-reader', ...msg }, '*'); };
  const bySection = (id) => screens.find((s) => s.id === id);
  function syncToolbar() {
    const cur = bySection(current);
    const sbox = $('#proto-screens', wrap);
    sbox.replaceChildren();
    const mk = (id, text, active, cls) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn proto-chip' + (cls ? ' ' + cls : ''); b.dataset.goto = id; b.textContent = text;
      if (active) b.setAttribute('aria-current', 'true');
      return b;
    };
    sbox.appendChild(mk('start', 'Start', current === 'start' || !cur && current === ''));
    names.forEach((n) => sbox.appendChild(mk(n.screen + '--normal', n.screen + (n.title ? ' · ' + n.title : ''), !!cur && cur.screen === n.screen)));
    const stbox = $('#proto-states', wrap);
    stbox.replaceChildren();
    if (cur) screens.filter((s) => s.screen === cur.screen).forEach((s) => stbox.appendChild(mk(s.id, s.state, s.id === current, 'proto-state tone-' + (PROTO_STATE_TONE[s.state] || 'neutral'))));
    stbox.hidden = !cur;
  }
  function go(id) { current = id; syncToolbar(); if (ready) post({ type: 'goto', id }); else frame.dataset.pendingGoto = id; }
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-goto]');
    if (b) { go(b.dataset.goto); return; }
    if (e.target.closest('#proto-annotate')) {
      annotateOn = !annotateOn;
      const t = $('#proto-annotate', wrap);
      t.setAttribute('aria-pressed', annotateOn ? 'true' : 'false');
      t.classList.toggle('is-on', annotateOn);
      $('#proto-hint', wrap).textContent = annotateOn ? 'Annotate bật: rê chuột để thấy khung viền, bấm một phần tử để mở hộp Copy cho AI.' : 'Annotate tắt: bấm trong prototype như người dùng. Bật Annotate để chọn một phần tử và copy cho AI.';
      wrap.classList.toggle('is-annotating', annotateOn);
      post({ type: 'annotate', on: annotateOn });
      if (!annotateOn) closeCopyBox();
    }
  });
  const onMessage = (e) => {
    if (!frame.isConnected) { window.removeEventListener('message', onMessage); return; }
    if (e.source !== frame.contentWindow || !e.data || e.data.channel !== 'spec-reader') return;
    const d = e.data;
    if (d.type === 'ready') {
      ready = true;
      if (annotateOn) post({ type: 'annotate', on: true });
      if (frame.dataset.pendingGoto) { post({ type: 'goto', id: frame.dataset.pendingGoto }); delete frame.dataset.pendingGoto; }
    } else if (d.type === 'screen') { current = d.id; syncToolbar(); }
    else if (d.type === 'pick') {
      const sc = bySection(d.section) || {};
      const f = frame.getBoundingClientRect();
      const rect = { left: f.left + d.rect.left, right: f.left + d.rect.right, top: f.top + d.rect.top, bottom: f.top + d.rect.bottom };
      const base = { screen: sc.screen || (d.section && d.section !== 'start' ? d.section : 'start'), title: sc.title || '', state: sc.state || (d.section === 'start' ? 'start' : ''), role: d.role, text: d.text, line: d.line, related: Array.from(new Set([...(sc.related || []), ...(d.related || [])])), project: state.data.source };
      openCopyBox({ rect, kind: 'proto', location: copyProtoLocationLine(base), build: (request) => copyFormatPrototype({ ...base, request }) });
    }
  };
  window.addEventListener('message', onMessage);
  current = 'start';
  syncToolbar();
  frame.srcdoc = protoSrcdoc(proto.html);
}

start();

})();

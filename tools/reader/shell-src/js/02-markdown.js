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

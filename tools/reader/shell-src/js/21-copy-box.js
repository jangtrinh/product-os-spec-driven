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

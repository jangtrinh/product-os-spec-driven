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

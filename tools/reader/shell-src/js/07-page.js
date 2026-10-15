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

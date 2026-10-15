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

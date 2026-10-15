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

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

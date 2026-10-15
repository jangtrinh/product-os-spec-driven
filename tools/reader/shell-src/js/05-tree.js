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

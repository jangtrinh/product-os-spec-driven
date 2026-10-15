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

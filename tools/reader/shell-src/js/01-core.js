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

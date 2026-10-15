/* Mermaid. Both modes render client-side with the vendored library: offline has it inlined, folder mode loads libs/mermaid.min.js
   the first time a page has a diagram. A diagram renders when it nears the viewport; a failure shows the source instead. */
let mermaidChain = Promise.resolve();
let mermaidConfigured = false;
let mermaidSeq = 0;
let diagramObserver = null;
let libPromise = null;

const themeVar = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);

function mermaidConfig() {
  const dark = isDark();
  const c = {
    bg: themeVar('--color-surface', dark ? '#1F2024' : '#FFFFFF'), node: themeVar('--surface-2', dark ? '#26272C' : '#F0F1F2'),
    border: themeVar('--color-outline', dark ? '#4A4B55' : '#B6B6B6'), text: themeVar('--color-text', dark ? '#ECEDEF' : '#1A1B1E'),
    line: themeVar('--color-text-muted', dark ? '#8F929B' : '#5B5E66'), cluster: themeVar('--surface-3', dark ? '#1B1C20' : '#FBFBFC'),
  };
  return {
    startOnLoad: false, securityLevel: 'loose', theme: 'base',
    themeVariables: {
      fontFamily: themeVar('--font-sans', 'system-ui, sans-serif'), fontSize: '16px', background: c.bg, primaryColor: c.node, primaryTextColor: c.text,
      primaryBorderColor: c.border, lineColor: c.line, secondaryColor: c.node, tertiaryColor: c.cluster, clusterBkg: c.cluster, clusterBorder: c.border,
      edgeLabelBackground: c.bg, textColor: c.text, nodeTextColor: c.text, mainBkg: c.node, nodeBorder: c.border,
    },
    flowchart: { useMaxWidth: false, htmlLabels: true, nodeSpacing: 36, rankSpacing: 44, padding: 10 },
    sequence: { useMaxWidth: false }, state: { useMaxWidth: false }, er: { useMaxWidth: false },
    gantt: { useMaxWidth: false }, journey: { useMaxWidth: false }, class: { useMaxWidth: false },
  };
}

function showDiagramError(div, src) {
  div.dataset.done = 'error';
  div.classList.remove('is-pending');
  div.innerHTML = '<div class="diagram-error"><p>Diagram could not render. The source is shown instead.</p><div class="code-block"><div class="code-head"><span>mermaid</span><button type="button" class="btn" data-copy-code>Copy code</button></div><pre><code></code></pre></div></div>';
  div.querySelector('code').textContent = src;
}

async function renderOne(div) {
  if (div.dataset.done === '1') return;
  const src = div.dataset.src || '';
  try { await loadMermaidLib(); } catch (e) { showDiagramError(div, src); return; }
  if (!mermaidConfigured || div.dataset.theme !== (isDark() ? 'dark' : 'light')) {
    window.mermaid.initialize(mermaidConfig());
    mermaidConfigured = true;
  }
  const id = 'mmd' + (mermaidSeq += 1);
  try {
    await window.mermaid.parse(src);
    const out = await window.mermaid.render(id, src);
    div.innerHTML = out.svg;
    const svg = div.querySelector('svg');
    const vb = svg && svg.viewBox && svg.viewBox.baseVal;
    if (vb && vb.width) svg.style.minWidth = Math.min(vb.width, 640) + 'px';
    if (out.bindFunctions) out.bindFunctions(div);
    div.dataset.done = '1';
    div.dataset.theme = isDark() ? 'dark' : 'light';
    div.classList.remove('is-pending');
  } catch (err) {
    showDiagramError(div, src);
  }
  $$('#d' + id + ', #' + id).forEach((n) => { if (!div.contains(n)) n.remove(); });
}

const queueRender = (div) => { mermaidChain = mermaidChain.then(() => renderOne(div)).catch(() => {}); return mermaidChain; };

function observeDiagrams(root) {
  const nodes = $$('.diagram[data-mermaid]', root).filter((d) => d.dataset.done !== '1' && d.dataset.done !== 'error');
  if (!nodes.length) return;
  if (!diagramObserver) {
    diagramObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { diagramObserver.unobserve(e.target); queueRender(e.target); } });
    }, { rootMargin: '700px 0px' });
  }
  nodes.forEach((n) => diagramObserver.observe(n));
}

function loadMermaidLib() {
  if (window.mermaid) return Promise.resolve();
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = 'libs/mermaid.min.js';
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('libs/mermaid.min.js could not be loaded'));
      document.head.appendChild(el);
    });
  }
  return libPromise;
}

function renderDiagrams(root) {
  $$('.diagram[data-mermaid]', root).forEach((d) => { const pre = d.querySelector('pre.mermaid'); if (!d.dataset.src && pre) d.dataset.src = pre.textContent; });
  if (!$$('.diagram[data-mermaid]', root).length) return;
  loadMermaidLib().then(() => observeDiagrams(root)).catch(() => {
    $$('.diagram[data-mermaid]', root).forEach((d) => showDiagramError(d, d.dataset.src || ''));
  });
}

function rerenderDiagramsForTheme() {
  if (!window.mermaid) return;
  mermaidConfigured = false;
  $$('.diagram[data-mermaid][data-done="1"]').forEach((d) => { d.dataset.done = ''; d.classList.add('is-pending'); });
  observeDiagrams(document);
}

function diagramStats(root) {
  const all = $$('.diagram[data-mermaid]', root);
  return { total: all.length, rendered: all.filter((d) => d.querySelector('svg')).length, failed: all.filter((d) => d.dataset.done === 'error').length };
}

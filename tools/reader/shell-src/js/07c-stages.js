/* Wireframes page: each state's ASCII drawing is shown as a screen, not as a code listing; flows read as arrows. */
const WF_STATE_TONE = { normal: 'ok', empty: 'warn', error: 'bad', loading: 'info' };
const WF_HEAD = /^(SCR-\d{3,})--(normal|empty|error|loading)$/;
const FLOW_STEP = /^SCR-\d{3,}(?:\s+--[^\n]+?-->\s+SCR-\d{3,})+$/;

function flowArrows(path) {
  const parts = path.trim().split(/\s+--(.+?)-->\s+/);
  let out = parts[0];
  for (let i = 1; i < parts.length; i += 2) out += ' → ' + parts[i + 1] + ' (' + parts[i].trim() + ')';
  return out;
}

function decorateWireframes(root, page) {
  const info = page.stage || { screens: [] };
  const screen = Object.fromEntries(info.screens.map((s) => [s.id, s]));
  const normalHead = {};
  $$('h3', root).forEach((h) => {
    const text = h.querySelector('.heading-text');
    const m = WF_HEAD.exec(text.textContent.trim());
    if (!m) return;
    const sc = screen[m[1]] || {};
    text.textContent = m[1] + ' · ' + (sc.title ? sc.title + ' — ' : '') + m[2];
    h.dataset.screen = m[1];
    if (m[2] === 'normal') normalHead[m[1]] = h.id;
    const block = h.nextElementSibling;
    if (!block || !block.classList.contains('code-block')) return;
    const fig = document.createElement('figure');
    fig.className = 'screen-frame';
    fig.dataset.state = m[2];
    ['data-src-start', 'data-src-end', 'data-src-fence'].forEach((a) => { if (block.hasAttribute(a)) fig.setAttribute(a, block.getAttribute(a)); });
    const bar = document.createElement('figcaption');
    bar.className = 'screen-frame-bar';
    const chip = document.createElement('span');
    chip.className = 'chip tone-' + (WF_STATE_TONE[m[2]] || 'neutral');
    chip.textContent = m[2];
    bar.appendChild(chip);
    const serves = [...(sc.us || [])];
    if (serves.length) { const s = document.createElement('span'); s.className = 'screen-frame-ids'; s.textContent = 'Phục vụ ' + serves.join(' · '); bar.appendChild(s); }
    const pre = document.createElement('pre');
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', 'Wireframe ' + h.querySelector('.heading-text').textContent);
    const code = document.createElement('code');
    code.textContent = block.querySelector('code').textContent;
    pre.appendChild(code);
    fig.append(bar, pre);
    block.replaceWith(fig);
  });
  $$('tbody tr', root).forEach((tr) => {
    const cell = tr.cells[1];
    if (cell && tr.cells.length === 2 && FLOW_STEP.test(cell.textContent.trim())) {
      cell.textContent = flowArrows(cell.textContent);
      cell.classList.add('flow-cell');
    }
  });
  $$('tbody tr', root).forEach((tr) => {
    const first = tr.cells[0];
    const id = first ? first.textContent.trim() : '';
    if (/^SCR-\d{3,}$/.test(id) && normalHead[id]) {
      const a = document.createElement('a');
      a.href = hashOf(page.id, normalHead[id]);
      a.textContent = id;
      first.replaceChildren(a);
    }
  });
}

/* Reference chain picker: choose a requirement or a story, see the chain to screens and evidence. */
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);
const mmText = (s) => String(s).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
let chainHost = null;

function chainLookup(id) {
  const c = state.data.chain;
  const up = id.toUpperCase();
  const req = c.reqs.find((r) => r.id === up);
  if (req) return { kind: 'req', req, stories: req.us.map((u) => c.stories.find((s) => s.id === u)).filter(Boolean) };
  const story = c.stories.find((s) => s.id === up);
  if (story) return { kind: 'story', story, reqs: story.reqs.map((r) => c.reqs.find((x) => x.id === r)).filter(Boolean), stories: [story] };
  return null;
}

function chainDiagram(res) {
  const lines = ['%%{init: {"flowchart": {"rankSpacing": 22, "nodeSpacing": 16, "useMaxWidth": true}}}%%', 'flowchart LR'];
  const reqs = res.kind === 'req' ? [res.req] : res.reqs;
  reqs.forEach((r, i) => lines.push(`R${i}["${r.id}<br/>${mmText(clip(r.title, 22))}"]`));
  res.stories.forEach((s, j) => {
    lines.push(`U${j}["${s.id}<br/>${mmText(clip(s.title, 22))}"]`, `A${j}["${s.acs.length} ACs"]`,
      `S${j}["${s.screens.length ? s.screens.slice(0, 2).join(' ') + (s.screens.length > 2 ? ' +' + (s.screens.length - 2) : '') : 'no screen'}"]`,
      `E${j}["${s.boards.length} boards<br/>${s.scenarios} scenarios"]`, `U${j} --> A${j} --> S${j} --> E${j}`, `click U${j} href "${hashOf(s.page, '')}"`);
    reqs.forEach((r, i) => { if (s.reqs.includes(r.id)) lines.push(`R${i} --> U${j}`); });
  });
  return lines.join('\n');
}

function storyCard(s) {
  const c = state.data.chain;
  const boards = s.boards.map((b) => c.boards.find((x) => x.id === b)).filter(Boolean);
  const rows = s.acs.map((a) => `<tr><td><a href="${hashOf(s.page, s.acHead || '')}">${a.id}</a></td><td>${escapeHtml(clip(a.when, 160))}</td><td>${a.scn}</td></tr>`).join('');
  return `<article class="chain-story"><div class="chain-story-head"><a href="${hashOf(s.page, '')}">${s.id}</a><span>${escapeHtml(s.title)}</span>
    <span>Acceptance criteria</span><span class="chip">${s.acs.length}</span><span>Scenarios</span><span class="chip">${s.scenarios}</span></div>
    <div class="chain-evidence"><span>Screens</span>${s.screens.map((x) => `<span class="chip">${x}</span>`).join('') || '<span>none</span>'}
    <span>Boards</span>${boards.map((b) => `<a class="chip" href="${b.png}" title="${escapeHtml(b.name)}">${b.id}</a>`).join('') || '<span>none</span>'}</div>
    ${s.acs.length ? `<details><summary>Show ${s.acs.length} acceptance criteria</summary><div class="table-wrap chain-acs" tabindex="0"><table><thead><tr><th>AC</th><th>Given / when</th><th>Scenarios</th></tr></thead><tbody>${rows}</tbody></table></div></details>` : ''}</article>`;
}

function renderChainResult(id) {
  const out = $('#chain-result', chainHost);
  const res = chainLookup(id);
  if (!res) { out.innerHTML = '<p class="chain-empty">No requirement or story has that id.</p>'; return; }
  const c = state.data.chain;
  let head;
  if (res.kind === 'req') {
    const grp = res.req.group && c.prdPage ? ` <a href="${hashOf(c.prdPage, slugify(res.req.group))}">${escapeHtml(res.req.group)}</a>` : '';
    head = `<div class="chain-head"><h3>${res.req.id}</h3><span>${escapeHtml(res.req.title)}</span><span>Stories</span><span class="chip">${res.stories.length}</span><span>Acceptance criteria</span><span class="chip">${res.stories.reduce((n, s) => n + s.acs.length, 0)}</span></div><p class="chain-empty">PRD section:${grp || ' none'}</p>`;
  } else {
    head = `<div class="chain-head"><h3>${res.story.id}</h3><span>${escapeHtml(res.story.title)}</span><span>Requirements</span><span class="chip">${res.reqs.length}</span></div><p class="chain-empty">${res.reqs.map((r) => `<a href="${hashOf('reference-chain', r.id.toLowerCase())}">${r.id}</a> ${escapeHtml(clip(r.title, 90))}`).join('<br>')}</p>`;
  }
  const list = res.stories.length ? `<div class="chain-list">${res.stories.map(storyCard).join('')}</div>` : '<p class="chain-empty">No story file cites this requirement.</p>';
  out.innerHTML = `${head}<div class="diagram is-pending" data-mermaid><pre class="mermaid">${escapeHtml(chainDiagram(res))}</pre></div>${list}`;
  decorate(out, { generated: true }, 'chain-');
  $$('img', out).forEach(() => {});
  renderDiagrams(out);
}

function mountChain(prose, token) {
  chainHost = $('[data-widget="reference-chain"]', prose);
  const c = state.data.chain;
  const opts = (list, fmt) => list.map((x) => `<option value="${x.id}">${escapeHtml(fmt(x))}</option>`).join('');
  chainHost.innerHTML = `<div class="picker"><div class="picker-row"><label for="chain-select">Pick a requirement or a story</label>
    <select id="chain-select" class="select"><optgroup label="Requirements">${opts(c.reqs, (r) => `${r.id} · ${clip(r.title, 70)}`)}</optgroup>
    <optgroup label="User stories">${opts(c.stories, (s) => `${s.id} · ${clip(s.title, 70)}`)}</optgroup></select></div><div id="chain-result"></div></div>`;
  $('#chain-select', chainHost).addEventListener('change', (e) => {
    history.replaceState(null, '', hashOf('reference-chain', e.target.value.toLowerCase()));
    renderChainResult(e.target.value);
  });
  applyChainToken(/^(req|us|nf)-/i.test(token || '') ? token : '');
}

function applyChainToken(token) {
  const sel = $('#chain-select', chainHost);
  if (!sel) return;
  const first = (state.data.chain.reqs[0] || state.data.chain.stories[0]).id;
  const want = (token || first).toUpperCase();
  if (token && !chainLookup(want)) { sel.selectedIndex = -1; $('#chain-result', chainHost).innerHTML = `<p class="chain-empty" role="alert">No requirement or story has the id ${escapeHtml(want)}.</p>`; return; }
  sel.value = want;
  renderChainResult(want);
}

function mountWidgets(prose, page, token) {
  if (page.id === 'reference-chain') mountChain(prose, token);
  else if (token) setTimeout(() => scrollToToken(page, token), 0);
}

import { esc, chip, absent, section, table, pageLink, stateChip, facts, scopeLabel, toneOf } from './html.mjs';

/* Product owner view: release at a glance, design preview, approvals and open questions. Derived only; it adds no authority. */
const previewFor = (screen) => {
  const coded = screen.states.flatMap((s) => s.coded)[0];
  if (coded) return { src: coded, note: 'Image shown: coded capture' };
  const board = screen.states.flatMap((s) => s.boards)[0];
  return board ? { board, note: 'Image shown: wireframe board, no coded screen built yet' } : null;
};

export function buildPoView(ctx) {
  const { stories, coverage, screens, readable, design, openAll, boardsById, pages } = ctx;
  const stages = ctx.stages || {};
  const t = coverage.totals;
  const blocking = openAll.filter((o) => o.blocking).length;
  const out = [];
  out.push(facts([
    ['Stories', `${t.us}`], ['Acceptance criteria', `${t.ac}`], ['Passed on current evidence', `${t.passed} of ${t.ac}`],
    ['Open questions', `${openAll.length} ${blocking ? chip(`${blocking} blocking`, 'bad') : chip('none blocking', 'ok')}`],
  ]));
  const epics = readable?.epics || [];
  const first = pages.find((p) => p.layer === 'readable');
  out.push(section('Release and epics', epics.length, epics.length
    ? table(['Epic', 'Status', 'Goal'], epics.map((e) => [e.page ? pageLink(e.page, e.title) : esc(e.title), e.status ? stateChip(e.status) : chip('no status', 'warn'), esc(e.goal || '')]), { caption: 'Epics' })
      + (first ? `<p>${pageLink(first.id, 'Open the plain-language release page')}</p>` : '')
    : absent('This spec has no readable epic pages, so there is no release breakdown to show.')));
  const cards = screens.screens.map((sc) => {
    const p = previewFor(sc), srcs = [...new Set(sc.states.map((s) => s.source.label))];
    const preview = p?.src ? `<img src="${esc(p.src)}" alt="${esc(`Coded preview of screen ${sc.id}`)}" data-role="coded">`
      : p?.board && boardsById[p.board] ? `<img src="${esc(boardsById[p.board].png)}" alt="${esc(`Wireframe board ${p.board} for screen ${sc.id} (Coded screen not built yet, wireframe shown.)`)}" data-role="wireframe">` : '<div class="no-image" role="note">No image for this screen</div>';
    const full = p?.src || (p?.board && boardsById[p.board] ? boardsById[p.board].png : '');
    return `<li class="screen-card"><div class="screen-card-media">${preview}</div><div class="screen-card-body"><strong>${esc(sc.id)}</strong> ${chip(`${sc.states.length} states`)} ${srcs.map((s) => chip(`Design source: ${s}`, toneOf(s))).join(' ')}<p class="muted">${esc(p ? p.note : 'No image to show')}${full ? ` · <a href="${esc(full)}" target="_blank" rel="noopener noreferrer">View full size</a>` : ''}${sc.missingStates.length ? ` · states not declared: ${esc(sc.missingStates.join(', '))}` : ''}</p></div></li>`;
  });
  const stageLinks = [stages.wireframe && pageLink(stages.wireframe, 'Wireframes'), stages.prototype && pageLink(stages.prototype, 'Prototype')].filter(Boolean);
  const stageLine = stageLinks.length ? `<p class="stage-links">Open the screens as ${stageLinks.join(' · ')}. Each screen names the stories and acceptance criteria it serves.</p>` : '';
  out.push(section('Design preview', screens.screens.length, stageLine + (screens.screens.length
    ? `<ul class="screen-cards">${cards.join('')}</ul><p>${pageLink('design-view', 'Open every screen and state with source and evidence')}</p>`
    : absent(design.inventoryDeclared ? 'The design inventory lists no screens.' : 'No design inventory is declared for this spec.'))));
  const gates = design.records?.gates || [], decisions = design.records?.decisions || [];
  const gateRows = gates.map(({ data: g }) => [esc(g.definition?.id || ''), esc(scopeLabel(g.scope?.kind, (g.scope?.ids || []).length)), stateChip(g.states?.eval || 'NOT_RUN'), stateChip(g.states?.review || 'NOT_RUN'), stateChip(g.states?.human || 'PENDING'), stateChip(g.states?.freshness || 'MISSING'), esc(g.decision || 'no decision yet')]);
  const decRows = decisions.map(({ data: d }) => [esc(d.id), esc(`${d.by} · ${d.channel ?? 'direct'}`), stateChip(d.default || ''), esc(d.reason || ''), esc((d.scope?.ids || []).join(', '))]);
  const changeRows = design.changes.map(({ data: c }) => [esc(c.id), stateChip(c.state), esc(c.reason || ''), esc((c.scope?.ids || []).join(', ')), esc(c.packet || 'no packet yet')]);
  let approvals = '';
  approvals += gateRows.length ? `<h3>Gates</h3>${table(['Gate', 'Scope', 'Eval', 'Review', 'Human', 'Freshness', 'Decision'], gateRows, { caption: 'Gate states' })}` : absent(design.declared.records ? 'No gate records were exported.' : 'No gate records are declared, so no approval state is shown.');
  approvals += decRows.length ? `<h3>Decisions recorded</h3>${table(['Id', 'By · channel', 'Decision', 'Reason', 'Scope'], decRows, { caption: 'Batch decisions' })}` : '';
  approvals += changeRows.length ? `<h3>Change sets</h3>${table(['Id', 'State', 'Reason', 'Scope', 'Packet'], changeRows, { caption: 'Change sets' })}` : '';
  out.push(section('Approvals', gates.length + decisions.length + design.changes.length, approvals));
  out.push(section('Open questions', openAll.length, openAll.length
    ? table(['Question', 'Story', 'Blocking'], openAll.slice(0, 8).map((o) => [esc(o.text), pageLink(o.page, o.us), o.blocking ? chip('blocking', 'bad') : chip('open', 'warn')])) + `<p>${pageLink('open-items', `See all ${openAll.length} open items`)}</p>`
    : absent('No open questions are recorded in any story.')));
  return out.join('\n');
}

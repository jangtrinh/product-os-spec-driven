import { esc, chip, absent, section, table, pageLink, stateChip, facts, stateAnchor } from './html.mjs';

/* Screens and states: inventory rows with design source, preview, boards, evidence and selectors. Missing states are listed, not hidden. */

function preview(r, boardsById, deny) {
  if (r.coded.length) return r.coded.slice(0, 1).map((src) => `<img class="thumb" src="${esc(src)}" alt="${esc(`Coded capture of ${r.key}`)}"><a href="${esc(src)}" target="_blank" rel="noopener noreferrer">View full size</a>`).join('<br>');
  const b = r.boards.map((id) => boardsById[id]).find(Boolean);
  if (b) return `<img class="thumb" src="${esc(b.png)}" alt="${esc(`Wireframe board for ${r.key} (Coded screen not built yet, wireframe shown.)`)}"><a href="${esc(b.png)}" target="_blank" rel="noopener noreferrer">View full size</a><br>${chip('wireframe, not built', 'warn')}`;
  return chip('no image', 'warn');
}

function profileSection(ctx) {
  const p = ctx.design.profile, rub = ctx.design.rubrics;
  if (!p) return section('Design profile and rubric', '', absent('No design profile is declared, so no adapter authority, capability list or UIUX rubric is shown.'));
  const caps = table(['Capability', 'Status', 'Reason'], (p.capabilities || []).map((c) => [esc(c.id), stateChip(c.status), esc(c.reason)]), { caption: 'Design capabilities' });
  const auth = table(['Authority', 'Kind', 'Path', 'Revision'], (p.authority || []).map((a) => [esc(a.id) + (a.non_waivable ? ` ${chip('non-waivable')}` : ''), esc(a.kind), `<code>${esc(a.path)}</code>`, `<code>${esc(String(a.revision).slice(0, 12))}</code>`]), { caption: 'Authority order' });
  const cats = table(['Catalog', 'Kind', 'Path', 'Revision'], (p.catalogs || []).map((c) => [esc(c.id), esc(c.kind), `<code>${esc(c.path)}</code>`, `<code>${esc(String(c.revision).slice(0, 12))}</code>`]), { caption: 'Catalogs' });
  const rubric = (r) => (r && r.text !== null ? `<details><summary>${esc(r.path)}</summary><pre>${esc(r.text)}</pre></details>` : `<p>${chip('rubric file missing', 'bad')} <code>${esc(r ? r.path : 'none declared')}</code></p>`);
  return section('Design profile and rubric', '', `${facts([['Profile', esc(`${p.id} v${p.version}`)], ['Viewports', esc((p.viewports || []).map((v) => `${v.width}×${v.height}`).join(', '))], ['Modes', esc((p.modes || []).join(', '))], ['Locales', esc((p.locales || []).join(', '))]])}
<h3>Authority order</h3>${auth}<h3>Capabilities</h3>${caps}<h3>Catalogs</h3>${cats}<h3>Core UIUX rubric</h3>${rubric(rub && rub.core)}${rub && rub.adapter.length ? `<h3>Adapter rubrics</h3>${rub.adapter.map(rubric).join('')}` : ''}`);
}

export function buildDesignView(ctx) {
  const { screens, boardsById, deny, design } = ctx;
  if (!design.inventoryDeclared) return absent('No design inventory is declared for this spec, so there are no screens or states to show.') + profileSection(ctx);
  if (!screens.screens.length) return absent('The design inventory lists no screens.') + profileSection(ctx);
  const out = [`<p>${chip(screens.rows.length)} screen states in ${chip(screens.screens.length)} screens. The design source of every state is stated: an external file, an authored board or not created. A source that is missing, retired or unverified is shown as such and is never counted as fresh acceptance.</p>`];
  for (const sc of screens.screens) {
    const rows = sc.states.map((r) => ({ id: stateAnchor(r.key), cells: [
      `<strong>${esc(r.state)}</strong>`, esc(r.route), esc(`${r.roles.join(', ')} · ${r.scope.join(', ')}`),
      `${stateChip(r.source.label)}<br><span class="muted">${esc(r.source.reason)}</span>${r.source.link ? `<br><a href="${esc(r.source.link)}" target="_blank" rel="noopener noreferrer">Open external source</a>` : ''}${r.source.snapshotDenied ? `<br>${chip('snapshot denied', 'bad')}` : ''}`,
      preview(r, boardsById, deny),
      r.evidence.length ? r.evidence.map((e) => e.receipt ? `${pageLink('evidence-view', e.id, e.id.toLowerCase())} ${stateChip(e.receipt.freshness)}` : `${esc(e.id)} ${chip('receipt missing', 'bad')}`).join('<br>') : chip('no evidence', 'warn'),
      r.selectors.length ? chip(`${r.selectors.length} ${r.selectors.length === 1 ? "selector" : "selectors"}`, "ok") : chip('no selectors', 'warn'), esc(r.overlay),
    ] }));
    out.push(`\n## Screen ${sc.id}\n\n<p class="muted">Stories: ${sc.states[0].us.map((u) => pageLink(`dev-${u.toLowerCase()}`, u)).join(', ') || '—'}${sc.missingStates.length ? ` · states not declared: ${esc(sc.missingStates.join(', '))}` : ''}</p>\n\n${table(['State', 'Route', 'Roles · scope', 'Design source', 'Preview', 'Evidence', 'Selectors', 'Overlay'], rows, { caption: `States of screen ${sc.id}` })}\n`);
  }
  out.push(profileSection(ctx));
  return out.join('\n');
}

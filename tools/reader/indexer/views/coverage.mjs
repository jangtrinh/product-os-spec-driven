import { esc, chip, absent, section, table, stateChip, ratio, pct } from './html.mjs';

/* Coverage matrix: every cell states its own denominator. Numerators count AC, never scenarios. */
const cell = (n, d) => `<span class="nw">${esc(ratio(n, d))}</span> <span class="muted">${esc(pct(n, d))}</span>`;
const breakdown = (obj) => Object.entries(obj).sort().map(([k, v]) => `${stateChip(k)} ${v}`).join(' ');

export function buildCoverageView(ctx) {
  const { coverage } = ctx, t = coverage.totals;
  const out = [];
  out.push(`<p>Each cell reads <em>passed of total</em> for acceptance criteria. An AC is passed only when every scenario associated with it is declared passing and a current executed receipt lists it as passed. One failing, blocked, stale, planned, unassigned or not-built association keeps the AC out of the numerator.</p>`);
  out.push(section('By area', coverage.areas.length, table(['Area', 'Stories', 'Requirements', 'AC', 'AC with a scenario', 'AC with a reviewed method', 'AC passed (current evidence)', 'Declared passing, unverified', 'States'],
    [...coverage.areas.map((a) => [`<strong>${esc(a.id)}</strong>${a.name && a.name !== a.id ? ` <span class="muted">${esc(String(a.name).replace(new RegExp(`^${a.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '') || a.name)}</span>` : ''}`, esc(a.us), esc(a.req), esc(a.ac), cell(a.withScenario, a.ac), cell(a.reviewed, a.ac), cell(a.passed, a.ac), esc(a.unverified), breakdown(a.states)]),
      { id: 'area-total', cells: ['<strong>All areas</strong>', esc(t.us), '—', esc(t.ac), cell(t.withScenario, t.ac), cell(t.reviewed, t.ac), cell(t.passed, t.ac), esc(t.unverified), breakdown(t.states)] }], { caption: 'Coverage by area' })));
  out.push(section('Scenario associations', t.scenarios, `<div class="split"><div><h3>By method</h3>${table(['Method', 'Scenarios'], Object.entries(t.methods).sort().map(([k, v]) => [stateChip(k), esc(v)]))}</div><div><h3>By declared status</h3>${table(['Status', 'Scenarios'], Object.entries(t.statuses).sort().map(([k, v]) => [stateChip(k), esc(v)]))}</div></div>`));
  const blockers = ['uncovered', 'failing', 'blocked', 'stale', 'not-built', 'unassigned', 'unverified'].map((k) => [stateChip(k), esc(t.states[k] || 0)]);
  out.push(section('What keeps AC out of the numerator', '', table(['State', 'AC'], blockers)));
  out.push(section('Exclusions', coverage.exclusions.length, coverage.exclusions.length ? '' : absent('No exclusion is recorded. Every AC is in the denominator. An exclusion needs a PO reason and confirmer and is shown here beside the totals.')));
  return out.join('\n');
}

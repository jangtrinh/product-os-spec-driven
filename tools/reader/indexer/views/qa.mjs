import { esc, chip, absent, section, table, pageLink, stateChip, facts, screenAnchor, acAnchor } from './html.mjs';

/* QA view: qualified AC -> scenarios -> screen/state -> method/test -> exact receipt and freshness. Uncovered and unverified AC stay in. */
const scnCell = (scns) => scns.length
  ? scns.map((x) => `<span class="nw">${esc(x.id)} ${stateChip(x.status)} ${chip(x.method)}</span>${x.test ? ` <code>${esc(x.test)}</code>` : ''}`).join('<br>')
  : chip('no scenario', 'bad');

export function buildQaView(ctx) {
  const { stories, coverage, screens, evidence, ledgerByTarget } = ctx;
  const t = coverage.totals;
  const out = [];
  out.push(facts([
    ['Acceptance criteria', `${t.ac}`], ['With a scenario', `${t.withScenario} of ${t.ac}`], ['Reviewed method', `${t.reviewed} of ${t.ac}`],
    ['Passed on current evidence', `${t.passed} of ${t.ac}`], ['Declared passing, unverified', `${t.unverified} of ${t.ac}`],
  ]));
  out.push(`<p>${pageLink('coverage', 'Open the area coverage matrix')} for denominators per area. A declared status is not evidence: an AC counts as passed only with a current executed receipt that lists it.</p>`);
  for (const s of stories) {
    const rows = coverage.acRows.filter((r) => r.us === s.id).map((r) => {
      const joined = screens.rows.filter((x) => x.ac.includes(r.qid));
      const recs = r.receipts.map((id) => evidence.byId.get(id)).filter(Boolean);
      const led = ledgerByTarget.get(r.qid) || [];
      return { id: acAnchor(r.qid), cells: [
        `<strong>${esc(r.id)}</strong>`, `<span class="grow-text">${esc(r.given)} → ${esc(r.then)}</span>`, scnCell(r.scns),
        joined.length ? [...new Set(joined.map((x) => x.screen))].map((sc) => pageLink('design-view', `${sc} (${joined.filter((x) => x.screen === sc).length} states)`, screenAnchor(sc))).join('<br>') : s.noUi ? chip('no UI', 'info') : chip('no screen state', 'warn'),
        stateChip(r.state) + (r.reviewed ? '' : ` ${chip('method not reviewed', 'warn')}`),
        recs.length ? recs.map((x) => `${pageLink('evidence-view', x.id, x.id.toLowerCase())} ${stateChip(x.freshness)}`).join('<br>') : chip('no receipt', 'warn'),
        led.length ? led.map((l) => pageLink('source-ledger', l.item.id, `src-${l.item.id.toLowerCase()}`) + ' ' + stateChip(l.item.status)).join('<br>') : '—',
      ] };
    });
    out.push(section(`${s.id} · ${s.title}`, rows.length, rows.length
      ? table(['AC', 'Given / when → then', 'Scenarios', 'Screen · state', 'State', 'Evidence', 'Source items'], rows, { caption: `Acceptance criteria of ${s.id}` })
      : absent('This story has no acceptance criteria table rows.')));
  }
  return out.join('\n');
}

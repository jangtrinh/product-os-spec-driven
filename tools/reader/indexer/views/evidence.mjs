import { esc, chip, absent, section, table, stateChip } from './html.mjs';

/* Evidence receipts as recorded. Retirement and supersession belong to the runner; this page shows pins, freshness and coverage. */
const short = (v) => (v ? String(v).slice(0, 12) : '—');

export function buildEvidenceView(ctx) {
  const { evidence, missingRefs, design } = ctx;
  const conflicts = design.errors.filter((e) => e.what === 'receipts');
  if (!evidence.receipts.length) return absent(design.declared.gateModel ? 'No receipt is declared in gate_model.receipts, so no evidence exists to show.' : 'No gate model is declared, so no evidence receipts exist.');
  const rows = evidence.receipts.map((r) => ({ id: r.id.toLowerCase(), cells: [
    `<code class="keep">${esc(r.id)}</code><br><span class="keep muted">${esc(`${r.domain || 'no domain'} · ${String(r.at).slice(0, 10)}`)}</span>`, stateChip(r.freshness),
    `${r.exit === null ? chip('not executed', 'warn') : stateChip(r.result || (r.exit === 0 ? 'PASS' : 'FAIL'))}<br><span class="keep">${esc(`exit ${r.exit ?? '—'} · ${r.selected} selected`)}</span>`,
    r.verdict ? `${stateChip(r.verdict)} ${r.independent ? chip('independent', 'ok') : chip('not independent', 'warn')}` : chip('no review', 'warn'),
    esc(`${r.ac.length} AC · ${r.scn.length} SCN · ${r.passed.length} passed`), `<code class="keep">${esc(short(r.pins.head))}</code><br><code class="keep">${esc(short(r.pins.build))}</code>`, r.supersedes.length ? esc(`supersedes ${r.supersedes.join(', ')}`) : '—',
  ] }));
  const out = conflicts.length ? [`<div class="callout tone-warning" role="alert"><div class="callout-label">Receipt problems</div><ul>${conflicts.slice(0, 10).map((e) => `<li><code>${esc(e.rel)}</code> ${esc(e.message)}</li>`).join('')}</ul></div>`] : [];
  out.push(`<p>${chip(evidence.receipts.length)} receipts. A raw PASS that is STALE contributes nothing to a passed numerator. This page does not decide supersession; the runner does.</p>`);
  out.push(section('Receipts', rows.length, table(['Receipt · domain · date', 'Freshness', 'Result', 'Review', 'Coverage', 'Head / build', 'Supersedes'], rows, { caption: 'Evidence receipts' })));
  out.push(section('Referenced but missing', missingRefs.length, missingRefs.length ? table(['Receipt id', 'Referenced by'], missingRefs.map((m) => [`<code>${esc(m.id)}</code> ${chip('missing', 'bad')}`, esc(m.by)])) : absent('Every receipt id named by a screen state exists.')));
  return out.join('\n');
}

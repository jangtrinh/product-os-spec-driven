import { esc, chip, absent, section, table, pageLink, stateChip, ratio, stateAnchor, acAnchor } from './html.mjs';
import { ledgerMeasures, LEDGER_PATH } from '../../lib/source-ledger-load.mjs';

/* Source ledger view (D14). Three measures stay apart: source preservation, typed mapping and demonstrated coverage. Their numerators
   are never added, averaged or shown as one headline. Each legacy item shows its immutable key AND its original spelling from the crosswalk. */
/* A mapped target links only when this spec really has it; an unknown target is stated, never a dead link. */
const targetLink = (m, ctx) => {
  const unresolved = () => `${esc(m.id)} ${chip('not in this spec', 'bad')}`;
  if (m.kind === 'ac') return ctx.stories.some((s) => s.acs.some((a) => a.qid === m.id)) ? pageLink('qa-view', m.id, acAnchor(m.id)) : unresolved();
  if (m.kind === 'scenario') { const us = m.id.split('.')[0]; return ctx.stories.some((s) => s.id === us && s.scenarios.some((x) => x.qid === m.id)) ? pageLink(`dev-${us.toLowerCase()}`, m.id) : unresolved(); }
  if (m.kind === 'screen-state') return ctx.screens.rows.some((r) => r.key === m.id) ? pageLink('design-view', m.id, stateAnchor(m.id)) : unresolved();
  return esc(m.id);
};

const measure = (title, declared, recomputed, key, note) => `<div class="measure"><h3>${esc(title)}</h3>
<p class="measure-num">${recomputed ? esc(ratio(recomputed[key], recomputed.total)) : declared ? esc(ratio(declared[key], declared.total)) : '—'}</p>
<p class="muted">${declared ? `Declared in the ledger: ${esc(ratio(declared[key], declared.total))}.` : 'No declared figure.'} ${esc(note)}</p></div>`;

export function buildSourceLedger(ctx) {
  const L = ctx.sourceLedger;
  if (!L.declared) return absent(`No source ledger declared. A spec that preserves a numbered source (for example source acceptance criteria) ships ${LEDGER_PATH}; this spec does not, so no source-preservation figure is shown and none is implied.`);
  const out = [];
  if (L.errors.length) out.push(`<div class="callout tone-warning" role="alert"><div class="callout-label">Ledger problems</div><ul>${L.errors.slice(0, 20).map((e) => `<li><code>${esc(e.at)}</code> ${esc(e.message)}</li>`).join('')}</ul></div>`);
  if (!L.ledger) return out.join('\n') + absent('The ledger file could not be read, so no item is shown.');
  const m = ledgerMeasures(L);
  out.push(`<p>Validation: ${esc(L.validatedBy)}. The three measures below use separate inventories; equal numbers would still mean different things.</p>`);
  out.push(`<div class="measures">${measure('Source preservation', m.source.declared, m.source.recomputed, 'preserved', 'Items kept with their own id, digest and source line.')}${measure('Typed mapping', m.typed.declared, m.typed.recomputed, 'mapped', 'Items that map to at least one typed spec item.')}${measure('Demonstrated coverage', m.demo.declared, null, 'passed', 'Needs executed evidence; the reader does not recompute it.')}</div>`);
  out.push(section('By mapping status', '', table(['Status', 'Items'], Object.entries(m.byStatus).map(([k, v]) => [stateChip(k), esc(v)]))));
  const rows = L.ledger.items.map((it) => ({ id: `src-${it.id.toLowerCase()}`, cells: [
    `<code>${esc(it.id)}</code>`,
    it.legacy ? `<code>${esc(it.legacy.legacy_id)}</code> <span class="muted">${esc(it.legacy.family)} → ${esc(it.legacy.canonical_id)}</span>` : it.joinError ? chip(it.joinError, 'bad') : '—',
    it.source ? `${esc(it.source.file)}:${esc(it.source.line)}` : chip('no source line', 'bad'), it.text_sha256 ? `<code>${esc(it.text_sha256.slice(0, 12))}…</code>` : chip('no digest', 'bad'), stateChip(it.status),
    it.mappings.length ? it.mappings.map((x) => targetLink(x, ctx)).join(', ') : chip('no typed target', it.status === 'no-demo' ? 'warn' : 'bad'), esc(it.reason || '—'),
  ] }));
  out.push(section('Source items', rows.length, table(['Key', 'Original spelling', 'Source', 'Text digest', 'Status', 'Mapped to', 'Reason'], rows, { caption: 'Source items' })));
  return out.join('\n');
}

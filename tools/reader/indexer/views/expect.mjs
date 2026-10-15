/* What the rendered views MUST disclose, derived from the same data. verify.mjs checks that each text is on its page, so a view that
   hides a missing, retired, stale, not-created or unverified state turns the disclosure check red. */
export function buildExpect({ screens, evidence, missingRefs, sourceLedger, coverage, openAll, design }) {
  const out = [];
  const add = (page, text) => out.push({ page, text });
  for (const r of screens.rows) {
    add('design-view', r.source.label);
    if (r.source.snapshotDenied) add('design-view', 'snapshot denied');
    if (!r.evidence.length) add('design-view', 'no evidence');
    if (!r.coded.length && !r.boards.length) add('design-view', 'no image');
    if (!r.selectors.length) add('design-view', 'no selectors');
  }
  for (const m of missingRefs) add('design-view', 'receipt missing');
  if (missingRefs.length) add('evidence-view', 'missing');
  for (const r of evidence.receipts) { if (r.freshness !== 'CURRENT') add('evidence-view', r.freshness); if (r.exit === null) add('evidence-view', 'not executed'); }
  if (!evidence.receipts.length) add('evidence-view', design.declared.gateModel ? 'No receipt is declared' : 'No gate model is declared');
  if (!sourceLedger.declared) add('source-ledger', 'No source ledger declared');
  for (const state of Object.keys(coverage.totals.states)) if (state !== 'passed') add('qa-view', state);
  if (!openAll.length) add('open-items', 'No story carries an OPEN marker');
  if (!design.inventoryDeclared) add('design-view', 'No design inventory is declared');
  add('design-view', design.profile ? 'Design profile and rubric' : 'No design profile is declared');
  return [...new Map(out.map((e) => [`${e.page}|${e.text.toLowerCase()}`, e])).values()];
}

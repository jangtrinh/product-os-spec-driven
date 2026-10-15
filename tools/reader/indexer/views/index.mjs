import { IS_WIREFRAME_PATH } from '../../../lib/resolve.mjs';
import { loadDesignData } from '../design-data.mjs';
import { loadSourceLedger } from '../../lib/source-ledger-load.mjs';
import { buildStories, buildUiRows } from './story-data.mjs';
import { buildEvidence, buildCoverage } from './evidence-model.mjs';
import { buildScreens } from './design-model.mjs';
import { buildPoView } from './po.mjs';
import { buildDevIndex, buildDevPanel } from './dev.mjs';
import { buildQaView } from './qa.mjs';
import { buildOpenItems } from './open.mjs';
import { buildCoverageView } from './coverage.mjs';
import { buildSourceLedger } from './source.mjs';
import { buildDesignView } from './design.mjs';
import { buildExpect } from './expect.mjs';
import { buildEvidenceView } from './evidence.mjs';

export const VIEWS_ARTIFACT = 90;
export const VIEWS_TIER = { id: 'views', name: 'Role views', audience: 'PO · Dev · QA', status: 'Generated', purpose: 'Views generated from the spec files for each role. They hold no authority of their own.' };

const imgRolesOf = (md) => Object.fromEntries([...md.matchAll(/<img [^>]*src="([^"]+)"/g)].map((m) => [m[1], IS_WIREFRAME_PATH.test(m[1]) ? 'not-built' : 'coded']));
const page = (id, title, md, sort, extra = {}) => ({
  id, title, label: title, md, fm: '', rel: `generated/${id}`, artifact: VIEWS_ARTIFACT, tier: 'views', group: '', generated: true, kind: 'view', sort,
  owner: '', status: 'Generated', trace: { a: [], d: [], req: [], us: [], ac: [] }, imgRoles: imgRolesOf(md), ...extra,
});

/* Builds the role-view pages from the same model the linter judges. `pages` are the already link-rewritten source pages. */
export function buildViews({ spec, model, pages, chain, readable, decisions, amendments, date, stages = {} }) {
  const design = loadDesignData(spec);
  const stories = buildStories(model, readable);
  const uiRows = buildUiRows(model);
  const evidence = buildEvidence(design);
  const coverage = buildCoverage(stories, evidence);
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const imageRoles = Object.fromEntries(pages.map((p) => [p.id, p.imgRoles || {}]));
  const deny = ((model.manifest.images && model.manifest.images.deny) || []).map((x) => x.replace(/^\.?\//, ''));
  const screens = buildScreens({ design, stories, uiRows, evidence, chain, deny, imageRoles });
  const group = (rows, keyFn) => rows.reduce((o, r) => { for (const k of keyFn(r)) (o[k] ||= []).push(r); return o; }, {});
  const uiRowsByUs = group(uiRows, (r) => r.us);
  const screensByUs = group(screens.rows, (r) => r.us);
  const openAll = stories.flatMap((s) => s.open.map((o) => ({ ...o, hidden: !!s.hidden }))).sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.us.localeCompare(b.us, 'en', { numeric: true }) || a.line - b.line);
  const boardsById = Object.fromEntries((chain?.boards || []).map((b) => [b.id, b]));
  const missingRefs = screens.rows.flatMap((r) => r.evidence.filter((e) => !e.receipt).map((e) => ({ id: e.id, by: r.key })));
  const sourceLedger = loadSourceLedger(spec.root);
  const ledgerByTarget = new Map();
  for (const it of sourceLedger.ledger?.items || []) for (const m of it.mappings) for (const key of new Set([m.id, m.id.split('.')[0]])) {
    if (!ledgerByTarget.has(key)) ledgerByTarget.set(key, []);
    ledgerByTarget.get(key).push({ item: it, target: m.id });
  }
  const ctx = { spec, model, pages, stages: { wireframe: stages.wireframe || null, prototype: stages.prototypePage ? stages.prototypePage.id : null }, pageById, chain, readable, decisions, amendments, design, stories, storyIds: new Set(stories.map((s) => s.id)), uiRows, uiRowsByUs, screens, screensByUs,
    evidence, coverage, openAll, boardsById, missingRefs, sourceLedger, ledgerByTarget, deny };
  const out = [
    page('po-view', 'Product owner view', buildPoView(ctx), '0-01'),
    page('dev-view', 'Developer view', buildDevIndex(ctx), '0-02'),
    page('qa-view', 'QA view', buildQaView(ctx), '0-03'),
    page('open-items', 'Open items', buildOpenItems(ctx), '0-04'),
    page('coverage', 'Coverage matrix', buildCoverageView(ctx), '0-05'),
    page('design-view', 'Screens and states', buildDesignView(ctx), '0-06'),
    page('evidence-view', 'Evidence receipts', buildEvidenceView(ctx), '0-07'),
    page('source-ledger', 'Source ledger', buildSourceLedger(ctx), '0-08'),
  ];
  stories.forEach((s, i) => out.push(page(`dev-${s.page}`, `${s.id} · ${s.title}`, buildDevPanel(ctx, s), `1-${String(i).padStart(3, '0')}`, { group: 'Developer panels', updated: s.updated })));
  out.forEach((p) => { p.updated = p.updated || date; });
  const expect = buildExpect(ctx);
  const summary = {
    stories: stories.length, ac: coverage.totals.ac, passed: coverage.totals.passed, open: openAll.length, blocking: openAll.filter((o) => o.blocking).length,
    screens: screens.screens.length, screenStates: screens.rows.length, receipts: evidence.receipts.length, missingReceipts: missingRefs.length,
    expect, sourceLedger: sourceLedger.declared ? { items: sourceLedger.ledger?.items.length || 0, errors: sourceLedger.errors.length } : null, designErrors: design.errors,
  };
  return { pages: out, summary };
}

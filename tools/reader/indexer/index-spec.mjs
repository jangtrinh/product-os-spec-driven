import { loadBlockHistory } from '../../lib/block-history.mjs';
import { loadSpec } from '../../lib/spec-load.mjs';
import { buildModel } from '../../lib/doc-model.mjs';
import { INDEX_TIER } from '../../lib/defaults.mjs';
import { makePages, groupRanker } from './pages.mjs';
import { rewriteAll } from './links.mjs';
import { buildChain, buildDecisions, buildAmendments, buildReadable } from './structure-data.mjs';
import { buildRecentChanges } from './recent-changes.mjs';
import { buildViews, VIEWS_ARTIFACT, VIEWS_TIER } from './views/index.mjs';
import { buildStages, STAGES_ARTIFACT, STAGES_TIER } from './design-stages.mjs';
import { projectInfo } from '../lib/project-revision.mjs';

const nat = (a, b) => a.localeCompare(b, 'en', { numeric: true });
const pad2 = (n) => String(n).padStart(2, '0');
const GENERATED = ['start', 'changes-to-read', 'reference-chain', 'amendments', 'decisions', 'dossier'];

/* Reads a spec folder (Spec Format v2) and returns the reader's content: { data, images, htmlBoards, report }.
   It uses the format only; nothing here knows which project the spec belongs to. `lint` (optional) is attached when a render is forced past lint errors. */
export function indexSpec(root, { lint } = {}) {
  const spec = loadSpec(root);
  const model = buildModel(spec);
  const skipped = [];
  const pages = makePages(model);
  const dropped = model.docs.filter((d) => !pages.some((p) => p.rel === d.rel)).map((d) => d.rel);
  const links = rewriteAll(pages, new Set(spec.files));
  const date = model.manifest.date || new Date().toISOString().slice(0, 10);
  const stages = buildStages(pages, spec, date);
  const hasStages = !!(stages.wireframe || stages.prototypePage);
  const chain = buildChain(model, null, skipped);
  const decisions = buildDecisions(model, skipped);
  const amendments = buildAmendments(model, skipped);
  const changes = buildRecentChanges(model.manifest, pages, decisions, amendments);
  const history = loadBlockHistory(spec);
  for (const page of pages) page.blockChanges = history.entries.filter((r) => r.page === page.id && r.date >= changes.since && r.date <= changes.newest);
  const readable = buildReadable(model, pages, skipped);
  const generated = GENERATED.filter((id) => id === 'start' || id === 'changes-to-read' || id === 'dossier' || (id === 'reference-chain' && chain) || (id === 'amendments' && amendments) || (id === 'decisions' && decisions));
  const stubs = generated.map((id) => ({ id, artifact: 0, tier: 'index', group: '', sort: `0-${GENERATED.indexOf(id)}`, layer: '' }));

  const views = buildViews({ spec, model, pages, chain, readable, decisions, amendments, date, stages });
  const build = pages.filter((p) => p.layer !== 'readable').concat(views.pages, stages.prototypePage ? [stages.prototypePage] : []);
  const rank = groupRanker(pages);
  const tiers = [INDEX_TIER, VIEWS_TIER, ...(hasStages ? [STAGES_TIER] : []), ...model.manifest.tiers];
  const tierOrder = tiers.map((t) => t.id);
  const artRank = (p) => (p.artifact === VIEWS_ARTIFACT ? '001' : p.artifact === STAGES_ARTIFACT ? '001a' : String(p.artifact * 2).padStart(3, '0'));
  const key = (p, aud) => [aud ? tierOrder.indexOf(p.tier) : 0, artRank(p), rank(p), p.sort].join('|');
  const all = stubs.concat(build);
  const orderArtifact = [...all].sort((a, b) => nat(key(a, false), key(b, false))).map((p) => p.id);
  const orderAudience = [...all].sort((a, b) => nat(key(a, true), key(b, true))).map((p) => p.id);
  const orderReadable = pages.filter((p) => p.layer === 'readable').sort((a, b) => nat(a.sort, b.sort)).map((p) => p.id);
  const byTierSort = (a, b) => nat(`${a.artifact}|${rank(a)}|${a.sort}`, `${b.artifact}|${rank(b)}|${b.sort}`);
  const firstIn = (list) => ([...list].sort(byTierSort)[0] || {}).id || '';

  const artifactRows = [{ n: 0, name: 'Overview', files: build.filter((p) => p.artifact === 0).length, status: 'Current', exported: true, first: 'start' }].concat(
    [{ n: VIEWS_ARTIFACT, name: 'Role views', files: views.pages.length, status: 'Generated', exported: true, first: 'po-view' }],
    hasStages ? [{ n: STAGES_ARTIFACT, name: STAGES_TIER.name, files: build.filter((p) => p.artifact === STAGES_ARTIFACT).length, status: 'Generated', exported: true, first: stages.wireframe || 'prototype' }] : [],
    model.manifest.artifacts.map((a) => { const own = build.filter((p) => p.artifact === a.n); return { n: a.n, name: a.name, files: own.length, status: a.status || '', exported: own.length > 0, first: firstIn(own) }; }));
  const tierRows = tiers.map((t) => {
    const own = build.filter((p) => p.tier === t.id);
    return { ...t, count: own.length + (t.id === 'index' ? stubs.length : 0) + pages.filter((p) => p.layer === 'readable' && p.tier === t.id).length, first: t.id === 'index' ? 'start' : firstIn(own) };
  });
  const byId = new Map(pages.map((p) => [p.id, p]));
  const readingOrder = ((model.manifest.reading_order) || []).map((r) => ({
    links: r.pages.map((id) => byId.get(String(id).toLowerCase())).filter(Boolean).map((p) => ({ id: p.id, label: p.label })), note: r.note || '',
  })).filter((r) => r.links.length);
  if (!readingOrder.length) skipped.push({ page: 'reading order', reason: 'manifest has no reading_order' });
  if (!model.boardFiles.length) skipped.push({ page: 'wireframe boards', reason: 'no ux/wireframes/png or html board files' });

  const outPages = pages.map(({ imagesDeclared, deny, stem, ...p }) => p).concat(views.pages, stages.prototypePage ? [stages.prototypePage] : []);
  const mermaidBlocks = outPages.reduce((n, p) => n + (p.md.match(/^```mermaid/gm) || []).length, 0);
  const data = {
    format: '2', shellMin: 2, product: 'PRODUCT:OS Spec Driven', views: views.summary, imageDeny: ((model.manifest.images && model.manifest.images.deny) || []).map((x) => x.replace(/^\.?\//, '')), title: model.manifest.title || 'PRODUCT:OS Spec Driven', language: model.manifest.language || '', date: model.manifest.date || new Date().toISOString().slice(0, 10),
    ...(lint && lint.errors ? { lint } : {}),
    source: projectInfo(root, spec.docs), ...(stages.prototype ? { prototype: stages.prototype } : {}),
    pages: outPages, orderArtifact, orderAudience, orderReadable, chain, readable,
    artifacts: artifactRows, tiers: tierRows, decisions, amendments, changes, readingOrder,
    counts: { sourcePages: pages.filter((p) => p.layer !== 'readable').length, pages: outPages.length + generated.length }, generated, skipped,
  };
  const report = {
    pages: data.counts.pages, sourcePages: build.length, readablePages: orderReadable.length, generatedPages: generated, mermaidBlocks, skipped, droppedDocuments: dropped,
    links: { rewritten: links.rewritten, broken: links.broken, brokenList: links.brokenList.slice(0, 30), imagesOk: links.imagesOk, imagesBroken: links.imagesBroken },
    images: { notBuilt: links.notBuilt, wireframeSection: links.wireframeSection, denied: links.denied },
    chain: chain ? chain.totals : null, readable: readable ? { source: readable.source, epics: readable.epics.length, stories: Object.keys(readable.stories).length } : null,
  };
  return { data, images: spec.images, htmlBoards: spec.htmlBoards, dataFiles: [...links.dataFiles].sort(), spec, model, report };
}

import { effectiveManifest } from './manifest.mjs';
import { READABLE_TYPES, READABLE_TIER, ALWAYS_PAGE_IDS, PROTOTYPE_FILE, PROTOTYPE_PAGE } from './defaults.mjs';
import { slug } from './slug.mjs';
import { parseReqs, parseAcTable, parseDecisions, parseAmendments } from './structure.mjs';

const BOARD_FILE = /(^|\/)wireframes\/(png|html)\/(W-\d{2})-[^/]+\.(png|html)$/;

/* One tolerant pass over a loaded spec: documents with their type, tier and artifact, plus every table the format defines.
   The linter judges this model; the indexer turns it into content.json. Nothing here throws on bad content. */
export function buildModel(spec) {
  const manifest = effectiveManifest(spec.manifest);
  const byFolder = new Map(manifest.artifacts.filter((a) => a.folder).map((a) => [a.folder, a]));
  /* A planned artifact (no folder) is adopted by the top-level folder named like its id once documents appear there. */
  const planned = new Map(manifest.artifacts.filter((a) => !a.folder).map((a) => [a.id, a]));
  const docs = spec.docs.map((d) => {
    const fm = d.data || {};
    const type = typeof fm.type === 'string' ? fm.type : '';
    const id = typeof fm.id === 'string' ? fm.id : '';
    const readable = READABLE_TYPES.includes(type);
    const artifact = readable ? null : byFolder.get(d.folder) || (d.folder ? planned.get(d.folder) : null) || null;
    const tier = readable ? READABLE_TIER : fm.tier || manifest.tierByType[type] || 'index';
    return { ...d, fm, type, id, pageId: id.toLowerCase(), readable, artifact, artifactN: artifact ? artifact.n : 0, tier };
  });
  /* Heading ids must never equal a page id (the browser would scroll to the heading): reserve exactly the ids the reader will have
     before any heading is scanned. The data-dependent pages (reference-chain, amendments, decisions) are added once their data is parsed. */
  const reservedIds = [...docs.map((d) => d.pageId).filter(Boolean), ...ALWAYS_PAGE_IDS, ...docs.filter((d) => d.type === 'us' && d.pageId).map((d) => `dev-${d.pageId}`)];
  slug.resetReserved(reservedIds);
  const ofType = (t) => docs.filter((d) => d.type === t);
  const pick = (list) => list.find((d) => d.fm.primary === true) || (list.length === 1 ? list[0] : null);

  const prdDocs = ofType('prd');
  const prd = pick(prdDocs);
  const reqs = prdDocs.flatMap((d) => parseReqs(d).map((r) => ({ ...r, doc: d })));
  const stories = ofType('us').map((d) => ({ doc: d, ac: parseAcTable(d) }));
  const ledger = docs.find((d) => d.fm.ledger === true) || null;
  const decisions = ledger ? parseDecisions(ledger) : [];
  const contractDocs = ofType('contract');
  const withAmend = contractDocs.map((d) => ({ doc: d, amend: parseAmendments(d) })).filter((x) => x.amend.items.length || x.amend.malformed.length);
  const primaryContract = contractDocs.find((d) => d.fm.primary === true) || (withAmend.length === 1 ? withAmend[0].doc : contractDocs.length === 1 ? contractDocs[0] : null);
  const amend = primaryContract ? { doc: primaryContract, ...parseAmendments(primaryContract) } : null;
  if (spec.files.includes(PROTOTYPE_FILE)) reservedIds.push(PROTOTYPE_PAGE);
  if (reqs.length && stories.length) reservedIds.push('reference-chain');
  if (amend && amend.items.length) reservedIds.push('amendments');
  if (ledger && decisions.length) reservedIds.push('decisions');
  slug.reserveIds(reservedIds);

  const boardFiles = [];
  for (const f of [...spec.images, ...spec.htmlBoards]) {
    const m = BOARD_FILE.exec(f);
    if (m) boardFiles.push({ id: m[3], kind: m[2], file: f });
  }
  const boardIds = new Set(boardFiles.map((b) => b.id));
  return { reservedIds, spec, manifest, docs, ofType, prdDocs, prd, reqs, stories, ledger, decisions, contractDocs, withAmend, primaryContract, amend, boardFiles, boardIds };
}

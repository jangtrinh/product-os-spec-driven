/* Defaults that Spec Format v1 applies when spec.manifest.json does not override them. */
export const DEFAULT_TIERS = [
  { id: 'vision', name: 'Vision', audience: 'PO · Stakeholder · Lead', purpose: 'Why the product exists: the brief, the BRD, research and review.' },
  { id: 'scope', name: 'Scope contract', audience: 'Everyone', purpose: 'What is in and what is out, with its dated amendments.' },
  { id: 'backlog', name: 'Backlog', audience: 'PO · Dev · QA', purpose: 'The story index and the parked work, so each wave knows what comes next.' },
  { id: 'release', name: 'Release plan', audience: 'PO · Dev · Delivery', purpose: 'Which wave ships what, in which order, and what each wave depends on.' },
  { id: 'ba', name: 'BA / SRS', audience: 'BA · Dev · QA', purpose: 'The requirements and the user stories with their acceptance criteria.' },
  { id: 'ux', name: 'UX', audience: 'Designer · Dev', purpose: 'User flows, screens and wireframes.' },
  { id: 'build', name: 'Build', audience: 'Dev · Lead', purpose: 'The wave specs handed to builders and the reports they returned.' },
  { id: 'qa', name: 'QA / Evals', audience: 'QA · Reviewer', purpose: 'Design and QA reviews of each wave.' },
  { id: 'decisions', name: 'Decisions', audience: 'Everyone', purpose: 'Owner rulings, open items and the process log. The newest ruling wins.' },
];
export const INDEX_TIER = { id: 'index', name: 'Overview', audience: 'Everyone', status: 'Current', purpose: 'How this spec is organised and where to start reading.' };
export const DEFAULT_TIER_BY_TYPE = {
  overview: 'index', note: 'index', intake: 'vision', contract: 'scope', 'us-index': 'backlog', prd: 'ba', us: 'ba', ux: 'ux', 'ui-contract': 'ux', 'screen-inventory': 'ux', 'change-set': 'build', glossary: 'decisions',
  'wireframe-index': 'ux', build: 'build', review: 'qa', decisions: 'decisions',
};
export const READABLE_TYPES = ['release', 'epic', 'readable-review'];
export const RESERVED_IDS = ['start', 'changes-to-read', 'reference-chain', 'amendments', 'decisions', 'dossier', 'open-items', 'po-view', 'dev-view', 'qa-view', 'coverage'];
/* Pages the reader creates for every spec besides the source documents. The reference-chain, amendments and decisions pages exist only
   when their data does (tools/reader/indexer/structure-data.mjs), and each story gets a dev-<story page> panel; doc-model.mjs adds those. */
/* The click-through prototype is a generated reader page whenever the spec holds this file (tools/reader/indexer/design-stages.mjs). */
export const PROTOTYPE_FILE = 'prototype/index.html';
export const PROTOTYPE_PAGE = 'prototype';
export const ALWAYS_PAGE_IDS = ['start', 'changes-to-read', 'dossier', 'po-view', 'dev-view', 'qa-view', 'open-items', 'coverage', 'design-view', 'evidence-view', 'source-ledger'];
export const NOT_BUILT_NOTE = 'Coded screen not built yet, wireframe shown.';
export const READABLE_TIER = 'readable';

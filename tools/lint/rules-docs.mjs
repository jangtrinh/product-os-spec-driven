import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
import { RESERVED_IDS, READABLE_TYPES } from '../lib/defaults.mjs';
import { headings, unclosedFence } from '../lib/md.mjs';

let SCHEMA;
const get = (o, p) => p.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
const isDate = (s) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };

/* Front matter, identity, placement and body hygiene of every document. */
export function docRules(model, P) {
  SCHEMA = loadSchema('front-matter.schema.json');
  const tierIds = new Set([...model.manifest.tiers.map((t) => t.id), 'index']);
  const ids = new Map();
  for (const d of model.docs) {
    if (d.error) { P.add('D-FRONTMATTER-YAML', d.rel, d.error.line, `front matter cannot be read: ${d.error.message}`, 'fix the YAML between the two --- lines (use plain, "quoted" or [inline, list] values)'); continue; }
    if (!d.data) { P.add('D-FRONTMATTER-MISSING', d.rel, 1, 'document has no front matter', 'start the file with a --- block holding at least id, type, title, updated (see SPEC-FORMAT.md "Front matter")'); continue; }
    for (const v of validate(d.data, SCHEMA)) {
      const line = frontMatterLine(d, v.path);
      P.add('D-FRONTMATTER-SCHEMA', d.rel, line, `front matter field ${v.path} ${v.message}`, `correct "${v.path.split(/[.[]/)[0]}" (schema: format/schema/front-matter.schema.json)`);
    }
    if (typeof d.fm.updated === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.fm.updated) && !isDate(d.fm.updated)) P.add('D-DATE', d.rel, frontMatterLine(d, 'updated'), `"${d.fm.updated}" is not a real calendar date`, 'write a real date as YYYY-MM-DD');
    for (const req of SCHEMA['x-required-by-type']?.[d.type] || []) {
      const v = get(d.fm, req);
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) P.add('D-FIELD-REQUIRED', d.rel, 1, `type "${d.type}" requires front matter field ${req}`, `add "${req.split('.')[0]}" to the front matter`);
    }
    for (const [field, types] of Object.entries(SCHEMA['x-fields-for-types'] || {})) {
      if (field in d.fm && d.type && !types.includes(d.type)) P.add('D-FIELD-TYPE', d.rel, frontMatterLine(d, field), `field "${field}" is only valid on type ${types.join(' or ')}, this document is "${d.type}"`, `remove "${field}" or change the type`);
    }
    if (d.id) {
      const key = d.id.toLowerCase();
      if (RESERVED_IDS.includes(key)) P.add('D-ID-RESERVED', d.rel, frontMatterLine(d, 'id'), `id "${d.id}" is reserved for a generated reader page`, `pick another id (reserved: ${RESERVED_IDS.join(', ')})`);
      if (ids.has(key)) P.add('D-ID-DUP', d.rel, frontMatterLine(d, 'id'), `id "${d.id}" is already used by ${ids.get(key)}`, 'every document id must be unique (compared without case)');
      else ids.set(key, d.rel);
    }
    if (d.type === 'us') {
      if (!/^(US-(\d+|P\d+)|NF-\d+)$/.test(d.id)) P.add('D-US-ID', d.rel, frontMatterLine(d, 'id'), `story id "${d.id}" is not US-<n>, US-P<n> or NF-<n>`, 'rename the id, e.g. US-16 or NF-03');
      else if (d.stem !== d.id) P.add('D-US-FILENAME', d.rel, 1, `file name ${d.stem}.md must equal the story id ${d.id}`, `rename the file to ${d.id}.md`);
    }
    if (d.fm.tier && !tierIds.has(d.fm.tier)) P.add('D-TIER', d.rel, frontMatterLine(d, 'tier'), `tier "${d.fm.tier}" is not in the manifest`, `use one of: ${[...tierIds].join(', ')}`);
    placement(d, model, P);
    h1Rule(d, P);
    const open = unclosedFence(d.body);
    if (open >= 0) P.add('D-FENCE', d.rel, d.bodyLine + open, 'a fenced code block (``` or ~~~) is never closed', 'add the closing fence; an open fence hides the rest of the page');
  }
}

/* 1-based file line of a front matter key, found by scanning the raw text; falls back to line 2. */
export function frontMatterLine(d, pathStr) {
  const key = pathStr.split(/[.[]/)[0];
  const lines = d.raw.split('\n');
  for (let i = 1; i < Math.min(lines.length, d.bodyLine); i += 1) if (new RegExp(`^${key}\\s*:`).test(lines[i])) return i + 1;
  return 2;
}

function placement(d, model, P) {
  if (!d.type) return;
  if (d.readable) return;
  // This literal stage-owned note also works in an upgraded bundle whose approved
  // intake manifest predates the stage; the wireframe rules validate its contents.
  if (d.type === 'note' && d.rel === 'wireframe/wireframes.md') return;
  if (!d.folder) {
    if (!['overview', 'note', 'glossary'].includes(d.type)) P.add('D-PLACEMENT', d.rel, 1, `a "${d.type}" document sits at the spec root`, 'move it into the folder of its artifact (the manifest lists the folders); only type overview or note may sit at the root');
    return;
  }
  if (!d.artifact) P.add('D-PLACEMENT', d.rel, 1, `folder "${d.folder}/" is not an artifact folder in spec.manifest.json`, `add { "id": "...", "name": "...", "folder": "${d.folder}" } to artifacts, or move the file${READABLE_TYPES.includes(d.type) ? '' : ''}`);
}

function h1Rule(d, P) {
  const h1 = headings(d.body).filter((h) => h.level === 1);
  for (const h of h1) {
    if (d.type === 'contract' && /^Amendment\b/.test(h.text)) continue;
    P.add('D-H1', d.rel, d.bodyLine + h.line, `body has an H1 ("${h.text.slice(0, 50)}"); the title lives in the front matter`, d.type === 'contract' ? 'use ## headings (only "# Amendment ..." may be an H1 in a contract)' : 'change it to ## or delete it');
  }
}

import { documentAnchors } from '../lib/document-anchors.mjs';
import { localPath } from '../lib/local-path.mjs';
import path from 'node:path';
import { scanRefs, headings, parseTables, strip } from '../lib/md.mjs';
import { slug } from '../lib/slug.mjs';
import { resolveTarget, IS_WIREFRAME_PATH } from '../lib/resolve.mjs';
import { createEpicMapChecker } from '../lib/epic-map-core.mjs';
import { separateDirectGroups } from '../lib/direct-readable-groups.mjs';
import { frontMatterLine } from './rules-docs.mjs';

/* Links, images and the manifest reading order: every target must exist, stay inside the spec folder and obey the image rule. */
export function linkRules(model, P) {
  const { spec } = model;
  const files = new Set(spec.files);
  const headIds = new Map(model.docs.map(d=>[d.rel,documentAnchors(d,model.glossaryEntries || [])]));
  const deny = ((model.manifest.images && model.manifest.images.deny) || []).map((x) => x.replace(/^\.?\//, ''));
  for (const d of model.docs) {
    if (!d.data) continue;
    const declared = new Map();
    for (const im of d.fm.images || []) {
      const r = resolveTarget(d.rel, im.src);
      if (r.kind !== 'file' || !files.has(r.rel)) P.add('L-IMG-DECLARED', d.rel, frontMatterLine(d, 'images'), `images[] lists ${im.src}, which is not a file inside the spec folder`, 'fix the path (relative to this document) or remove the entry');
      else {
        declared.set(r.rel, im);
        const wf = IS_WIREFRAME_PATH.test(r.rel);
        if ((im.role === 'wireframe') !== wf) P.add('L-IMG-ROLE', d.rel, frontMatterLine(d, 'images'), `${im.src} is declared role ${im.role}, but ${wf ? 'it lives in a wireframes/ folder' : 'it is not in a wireframes/ folder'}`, wf ? 'set role: wireframe' : 'set role: coded or move the file');
      }
    }
    for (const ref of scanRefs(d.body)) {
      const line = d.bodyLine + ref.line;
      const r = resolveTarget(d.rel, ref.target);
      if (r.kind === 'external') { if (ref.kind === 'image') P.add('L-IMG-OUTSIDE', d.rel, line, 'remote images are forbidden', 'copy the image into the bundle'); else if (!/^(https?:|mailto:)/i.test(ref.target)) P.add('L-LINK-OUTSIDE', d.rel, line, 'unsupported URI scheme', 'use a local link or HTTP(S)/mailto'); continue; }
      if (ref.kind === 'image') { imageRule(d, ref, r, line, files, declared, deny, P); continue; }
      if (r.kind === 'outside') { P.add('L-LINK-OUTSIDE', d.rel, line, `link ${ref.target} leaves the spec folder`, 'link only to files inside the spec folder'); continue; }
      if (r.kind === 'anchor') {
        if (r.frag && !headIds.get(d.rel).has(r.frag) && !headIds.get(d.rel).has(slug.slugify(r.frag))) P.add('L-LINK-ANCHOR', d.rel, line, `anchor #${r.frag} matches no heading in this document`, `use the heading slug; headings here: ${[...headIds.get(d.rel)].slice(0, 6).join(', ')}${headIds.get(d.rel).size > 6 ? ', ...' : ''}`);
        continue;
      }
      if (!files.has(r.rel)) { P.add('L-LINK-DEAD', d.rel, line, `link target ${ref.target} does not exist (resolved to ${r.rel})`, 'fix the relative path, or remove the link'); continue; }
      try{localPath(spec.root,r.rel);}catch(e){P.add('L-LINK-OUTSIDE',d.rel,line,e.message,'use a readable target inside the bundle');continue;}
      if (r.rel.endsWith('.md') && r.frag) {
        const tid = headIds.get(r.rel);
        if (tid && !tid.has(r.frag) && !tid.has(slug.slugify(r.frag))) P.add('L-LINK-FRAGMENT', d.rel, line, `${r.rel} has no heading "#${r.frag}"`, `use one of its heading slugs${tid.size ? `: ${[...tid].slice(0, 6).join(', ')}` : ''}`);
      }
    }
  }
  for (const item of (model.manifest.reading_order || [])) for (const id of item.pages) if (!byId(model, id)) P.add('L-READING-ORDER', 'spec.manifest.json', 1, `reading_order lists "${id}", which is not a document id`, 'use a document id (front matter id)');
}

const byId = (model, id) => model.docs.find((d) => d.id && d.id.toLowerCase() === String(id).toLowerCase());

function imageRule(d, ref, r, line, files, declared, deny, P) {
  if (r.kind === 'outside') { P.add('L-IMG-OUTSIDE', d.rel, line, `image ${ref.target} is outside the spec folder`, 'copy the image under assets/ (or next to the document) and link that copy'); return; }
  if (r.kind === 'anchor') return;
  if (!files.has(r.rel)) { P.add('L-IMG-MISSING', d.rel, line, `image ${ref.target} does not exist (resolved to ${r.rel})`, 'fix the path or add the file'); return; }
  if (deny.some((x) => r.rel === x || r.rel.endsWith(`/${x}`))) P.add('L-IMG-DENIED', d.rel, line, `image ${r.rel} is on the manifest deny list`, 'use a newer capture, or remove the image');
  if (IS_WIREFRAME_PATH.test(r.rel) && d.fm.wireframe !== true) {
    const decl = declared.get(r.rel);
    if (!decl || decl.role !== 'wireframe' || !decl.reason) P.add('L-IMG-WIREFRAME', d.rel, line, `wireframe image ${r.rel} appears in a document that is not a wireframe page`, 'show the coded screen instead, or declare it in front matter images: [{ src, role: wireframe, reason: "<why the coded screen does not exist yet>" }]');
  }
}

/* Readable layer: epic pages, release page and epic-map.json agree with the build spec. Reuses the same check as scripts/check-epic-map.mjs. */
export function readableRules(model, P) {
  const { spec } = model;
  const readable = model.docs.filter((d) => d.readable);
  if (!readable.length && !spec.epicMapPath) return;
  const mapDir = spec.epicMapPath ? path.posix.dirname(spec.epicMapPath) : 'readable';
  if (readable.length && !spec.epicMapPath) { P.add('R-EPIC-MAP', readable[0].rel, 1, 'readable documents exist but there is no readable/epic-map.json', 'add readable/epic-map.json (see format/SPEC-FORMAT-v2.md "Readable layer")'); return; }
  for (const d of readable) if (path.posix.dirname(d.rel) !== mapDir) P.add('R-PLACEMENT', d.rel, 1, `readable document ${d.rel} is not in ${mapDir}/ next to epic-map.json`, `move it to ${mapDir}/`);
  if (spec.epicMapError) { P.add('R-EPIC-MAP', spec.epicMapPath, 1, spec.epicMapError, 'fix the JSON'); return; }
  const map = spec.epicMap;
  if (!map || !Array.isArray(map.epics)) { P.add('R-EPIC-MAP', spec.epicMapPath, 1, 'epic-map.json has no "epics" list', 'follow the shape in SPEC-FORMAT.md "Readable layer"'); return; }
  const cfg = model.manifest.readable || {};
  const user = { ...(cfg.check || {}), ...(cfg.epics ? { epics: cfg.epics } : {}), ...(cfg.capabilities ? { capabilities: cfg.capabilities } : {}), build: { storyId: '\\b(?:US|NF)-[0-9P]+\\b', reqId: 'REQ-\\d+' }, prunePage: model.ofType('readable-review').length ? 'present' : null };
  const checker = createEpicMapChecker(user, spec.root);
  const reqOf = Object.fromEntries(model.stories.map((s) => [s.doc.id, [...new Set((s.doc.fm.trace && s.doc.fm.trace.req) || [])].sort()]));
  const build = { storyIds: model.stories.map((s) => s.doc.id), reqIds: new Set(model.reqs.map((r) => r.id)), reqOf };
  build.groupOf = Object.fromEntries(model.stories.map(s => [s.doc.id, /^(BRD-\d+)\b/.exec(s.doc.fm.epic || '')?.[1]]));
  const grouped = separateDirectGroups(map, build, cfg.direct_groups || []);
  const page = (name) => readable.find((d) => d.rel === `${mapDir}/${name}`);
  const docs = { pages: {}, release: (model.ofType('release')[0] || {}).body ?? null, prune: (model.ofType('readable-review')[0] || {}).body ?? null };
  for (const e of map.epics) if (e.page) docs.pages[e.id] = (page(e.page) || {}).body ?? null;
  for (const msg of [...grouped.errors, ...checker.check(grouped.map, grouped.build, docs)]) {
    const epic = map.epics.find((e) => msg.startsWith(`${e.id}:`) || (e.capabilities || []).some((c) => msg.startsWith(`${c.id}:`)));
    const target = epic && epic.page ? page(epic.page) : /^release/.test(msg) ? model.ofType('release')[0] : null;
    const words = /lacks section|block lacks|Scope table lacks|lacks "/.test(msg);
    P.add('R-READABLE', target ? target.rel : spec.epicMapPath, 1, msg, words ? 'write that heading, or tell the check which words your spec uses with spec.manifest.json readable.check.sections (keys: page, block, release, scope, releaseScope, buildDetail); see SPEC-FORMAT.md "Readable layer"' : 'see format/SPEC-FORMAT-v2.md "Readable layer" for the shape every epic page, release page and capability block must have');
  }
}

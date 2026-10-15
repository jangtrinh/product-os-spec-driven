import path from 'node:path';
import { slug } from '../../lib/slug.mjs';
import { resolveTarget, IS_WIREFRAME_PATH } from '../../lib/resolve.mjs';
import { NOT_BUILT_NOTE } from '../../lib/defaults.mjs';

/* Turns relative links and image paths of every page into reader targets:
   .md links -> "#<page id>" or "#<page id>.<heading id>"; images -> "images/<spec-root-relative path>"; html boards -> "wireframes/html/<file>".
   A link that cannot be resolved renders as its label and is counted (the linter reports the same problem with file:line). */
/* The reader gives a ledger/table row the id `<page id>.<first cell lowercased>` when the first cell looks like this
   (tools/reader/shell-src/js/02-markdown.js ROW_ID; a test compares both patterns). */
export const ROW_ID = /^(D\d+|REQ-\d+|A-\d+|A\d+-\d+|AC-\d+|SC-\d+|BR-\d+|C-\d+)$/;

/* Ids of the table rows the reader can scroll to: rows outside code fences whose first cell matches ROW_ID. */
function tableRowIds(md) {
  const ids = [];
  let fence = false;
  for (const line of String(md).split('\n')) {
    if (/^ {0,3}(```|~~~)/.test(line)) { fence = !fence; continue; }
    const cell = !fence && /^\s*\|\s*([^|]*?)\s*\|/.exec(line);
    if (cell && ROW_ID.test(cell[1])) ids.push(cell[1].toLowerCase());
  }
  return ids;
}

export function rewriteAll(pages, files) {
  const byRel = new Map(pages.map((p) => [p.rel, p]));
  const heads = new Map(pages.map((p) => [p.id, new Set(slug.scanHeadings(p.md).map((h) => h.id))]));
  const rows = new Map(pages.map((p) => [p.id, new Set(tableRowIds(p.md))]));
  const total = { rewritten: 0, broken: 0, imagesOk: 0, imagesBroken: 0, brokenList: [], notBuilt: [], wireframeSection: 0, denied: [], dataFiles: new Set() };
  for (const p of pages) {
    const r = rewritePage(p, byRel, heads, rows, files);
    p.md = r.md;
    if (r.lineMap.some((from, i) => from !== i)) p.src.map = r.lineMap.map((from) => p.src.first + from);
    p.imgRoles = r.imgRoles;
    for (const k of ['rewritten', 'broken', 'imagesOk', 'imagesBroken', 'wireframeSection']) total[k] += r.stats[k];
    for (const k of ['brokenList', 'notBuilt', 'denied']) total[k] = total[k].concat(r.stats[k]);
    r.stats.dataFiles.forEach((f) => total.dataFiles.add(f));
  }
  return total;
}

function rewritePage(page, byRel, heads, rows, files) {
  const stats = { rewritten: 0, broken: 0, imagesOk: 0, imagesBroken: 0, wireframeSection: 0, brokenList: [], notBuilt: [], denied: [], dataFiles: [] };
  const imgRoles = {};
  const hold = [];
  const keep = (s) => { hold.push(s); return `\u0001${hold.length - 1}\u0001`; };
  const declared = new Map((page.imagesDeclared || []).map((im) => [im.rel, im]));
  const deny = page.deny || [];
  const toHash = (hit, frag) => {
    const raw = frag ? frag.replace(/^#/, '') : '';
    const f = raw ? slug.slugify(raw) : '';
    if (f && heads.get(hit.id).has(f)) return `#${hit.id}.${f}`;
    /* `<page id>.<row id>` is how lint names a table row; the reader scrolls to the row element `<page id>.<row id lowercased>`. */
    const row = raw.slice(hit.id.length + 1);
    if (raw.toLowerCase().startsWith(`${hit.id}.`) && ROW_ID.test(row) && rows.get(hit.id).has(row.toLowerCase())) return `#${hit.id}.${row.toLowerCase()}`;
    return `#${hit.id}`;
  };
  let fence = false;
  const convertLine = (line) => {
    if (/^ {0,3}(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    let s = line.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (all, alt, target) => {
      const r = resolveTarget(page.rel, target);
      if (r.kind === 'external') return all;
      if (r.kind !== 'file' || !files.has(r.rel)) { stats.imagesBroken += 1; return keep(`*[Image not in this spec: ${alt || target}]*`); }
      stats.imagesOk += 1;
      const to = `images/${r.rel}`;
      if (deny.some((x) => r.rel === x || r.rel.endsWith(`/${x}`))) stats.denied.push({ page: page.rel, image: r.rel });
      if (!IS_WIREFRAME_PATH.test(r.rel)) { imgRoles[to] = 'coded'; return keep(`![${alt}](${to})`); }
      if (page.wireframe) { imgRoles[to] = 'section'; stats.wireframeSection += 1; return keep(`![${alt}](${to})`); }
      const reason = (declared.get(r.rel) || {}).reason || 'No coded capture of this screen exists yet.';
      imgRoles[to] = 'not-built';
      stats.notBuilt.push({ page: page.rel, image: path.posix.basename(r.rel), reason });
      return keep(`![${alt} (${NOT_BUILT_NOTE})](${to})\n\n*${NOT_BUILT_NOTE} ${reason}*`);
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (all, label, target) => {
      const r = resolveTarget(page.rel, target);
      if (r.kind === 'external') return keep(all);
      if (r.kind === 'anchor') return keep(all);
      const miss = () => { stats.broken += 1; stats.brokenList.push(`${page.rel}: ${target}`); return keep(label); };
      if (r.kind !== 'file' || !files.has(r.rel)) return miss();
      if (r.rel.endsWith('.md')) {
        const hit = byRel.get(r.rel);
        if (!hit) return miss();
        stats.rewritten += 1;
        return keep(`[${label}](${toHash(hit, r.frag)})`);
      }
      if (/\/wireframes\/html\/[^/]+\.html$/.test(r.rel)) { stats.rewritten += 1; return keep(`[${label}](wireframes/html/${path.posix.basename(r.rel)})`); }
      if (/\.(png|jpe?g|gif|svg|webp)$/i.test(r.rel)) { stats.rewritten += 1; return keep(`[${label}](images/${r.rel})`); }
      if (/\.(json|jsonl|csv|txt|ya?ml)$/i.test(r.rel)) { stats.rewritten += 1; stats.dataFiles.push(r.rel); return keep(`[${label}](files/${r.rel})`); }
      return miss();
    });
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => hold[+i]);
  };
  /* lineMap[k] = the source line (0-based, inside the body) that produced output line k: a replacement may add lines. */
  const lineMap = [];
  const out = page.md.split('\n').map((line, i) => {
    const converted = convertLine(line);
    for (let n = converted.split('\n').length; n > 0; n -= 1) lineMap.push(i);
    return converted;
  });
  return { md: out.join('\n'), stats, imgRoles, lineMap };
}

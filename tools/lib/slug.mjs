import { outsideLines } from './markdown-outside.mjs';
/* Shared by the generator (evaluated in Node) and the reader (concatenated into the page script).
   Plain function declarations only: no imports, no DOM. */
function fold(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

/* Markdown inline syntax to plain text (links keep their label, code keeps its content). */
function plainInline(md) {
  return String(md)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\\([\\`*_{}\[\]()#+\-.!|])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Hash tokens may only hold letters, digits and . _ ~ - ; the dot separates page and section, so slugs never contain one. */
function slugify(text) {
  const s = fold(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '');
  return s || 'section';
}

/* Page ids must never be reused as heading ids: the browser would scroll to the heading when a page opens. */
const RESERVED = {};
function reserveIds(ids) { ids.forEach((i) => { RESERVED[i] = true; }); }
/* Each model build owns its reservations: nothing from an earlier spec may leak into the next. */
function resetReserved(ids) { Object.keys(RESERVED).forEach((i) => { delete RESERVED[i]; }); reserveIds(ids); }

function uniqueSlug(base, seen) {
  let id = base;
  let n = 1;
  while (seen[id] || RESERVED[id]) { n += 1; id = base + '-' + n; }
  seen[id] = true;
  return id;
}

/* Headings of a markdown body, outside code fences, in document order, with the same ids the renderer assigns. */
function scanHeadings(md) {
  const out = [];
  const seen = {};
  let fence = null;
  const lines = outsideLines(String(md));
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0].repeat(f[1].length);
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const m = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (!m) continue;
    const text = plainInline(m[2]);
    out.push({ level: m[1].length, text, id: uniqueSlug(slugify(text), seen), line: i });
  }
  return out;
}

export const slug = {fold, plainInline, slugify, uniqueSlug, scanHeadings, reserveIds, resetReserved};

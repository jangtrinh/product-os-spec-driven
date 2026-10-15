import { headings,parseTables,strip } from './md.mjs';
export function documentAnchors(doc,entries=[]) {
  const rows=parseTables(doc.body).flatMap(t=>t.rows.map(r=>strip(r[0]))).filter(id=>/^[A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*$/.test(id));
  return new Set([...headings(doc.body).map(h=>h.id),...rows.map(id=>`${doc.pageId}.${id}`),...entries.filter(e=>e.doc===doc && e.anchor).map(e=>e.anchor)]);
}

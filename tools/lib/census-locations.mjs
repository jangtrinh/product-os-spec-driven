import {parseTables, strip,headings} from './md.mjs';
import {outsideLines} from './markdown-outside.mjs';
import {proseLines} from './markdown-prose.mjs';
import {markdownReferenceTokens} from './census-markdown-references.mjs';

export function pathLocations(data, path, context = {}) {
  const steps = path.match(/[^.\[\]{}]+|\[\*\]|\[\]|\{(?:key|value)\}/g) ?? [];
  if (steps.join('.').replaceAll('.[*]', '[*]').replaceAll('.[]', '[]').replaceAll('.{', '{') !== path) throw Error(`Unsupported registry path: ${path}`);
  const walk = (value, at, ctx) => {
    if (at === steps.length) return [{value, ...ctx}];
    const step = steps[at];
    if (value === undefined || value === null) return [];
    if (step === '[*]' || step === '[]') {
      if (!Array.isArray(value)) throw Error(`Expected array at ${path}`);
      return value.flatMap((v, i) => walk(v, at + 1, {...ctx, owner: typeof v === 'object' && v !== null ? v : ctx.owner, ancestors: typeof v === 'object' && v !== null ? [...ctx.ancestors, v] : ctx.ancestors, index: i}));
    }
    if (['*', '{key}', '{value}'].includes(step)) {
      if (typeof value !== 'object' || Array.isArray(value)) throw Error(`Expected map at ${path}`);
      return Object.entries(value).flatMap(([key, v]) => walk(step === '{key}' ? key : v, at + 1, {...ctx, key, owner: v}));
    }
    return walk(value[step], at + 1, ctx);
  };
  return walk(data, 0, {owner: data, root: data, ancestors: [data], ...context});
}

export {schemaLocations} from './census-schema-locations.mjs';

export function bodyLocations(entry, doc) {
  const location = entry.location;
  // Tables retain inline code ids; fenced examples and HTML comments cannot declare references.
  const lines = outsideLines(doc.body ?? '').map(line => line.replace(/<!--.*?-->/g, ''));
  const headingAt = index => lines.slice(0, index + 1).findLast(line => /^#{1,6}\s/.test(line)) ?? '';
  if (location.kind === 'body-table') return parseTables(lines.join('\n')).flatMap(table => {
    if (location.heading !== '*' && !new RegExp(location.heading).test(headingAt(table.line))) return [];
    const columns = table.header.map((h, i) => new RegExp(`^(?:${location.column})$`, 'i').test(strip(h)) ? i : -1).filter(i => i >= 0);
    return table.rows.flatMap((row, index) => columns.flatMap(column => {
      const cell = strip(row[column] ?? '');
      return [...cell.matchAll(new RegExp(location.pattern, 'g'))].map(match => ({value: match[0], row, header: table.header, heading: headingAt(table.rowLines[index]), owner: row, match}));
    }));
  });
  const body = ['body-document-link', 'body-image', 'body-wireframe-link'].includes(entry.id) ? markdownReferenceTokens(doc.body ?? '').map(ref => ref.token) : proseLines(doc.body ?? '');
  const anchors=new Map(headings(doc.body??'').map(h=>[h.line,h.id]));
  return body.flatMap((line,index) => [...line.matchAll(new RegExp(location.pattern, 'g'))].map(match => ({value: match[Number(location.capture ?? (match[1] ? 1 : 0))], match, heading: line, anchor:anchors.get(index),owner: doc.fm ?? {}})));
}

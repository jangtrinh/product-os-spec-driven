/* Small YAML subset reader for Spec Format v1 front matter. Supports: block maps, block lists (scalars or maps),
   inline [a, b] and {a: b} collections, quoted and plain scalars, # comments, null/true/false/numbers.
   Anything else (anchors, multi-line scalars, tabs) throws an error that carries the line number. */
export class YamlError extends Error {
  constructor(message, line) { super(message); this.line = line; }
}

const stripComment = (s) => {
  let q = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) { if (c === '\\' && q === '"') i += 1; else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
};

function scalar(raw, line) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s[0] === '"') {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) throw new YamlError(`unterminated double-quoted string: ${s.slice(0, 40)}`, line);
    return JSON.parse(s);
  }
  if (s[0] === "'") {
    if (!/^'(?:[^']|'')*'$/.test(s)) throw new YamlError(`unterminated single-quoted string: ${s.slice(0, 40)}`, line);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s[0] === '[' || s[0] === '{') return inline(s, line);
  if (/^[&*!|>]/.test(s)) throw new YamlError(`unsupported YAML construct "${s[0]}" (use plain, quoted, [..] or {..} values)`, line);
  return s;
}

function splitTop(s, line) {
  const parts = [];
  let depth = 0; let q = ''; let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\' && q === '"') { cur += s[i + 1] || ''; i += 1; } else if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '[' || c === '{') depth += 1;
    if (c === ']' || c === '}') depth -= 1;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (q || depth !== 0) throw new YamlError('unbalanced quotes or brackets in an inline value', line);
  if (cur.trim() !== '') parts.push(cur);
  return parts;
}

function inline(s, line) {
  const open = s[0]; const close = open === '[' ? ']' : '}';
  if (s[s.length - 1] !== close) throw new YamlError(`inline ${open === '[' ? 'list' : 'map'} is not closed with ${close}`, line);
  const inner = s.slice(1, -1);
  if (open === '[') return splitTop(inner, line).map((p) => scalar(p, line));
  const out = {};
  for (const p of splitTop(inner, line)) {
    const m = /^\s*("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/.exec(p);
    if (!m) throw new YamlError(`inline map entry needs "key: value": ${p.trim().slice(0, 40)}`, line);
    const key = scalar(m[1], line);
    if (Object.hasOwn(out, key) || key === "__proto__") throw new YamlError(`duplicate or unsafe key "${key}"`, line);
    out[key] = scalar(m[2], line);
  }
  return out;
}

const KEY = /^((?:"[^"]*"|'[^']*'|[A-Za-z0-9_][A-Za-z0-9_.-]*)):(?:\s+(.*)|\s*)$/;

/* lines: [{ n, indent, text }] already stripped of comments and blanks. */
function parseBlock(lines, i, indent) {
  if (i >= lines.length) return [null, i];
  const first = lines[i];
  if (first.indent < indent) return [null, i];
  if (first.text.startsWith('- ') || first.text === '-') return parseList(lines, i, first.indent);
  return parseMap(lines, i, first.indent);
}

function parseMap(lines, i, indent) {
  const out = {};
  while (i < lines.length && lines[i].indent === indent && !lines[i].text.startsWith('- ')) {
    const { n, text } = lines[i];
    const m = KEY.exec(text);
    if (!m) throw new YamlError(`expected "key: value", found: ${text.slice(0, 50)}`, n);
    const key = scalar(m[1], n);
    if (Object.hasOwn(out, key) || key === '__proto__' || key === '<<') throw new YamlError(`duplicate key "${key}"`, n);
    if (m[2] !== undefined && m[2].trim() !== '') { out[key] = scalar(m[2], n); i += 1; continue; }
    i += 1;
    if (i < lines.length && lines[i].indent > indent) { const [v, j] = parseBlock(lines, i, lines[i].indent); out[key] = v; i = j; }
    else if (i < lines.length && lines[i].indent === indent && lines[i].text.startsWith('- ')) { const [v, j] = parseList(lines, i, indent); out[key] = v; i = j; }
    else out[key] = null;
  }
  if (i < lines.length && lines[i].indent > indent) throw new YamlError('unexpected indentation', lines[i].n);
  return [out, i];
}

function parseList(lines, i, indent) {
  const out = [];
  while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith('- ') || lines[i].text === '-')) {
    const { n, text } = lines[i];
    const rest = text === '-' ? '' : text.slice(2).trim();
    if (rest === '') {
      i += 1;
      if (i < lines.length && lines[i].indent > indent) { const [v, j] = parseBlock(lines, i, lines[i].indent); out.push(v); i = j; } else out.push(null);
      continue;
    }
    if (KEY.test(rest) && !/^[\[{]/.test(rest)) {
      const childIndent = indent + 2;
      const sub = [{ n, indent: childIndent, text: rest }];
      i += 1;
      while (i < lines.length && lines[i].indent > indent) { sub.push(lines[i]); i += 1; }
      const [v] = parseMap(sub, 0, childIndent);
      out.push(v);
      continue;
    }
    out.push(scalar(rest, n));
    i += 1;
  }
  return [out, i];
}

export function parseYaml(text, firstLine = 1) {
  const lines = [];
  text.split('\n').forEach((raw, k) => {
    if (/^\t/.test(raw)) throw new YamlError('tab indentation is not allowed, use spaces', firstLine + k);
    const t = stripComment(raw).replace(/\s+$/, '');
    if (!t.trim()) return;
    lines.push({ n: firstLine + k, indent: t.length - t.trimStart().length, text: t.trim() });
  });
  if (!lines.length) return {};
  const [v, i] = parseBlock(lines, 0, lines[0].indent);
  if (i < lines.length) throw new YamlError('unexpected content after the front matter map', lines[i].n);
  return v;
}

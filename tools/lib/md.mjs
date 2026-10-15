import { outsideLines } from './markdown-outside.mjs';
import { slug } from './slug.mjs';

/* Splits one markdown table row into cells, keeping `|` inside code spans and `\|` escapes. */
export function splitRow(line) {
  const cells = [];
  let cur = '';
  let code = 0; /* length of the backtick run that opened the current code span, 0 outside */
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i += 1; continue; }
    if (ch === '`') {
      let n = 1;
      while (s[i + n] === '`') n += 1;
      if (!code) code = n; else if (code === n) code = 0;
      cur += '`'.repeat(n);
      i += n - 1;
      continue;
    }
    if (ch === '|' && !code) { cells.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

/* All GFM tables outside code fences: { header, rows, rowLines, line (0-based index of the header), heading } with the nearest heading above. */
export function parseTables(md) {
  const lines = outsideLines(md);
  const out = [];
  let heading = '';
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    const h = /^#{1,6}\s+(.*)$/.exec(l);
    if (h) { heading = slug.plainInline(h[1]); continue; }
    if (/^\s*\|/.test(l) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] || '') && /-/.test(lines[i + 1])) {
      const header = splitRow(l);
      const rows = [];
      const rowLines = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|/.test(lines[j])) { rows.push(splitRow(lines[j])); rowLines.push(j); j += 1; }
      out.push({ header, rows, rowLines, line: i, heading });
      i = j - 1;
    }
  }
  return out;
}

export const strip = (s) => slug.plainInline(s);

/* Markdown links and images outside fenced code, with 0-based line numbers. Code spans are skipped. */
export function scanRefs(md) {
  const refs = [];
  outsideLines(md).forEach((raw, i) => {
    const line = raw.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
    for (const m of line.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      refs.push({ kind: m[1] ? 'image' : 'link', label: m[2], target: m[3], line: i });
    }
  });
  return refs;
}

/* 0-based line of an unclosed fenced code block, or -1 when all fences are closed. */
export function unclosedFence(md) {
  let open = null; let at = -1;
  md.split('\n').forEach((l, i) => {
    const f = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    if (!f) return;
    if (!open) { open = f[1]; at = i; } else if (f[1][0] === open[0] && f[1].length >= open.length && !f[2].trim()) open = null;
  });
  return open ? at : -1;
}

export const headings = (md) => slug.scanHeadings(md);

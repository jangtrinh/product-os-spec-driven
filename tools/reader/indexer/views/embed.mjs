import { headings } from '../../../lib/md.mjs';

/* Source Markdown embedded in a generated (trusted) page must not carry raw HTML: outside code, `<` becomes `&lt;` and HTML comments
   are dropped. Fenced blocks and inline code are left alone because the shell escapes them itself. */
export function neutralizeHtml(md) {
  let fence = null;
  const out = [];
  let comment = false;
  for (const raw of String(md).split('\n')) {
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(raw);
    if (f) { if (!fence) fence = f[1]; else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; out.push(raw); continue; }
    if (fence) { out.push(raw); continue; }
    let line = '';
    for (let i = 0; i < raw.length;) {
      if (comment) { const end = raw.indexOf('-->', i); if (end < 0) { i = raw.length; } else { comment = false; i = end + 3; } continue; }
      if (raw.startsWith('<!--', i)) { comment = true; i += 4; continue; }
      if (raw[i] === '`') {
        const run = /^`+/.exec(raw.slice(i))[0];
        const end = raw.indexOf(run, i + run.length);
        if (end >= 0) { line += raw.slice(i, end + run.length); i = end + run.length; continue; }
      }
      line += raw[i] === '<' ? '&lt;' : raw[i];
      i += 1;
    }
    out.push(line);
  }
  return out.join('\n');
}

/* Text of one numbered H2 section from already link-rewritten page Markdown. */
export function sectionOf(md, number) {
  const heads = headings(md);
  const at = heads.findIndex((h) => h.level === 2 && new RegExp(`^${number}[.\\-:\\s]`).test(h.text));
  if (at < 0) return '';
  const next = heads.slice(at + 1).find((h) => h.level <= 2);
  return md.split('\n').slice(heads[at].line + 1, next ? next.line : undefined).join('\n').trim();
}

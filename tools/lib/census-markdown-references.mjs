import {proseLines} from './markdown-prose.mjs';

const labelKey = label => label.trim().replace(/\s+/g, ' ').toLowerCase();
const decode = text => text.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex ?? decimal, hex ? 16 : 10)));
function closing(text, start, open, close) {
  let depth = 1;
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') {i++; continue;}
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return i;
    if (text[i] === close && depth < 0) break;
  }
  return -1;
}
function destination(text) {
  const trimmed = text.trim();
  return decode(trimmed.startsWith('<') ? trimmed.slice(1, trimmed.indexOf('>')) : trimmed.match(/^(?:\\.|[^\s])+/)?.[0] ?? '');
}
// Resolve inline, reference-style and HTML links into the registry's canonical token grammar.
export function markdownReferenceTokens(body) {
  const lines = proseLines(body), definitions = new Map(), found = [];
  lines.forEach(line => {
    const match = /^ {0,3}\[([^\]]+)\]:\s*(.+)$/.exec(line);
    if (match && !definitions.has(labelKey(match[1]))) definitions.set(labelKey(match[1]), destination(match[2]));
  });
  lines.forEach((line, index) => {
    if (/^ {0,3}\[[^\]]+\]:/.test(line)) return;
    const add = (kind, target) => {if (target) found.push({kind, target, line: index, token: `${kind === 'image' ? '!' : ''}[reference](${target})`});};
    for (let at = 0; at < line.length; at++) {
      if (line[at] === '\\') {at++; continue;}
      if (line[at] !== '[') continue;
      const end = closing(line, at, '[', ']');
      if (end < 0) continue;
      const label = line.slice(at + 1, end), kind = at && line[at - 1] === '!' ? 'image' : 'link';
      let target, next = end + 1;
      if (line[next] === '(') {
        const finish = closing(line, next, '(', ')');
        if (finish >= 0) {target = destination(line.slice(next + 1, finish)); next = finish + 1;}
      } else if (line[next] === '[') {
        const finish = closing(line, next, '[', ']');
        if (finish >= 0) {target = definitions.get(labelKey(line.slice(next + 1, finish) || label)); next = finish + 1;}
      } else target = definitions.get(labelKey(label));
      add(kind, target); at = next - 1;
    }
    for (const match of line.matchAll(/<([a-z][a-z0-9-]*)\b([^<>]*)>/gi)) for (const attr of match[2].matchAll(/\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) add(attr[1].toLowerCase() === 'src' ? 'image' : 'link', decode(attr[2] ?? attr[3] ?? attr[4]));
    for (const match of line.matchAll(/<((?:https?:|mailto:)[^\s<>]+)>/gi)) add('link', decode(match[1]));
  });
  return found;
}

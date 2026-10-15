import {parseJson} from './strict-json.mjs';

// Deliberately bounded YAML 1.2: config maps, sequences, flow collections and
// quoted/plain scalars. Unsupported tags/anchors/merge keys fail explicitly.
export function parseYaml(source, label = 'pipeline.yaml') {
  if (source.trimStart().startsWith('{')) return parseJson(source, label);
  const fail = (line, message) => { throw new Error(`${label}:${line}: ${message}`); };
  function split(text, separator, comment = false) {
    let quote = '', depth = 0, start = 0; const parts = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        if (ch === '\\' && quote === '"') i++;
        else if (ch === quote) {
          if (quote === "'" && text[i + 1] === "'") i++; else quote = '';
        }
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (!depth && ch === separator && (!comment || i === 0 || /\s/.test(text[i - 1]))) {
        parts.push(text.slice(start, i)); start = i + 1;
        if (comment) return parts;
      }
    }
    parts.push(text.slice(start)); return parts;
  }
  function scalar(text, line) {
    text = text.trim();
    if (text.startsWith('[') || text.startsWith('{')) {
      const array = text[0] === '['; const end = array ? ']' : '}';
      if (!text.endsWith(end)) fail(line, 'unclosed flow collection');
      const inner = text.slice(1, -1).trim(); const rows = inner ? split(inner, ',') : [];
      if (array) return rows.map(row => scalar(row, line));
      const result = Object.create(null);
      for (const row of rows) assign(result, row, line);
      return result;
    }
    if (text.startsWith('"')) return parseJson(text, `${label}:${line}`);
    if (text.startsWith("'")) {
      if (!text.endsWith("'")) fail(line, 'unclosed quote');
      return text.slice(1, -1).replaceAll("''", "'");
    }
    if (/^[&*!]|^<<$/.test(text)) fail(line, 'anchors, tags, aliases and merge keys are unsupported');
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === 'null' || text === '~' || text === '') return null;
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
    return text;
  }
  function pair(text, line) {
    const parts = split(text, ':');
    if (parts.length < 2) fail(line, 'expected key: value');
    const key = scalar(parts.shift(), line);
    if (typeof key !== 'string' || !key || key === '<<') fail(line, 'invalid mapping key');
    return [key, parts.join(':').trim()];
  }
  function assign(target, text, line, parsed) {
    const [key, rest] = pair(text, line);
    if (Object.hasOwn(target, key)) fail(line, `duplicate key ${key}`);
    target[key] = parsed === undefined ? scalar(rest, line) : parsed;
  }
  const lines = source.split(/\r?\n/).map((raw, i) => {
    if (/^\s*\t/.test(raw)) fail(i + 1, 'tabs are not indentation');
    const text = split(raw, '#', true)[0].trimEnd();
    return {indent: text.length - text.trimStart().length, text: text.trim(), line: i + 1};
  }).filter(row => row.text && row.text !== '---');
  let at = 0;
  function block(indent) {
    const sequence = lines[at].text.startsWith('- ');
    const result = sequence ? [] : Object.create(null);
    while (at < lines.length && lines[at].indent === indent) {
      const row = lines[at++];
      if (sequence) {
        if (!row.text.startsWith('- ')) fail(row.line, 'mixed map and sequence');
        const rest = row.text.slice(2).trim();
        if (/^[\w-]+:\s/.test(rest)) {
          const item = Object.create(null); assign(item, rest, row.line);
          if (at < lines.length && lines[at].indent > indent) {
            const tail = block(lines[at].indent);
            for (const [key, val] of Object.entries(tail)) {
              if (Object.hasOwn(item, key)) fail(row.line, `duplicate key ${key}`);
              item[key] = val;
            }
          }
          result.push(item);
        } else if (!rest && at < lines.length && lines[at].indent > indent) result.push(block(lines[at].indent));
        else result.push(scalar(rest, row.line));
      } else {
        const [, rest] = pair(row.text, row.line);
        let nested;
        if (!rest && at < lines.length && lines[at].indent > indent) nested = block(lines[at].indent);
        if (/^[|>][-+]?$/.test(rest)) {
          const chunks = [];
          while (at < lines.length && lines[at].indent > indent) chunks.push(lines[at++].text);
          nested = chunks.join(rest[0] === '>' ? ' ' : '\n') + (rest.endsWith('-') ? '' : '\n');
        }
        assign(result, row.text, row.line, nested);
      }
    }
    return result;
  }
  if (!lines.length) fail(1, 'empty configuration');
  if (lines[0].indent !== 0) fail(lines[0].line, 'root must be unindented');
  const result = block(0);
  if (at !== lines.length) fail(lines[at].line, 'unexpected indentation');
  return result;
}

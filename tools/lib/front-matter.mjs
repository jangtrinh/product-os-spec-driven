import { parseYaml, YamlError } from './yaml-lite.mjs';

/* Splits "---\nyaml\n---\nbody" into { data, body, bodyLine, error }. bodyLine is the 1-based line where the body starts. */
export function splitFrontMatter(raw) {
  const text = raw.replace(/^﻿/, '');
  if (!/^---[ \t]*\r?\n/.test(text)) return { data: null, body: text, bodyLine: 1, error: null };
  const lines = text.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) if (/^---[ \t]*\r?$/.test(lines[i])) { end = i; break; }
  if (end < 0) return { data: null, body: text, bodyLine: 1, error: { line: 1, message: 'front matter opens with --- but is never closed' } };
  const yaml = lines.slice(1, end).join('\n');
  const body = lines.slice(end + 1).join('\n');
  try {
    const data = parseYaml(yaml, 2);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return { data: null, body, bodyLine: end + 2, error: { line: 2, message: 'front matter must be a map of key: value' } };
    return { data, body, bodyLine: end + 2, error: null };
  } catch (e) {
    if (e instanceof YamlError) return { data: null, body, bodyLine: end + 2, error: { line: e.line, message: e.message } };
    throw e;
  }
}

import fs from 'node:fs';
import { parseJson } from './json-strict.mjs';
import { localPath } from './local-path.mjs';
import path from 'node:path';
import { validate } from './schema-lite.mjs';
import { loadSchema } from './manifest.mjs';

/* Optional exact historical wording is data, never part of a page's current Markdown/search corpus. */
export function loadBlockHistory(spec) {
  const file = spec.manifest?.changes?.blocks;
  if (!file) return { entries: [], issues: [] };
  const issues = [];
  const issue = (code, message) => issues.push({ code, message });
  if (typeof file !== 'string') return { entries: [], issues: [{ code: 'B-FILE', message: 'change history path must be a string' }] };
  const absolute = path.resolve(spec.root, file);
  if (path.isAbsolute(file) || !absolute.startsWith(path.resolve(spec.root) + path.sep) || !file.endsWith('.json')) {
    issue('B-FILE', 'change history must be a JSON file inside the spec folder');
    return { entries: [], issues };
  }
  let data;
  try { data = parseJson(fs.readFileSync(localPath(spec.root,file), 'utf8')); }
  catch (e) { issue('B-FILE', `cannot read change history: ${e.message}`); return { entries: [], issues }; }
  for (const v of validate(data, loadSchema('block-history.schema.json'))) issue('B-SCHEMA', `${v.path} ${v.message}`);
  return { entries: Array.isArray(data?.entries) ? data.entries.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) : [], issues };
}

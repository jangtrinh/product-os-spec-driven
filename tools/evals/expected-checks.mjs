import fs from 'node:fs';
import {localPath} from '../lib/config/path-selection.mjs';
import {parseJson} from '../lib/config/strict-json.mjs';

export function loadExpected(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const blocks = [...raw.matchAll(/```eval-expectations\s*\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1) throw new Error('expected.md requires exactly one eval-expectations block');
  const data = parseJson(blocks[0][1], file);
  if (!Array.isArray(data.must_have) || !data.must_have.length || !Array.isArray(data.must_not_have)) throw new Error('Expected checks require nonempty must_have and explicit must_not_have');
  for (const row of [...data.must_have, ...data.must_not_have]) {
    if (!row || typeof row.file !== 'string' || typeof row.text !== 'string' || !row.text.trim()) throw new Error('Expected item requires file and nonempty literal text');
  }
  return data;
}
export function checkExpected(root, data) {
  const rows = [];
  for (const [kind, items] of Object.entries(data)) {
    if (!['must_have', 'must_not_have'].includes(kind)) throw new Error(`Unknown expected group: ${kind}`);
    for (const [index, item] of items.entries()) {
      let content, error = null;
      try { content = fs.readFileSync(localPath(root, item.file), 'utf8'); } catch (e) { error = e.message; }
      const present = content?.includes(item.text) ?? false;
      rows.push({id: `${kind}-${index + 1}`, ...item, passed: !error && (kind === 'must_have' ? present : !present), error});
    }
  }
  return {status: rows.every(row => row.passed) ? 'PASS' : 'FAIL', selected: rows.length, total: rows.length, rows};
}

import fs from 'node:fs';
import {parseTables} from '../lib/md.mjs';
import {parseJson} from '../lib/config/strict-json.mjs';
import {localPath} from '../lib/config/path-selection.mjs';
import {readAnswers} from './answer-source.mjs';

export function openQuestions(root, config) {
  const questions = new Map();
  const ledger = localPath(root, `${config.project.spec_root}/decisions/decisions.md`);
  if (fs.existsSync(ledger)) for (const table of parseTables(fs.readFileSync(ledger, 'utf8'))) {
    const disposition = table.header.findIndex(h => /^(disposition|status)$/i.test(h));
    const question = table.header.findIndex(h => /^question$/i.test(h));
    const answer = table.header.findIndex(h => /^answer/i.test(h));
    if (question < 0) continue;
    for (const cells of table.rows) {
      const id = cells[0]?.replaceAll('`', '');
      if (!/^Q-\d{3,}$/.test(id)) continue;
      if (disposition >= 0 ? !/^(open|deferred)$/i.test(cells[disposition]) : answer >= 0 && cells[answer] && !/OPEN/i.test(cells[answer])) continue;
      questions.set(id, {id, question: cells[question], options: [], recommended: null, source: `${config.project.spec_root}/decisions/decisions.md`});
    }
  }
  const manifest = localPath(root, `${config.project.spec_root}/spec.manifest.json`);
  const records = fs.existsSync(manifest) ? parseJson(fs.readFileSync(manifest, 'utf8'), manifest).gate_model?.records : null;
  const directories = [...new Set([`${config.project.spec_root}/records/clarify`, ...(records ? [`${config.project.spec_root}/${records}/clarify`] : []), 'review/clarify'])];
  // Canonical project records take precedence over exported reader projections.
  for (const relative of directories) {
    const directory = localPath(root, relative);
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory).filter(n => /^Q-\d{3,}\.json$/.test(n)).sort()) {
      const row = parseJson(fs.readFileSync(localPath(root, `${relative}/${name}`), 'utf8'), name);
      if (['open', 'deferred'].includes(row.status)) questions.set(row.id, {id: row.id, question: row.question, options: row.options ?? [], recommended: row.recommended ?? null, depends_on: row.depends_on ?? [], source: `${relative}/${name}`});
      else questions.delete(row.id);
    }
  }
  const answered = new Set(readAnswers(root).map(row => row.id));
  return [...questions.values()].filter(row => !answered.has(row.id)).sort((a, b) => a.id.localeCompare(b.id));
}

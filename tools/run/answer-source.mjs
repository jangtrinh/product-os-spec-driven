import fs from 'node:fs';
import {parseTables} from '../lib/md.mjs';
import {localPath, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {loadConfig} from '../lib/config/config-loader.mjs';

export const emptyAnswers = '# PO answers\n\nAnswers supplied by the PO. Leave unanswered questions out of this table.\n\n| Q | Answer | Decided by | Date | Note |\n|---|---|---|---|---|\n';
const header = ['Q', 'Answer', 'Decided by', 'Date', 'Note'];
const decode = value => value.replaceAll('<br>', '\n').replaceAll('&#92;', '\\').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
export function readAnswers(root) {
  const file = localPath(root, 'input/answers.md');
  if (!fs.existsSync(file)) return [];
  const tables = parseTables(fs.readFileSync(file, 'utf8')).filter(t => header.every((key, i) => t.header[i] === key));
  if (tables.length !== 1) throw new RunnerError('input/answers.md: require one Q / Answer / Decided by / Date / Note table');
  const ids = new Set();
  return tables[0].rows.map(cells => {
    const [id, answer, by, date, note] = cells;
    if (cells.length !== 5 || !/^Q-\d{3,}$/.test(id) || !answer?.trim() || /^(?:OPEN|TODO|TBD)(?::|$)/i.test(answer) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(by) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || ids.has(id)) throw new RunnerError(`input/answers.md: invalid or duplicate answer row ${id}`);
    ids.add(id); return {id, answer: decode(answer), decided_by: by, decided_at: `${date}T00:00:00Z`, decision_ref: `input/answers.md#${id}`, note: decode(note)};
  });
}
// The calling skill owns the same-session human question; this flag records
// the asserted channel, it cannot authenticate or prove a host tool was used.
export function appendAnswer(root, row, confirmedVia) {
  if (confirmedVia !== 'ask-user') throw new RunnerError('A same-session PO answer through ask-user is required');
  if (!(loadConfig(root).roles.po.approvers ?? []).includes(row.decided_by)) throw new RunnerError('Answer requires a configured PO email');
  const old = readAnswers(root);
  if (old.some(value => value.id === row.id)) throw new RunnerError(`Answer already recorded: ${row.id}`);
  const cell = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('\\', '&#92;').replaceAll('<', '&lt;').replaceAll('|', '\\|').replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '<br>');
  const file = localPath(root, 'input/answers.md');
  const bytes = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : emptyAnswers;
  const table = parseTables(bytes).find(t => header.every((key, i) => t.header[i] === key));
  const lines = bytes.split('\n'), at = table.line + 2 + table.rows.length;
  lines.splice(at, 0, `| ${[row.id, row.answer, row.decided_by, row.date, row.note ?? 'channel: agent-ask-user'].map(cell).join(' | ')} |`);
  const next = lines.join('\n');
  // Validate the prospective source before any write.
  if (!/^Q-\d{3,}$/.test(row.id) || !row.answer?.trim() || /^(?:OPEN|TODO|TBD)(?::|$)/i.test(row.answer) || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0, 10) !== row.date) throw new RunnerError('Invalid PO answer id, answer or calendar date');
  writeLocal(root, 'input/answers.md', next);
}

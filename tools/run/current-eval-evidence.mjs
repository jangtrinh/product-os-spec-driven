import fs from 'node:fs';
import {localPath, sha256} from '../lib/config/path-selection.mjs';

function count(text, label) {
  const value = new RegExp(`\\b${label}\\s*[:=]\\s*(\\d+)`, 'i').exec(text)?.[1]
    ?? new RegExp(`\\b(\\d+)\\s+${label}\\b`, 'i').exec(text)?.[1];
  return value === undefined ? null : Number(value);
}
export function currentEvalEvidence(root, results = [], {access = 'Full logs are available at report paths in the read-only snapshot.', only = null} = {}) {
  let remaining = 8000;
  const rows = results.map(row => {
    const bytes = row.report ? fs.readFileSync(localPath(root, row.report)) : Buffer.alloc(0);
    const log = bytes.toString('utf8');
    const budget = Math.max(0, Math.min(remaining, 2000));
    // `only` keeps just the matching lines (falling back to the log head when none match), so a long status header cannot crowd out the findings.
    const shown = only ? log.split('\n').filter(line => only.test(line)).join('\n') || log : log;
    let excerpt = '', used = 0;
    for (const character of shown) {
      const size = Buffer.byteLength(character);
      if (used + size > budget) break;
      excerpt += character; used += size;
    }
    remaining = Math.max(0, remaining - used);
    // True only when selected content was cut for the budget; a line filter that drops other lines is not truncation.
    return {...row, errors: count(log, 'errors?'), warnings: count(log, 'warnings?'), bytes: bytes.length, sha256: sha256(bytes), excerpt, truncated: Buffer.byteLength(shown) > used};
  });
  // One JSON line preserves the composed instruction line budget even for multiline logs.
  return `\n--- RUNNER-OBSERVED CURRENT STAGE EVAL EVIDENCE ---\nCommands ran after the last writer output; counts are null when the log does not declare them. ${access}\n${JSON.stringify(rows)}\n`;
}

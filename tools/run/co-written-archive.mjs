import fs from 'node:fs';
import {localPath, sha256, writeLocal} from '../lib/config/path-selection.mjs';

// Raw prior bytes of every co-declared write, one file per sha256 (content addressed). The chain check recomputes
// from these bytes, so they are stored unredacted: they are copies of spec files the project already holds in
// plain text, and redaction would make the hash unverifiable. The folder is runner state (review/co-written, outside
// review/log); do not export or commit it (review/ is not part of the exported spec tree).
export const archivePath = (config, sha) => `review/co-written/${sha}.txt`;
export function archiveBytes(root, config, bytes) {
  const sha = sha256(bytes);
  if (!fs.existsSync(localPath(root, archivePath(config, sha)))) writeLocal(root, archivePath(config, sha), bytes);
  return sha;
}
// Bytes for a hash, or null when absent or when the stored bytes do not hash to the name.
export function readArchive(root, config, sha) {
  if (!sha) return null;
  const file = localPath(root, archivePath(config, sha));
  if (!fs.existsSync(file)) return null;
  const bytes = fs.readFileSync(file);
  return sha256(bytes) === sha ? bytes : null;
}
// Raw lines: a trailing-space or line-ending change is a change to that line.
export const rawLines = text => text.split('\n').filter(line => line !== '');
// True when every earlier line is still present, in order. Generic: no ledger syntax is parsed.
export function isInsertOnly(before, after) {
  const next = rawLines(after); let at = 0;
  for (const line of rawLines(before)) {
    while (at < next.length && next[at] !== line) at++;
    if (at === next.length) return false;
    at++;
  }
  return true;
}

#!/usr/bin/env node
// Replay writer: answers each stage with the prepared files under the given payload roots
// (later roots are fallbacks; the first root holding a file wins). No model is involved.
import fs from 'node:fs';
import path from 'node:path';

const prompt = fs.readFileSync(0, 'utf8');
const stage = /^STAGE:\s*(\S+)/m.exec(prompt)?.[1];
const declared = JSON.parse(/^DECLARED OUTPUTS:\s*(.+)$/m.exec(prompt)?.[1] ?? '[]');
const files = {};
function walk(base, dir = '') {
  for (const entry of fs.readdirSync(path.join(base, dir), {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(base, relative);
    else if (!(relative in files)) files[relative] = fs.readFileSync(path.join(base, relative), 'utf8');
  }
}
for (const root of process.argv.slice(2)) {
  const stageDir = path.join(root, stage);
  if (fs.existsSync(stageDir)) walk(stageDir);
}
if (!Object.keys(files).length) { console.error(`No replay payload for stage ${stage}`); process.exit(1); }
// A writer that obeys the request text: a shared file named in an AMENDMENT notice keeps the bytes carried in
// the request instead of the stage's own prepared version.
for (const [, file] of prompt.matchAll(/^AMENDMENT by \S+ in (\S+) /gm)) {
  const carried = new RegExp(`^--- CO-WRITTEN FILE: ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ---\\n([\\s\\S]*?)^--- END CO-WRITTEN FILE ---$`, 'm').exec(prompt);
  if (carried && file in files) files[file] = carried[1];
}
const entries = Object.entries(files);
if (entries.length === 1 && declared.length === 1 && declared[0] === entries[0][0]) process.stdout.write(entries[0][1]);
else process.stdout.write('```files\n' + JSON.stringify(files, null, 2) + '\n```\n');

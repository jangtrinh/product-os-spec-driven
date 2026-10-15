import fs from 'node:fs';
import path from 'node:path';
import {localPath} from '../lib/config/path-selection.mjs';

// Deterministic authored candidate, never an expected.md oracle or model review.
const prompt = fs.readFileSync(0, 'utf8');
const outputs = JSON.parse(/^DECLARED OUTPUTS: (.+)$/m.exec(prompt)?.[1] ?? 'null');
if (!Array.isArray(outputs) || !outputs.length) throw new Error('Missing declared outputs');
const values = Object.fromEntries(outputs.map(file => {
  if (!file.startsWith('spec/')) throw new Error('Output outside spec');
  return [file, fs.readFileSync(localPath(path.resolve('eval-candidate'), file.slice(5)), 'utf8')];
}));
process.stdout.write(outputs.length === 1 ? values[outputs[0]] : `\`\`\`files\n${JSON.stringify(values)}\n\`\`\`\n`);

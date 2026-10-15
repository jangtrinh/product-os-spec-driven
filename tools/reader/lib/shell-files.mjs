import fs from 'node:fs';
import path from 'node:path';
import { SHELL_DIR } from './paths.mjs';

/* The committed, prebuilt shell: render uses these files as they are. make-shell.mjs --check proves they match shell-src/. */
export function readShell() {
  const out = {};
  for (const f of ['index.html', 'shell.js', 'shell.css', 'tokens.css', 'fonts.css', 'SHELL_VERSION']) {
    const p = path.join(SHELL_DIR, f);
    if (!fs.existsSync(p)) throw new Error(`shell file missing: ${p}. Run: node tools/reader/make-shell.mjs`);
    out[f] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

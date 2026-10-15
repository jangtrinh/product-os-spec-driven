import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

/* Finds Playwright without a fixed path: --playwright-from <dir>, $PLAYWRIGHT_FROM, the cwd, then the global npm root.
   <dir> is the folder whose node_modules holds playwright. Returns the chromium launcher or null. */
export function findChromium(from) {
  const npmRoot = () => { try { return `${execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}/..`; } catch { return null; } };
  for (const base of [from, process.env.PLAYWRIGHT_FROM, process.cwd(), npmRoot()].filter(Boolean)) {
    try { return createRequire(resolve(base, 'noop.js'))('playwright').chromium; } catch { /* try the next place */ }
  }
  return null;
}

export const PLAYWRIGHT_HINT = 'Playwright not found. Pass --playwright-from <dir containing node_modules/playwright>, set PLAYWRIGHT_FROM, or install playwright. Report: screenshots SKIPPED (no Playwright).';

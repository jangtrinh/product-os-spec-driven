import { createRequire } from 'node:module';
import { findChromium } from '../lib/playwright.mjs';

/* Chromium for browser tests; a test that needs it FAILS with a named reason when Playwright is not installed (a skip proves nothing). */
export function chromiumOrNull() {
  return findChromium(process.env.PLAYWRIGHT_FROM || '/opt/product-os/browser-runtime');
}
export const NO_BROWSER = 'Playwright not found: set PLAYWRIGHT_FROM to a folder whose node_modules holds playwright';

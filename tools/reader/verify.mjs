#!/usr/bin/env node
/* verify: opens a rendered reader in headless Chromium over file:// (no port is bound) and proves it works.
   usage: node tools/reader/verify.mjs <render-out-dir> [--proof <dir>] [--only checks|shots] [--matrix full] [--pages id,id]
                                        [--allow-diagram-failure <page-id>]... [--playwright-from <dir>] [--json]
          node tools/reader/verify.mjs --packet <packet-dir> [--proof <dir>]      checks one review packet folder (digest, 4 widths x 2 modes, labels, export)
          node tools/reader/verify.mjs --self-test [--playwright-from <dir>]      plants defects (dead link, broken diagram, wireframe image outside a wireframe
                                                                    section, two page toggles, overflow, denied shot, network call, hidden state, changed data,
                                                                    unlabeled control, tampered packet) and proves each turns a check red
   Checks: pages render, no console error and no network call, every diagram renders, no broken image, no dead link, search, page-toggle rule,
   image rule (with a red proof), overflow at 390/1024/1440, interactions, dossier, reference-chain diagrams, artifact (folder) mode.
   Exit 0 = every check green, 1 = a check is red, 2 = usage error, 3 = Playwright missing. Skipped features are listed, never silent. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChromium, PLAYWRIGHT_HINT } from './lib/playwright.mjs';
import { packetChecks } from './verify/packet-checks.mjs';
import { loadContext } from './verify/context.mjs';
import { runChecks, summarize } from './verify/run.mjs';
import { takeShots } from './verify/shots.mjs';

const args = process.argv.slice(2);
/* --self-test plants defects into kit fixtures; an initialized project ships tools/ but not fixtures/, so it is a kit-only developer check. */
if (args.includes('--self-test') && !fs.existsSync(fileURLToPath(new URL('../../fixtures/reader/packet-project.mjs', import.meta.url)))) {
  console.error('--self-test is a kit-only developer check: it needs the kit fixtures/ folder, which a project does not contain. Run it from the kit checkout: node tools/reader/verify.mjs --self-test');
  process.exit(2);
}
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const all = (k) => args.flatMap((a, i) => (a === `--${k}` ? [args[i + 1]] : []));
const chromium = findChromium(opt('playwright-from'));
if (!chromium) { console.error(PLAYWRIGHT_HINT); process.exit(3); }
const browser = await chromium.launch();
let code = 0;
try {
  if (args.includes('--self-test')) code = (await (await import('./verify/self-test.mjs')).selfTest(browser)) ? 0 : 1;
  else if (opt('packet')) {
    const proofDir = path.resolve(opt('proof') || path.join(opt('packet'), 'proof'));
    fs.mkdirSync(proofDir, { recursive: true });
    const results = await packetChecks(browser, path.resolve(opt('packet')), { proofDir });
    for (const c of results) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  ${JSON.stringify(c.detail).slice(0, 200)}`);
    const failed = results.filter((c) => !c.ok);
    console.log(failed.length ? `PACKET RED — failed: ${failed.map((c) => c.name).join(', ')}` : `PACKET GREEN — ${results.length} checks`);
    code = failed.length ? 1 : 0;
  }
  else {
    const outDir = args.find((a, i) => !a.startsWith('--') && !['--proof', '--only', '--matrix', '--allow-diagram-failure', '--playwright-from', '--packet', '--pages'].includes(args[i - 1]));
    if (!outDir) { console.error('usage: node tools/reader/verify.mjs <render-out-dir> [--proof <dir>] [--only checks|shots] [--matrix full] [--allow-diagram-failure <page-id>] | --self-test'); process.exit(2); }
    const proofDir = path.resolve(opt('proof') || path.join(outDir, 'proof'));
    fs.mkdirSync(proofDir, { recursive: true });
    const ctx = loadContext(path.resolve(outDir), browser, { waiveDiagrams: all('allow-diagram-failure'), artifact: true, proofDir });
    if (!ctx.hasOffline || !ctx.data) { console.error(`no rendered reader in ${outDir} (expected ${ctx.offlineFile}). Run render.mjs first.`); process.exit(2); }
    const only = opt('only');
    const report = { reader: ctx.offlineFile, shell: ctx.report.shell, skippedFeatures: ctx.data.skipped, waivedDiagramFailures: ctx.opts.waiveDiagrams };
    if (!only || only === 'checks') { report.checks = await runChecks(ctx); report.summary = summarize(report.checks); }
    if (!only || only === 'shots') report.shots = await takeShots(ctx, proofDir, opt('matrix') === 'full', opt('pages') ? opt('pages').split(',') : null);
    fs.writeFileSync(path.join(proofDir, 'verify-results.json'), JSON.stringify(report, null, 1));
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 1));
    else {
      for (const c of report.checks || []) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  ${JSON.stringify(c.detail).slice(0, 220)}`);
      if (report.shots) console.log(`shots: ${report.shots.files.length} written to ${proofDir}${report.shots.skipped.length ? `; skipped (spec has no such page): ${report.shots.skipped.join(', ')}` : ''}`);
      if (report.skippedFeatures.length) console.log(`skipped features: ${report.skippedFeatures.map((s) => `${s.page} (${s.reason})`).join('; ')}`);
      if (ctx.opts.waiveDiagrams.length) console.log(`WAIVED diagram failures on: ${ctx.opts.waiveDiagrams.join(', ')} (named on the command line, not silent)`);
      if (report.summary) console.log(report.summary.ok ? `VERIFY GREEN — ${report.summary.total} checks` : `VERIFY RED — failed: ${report.summary.failed.join(', ')}`);
    }
    code = report.summary && !report.summary.ok ? 1 : 0;
  }
} finally {
  await browser.close();
}
process.exit(code);

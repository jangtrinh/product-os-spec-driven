import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromiumOrNull, NO_BROWSER } from './helpers.mjs';
import { indexSpec } from '../indexer/index-spec.mjs';
import { ROW_ID } from '../indexer/links.mjs';
import { lintSpec } from '../../lint/index.mjs';

/* A link to a ledger row is written `<ledger page id>.<row id>` (lint accepts it). The reader must land on the row, not at the top of the page. */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `row-anchor-${process.pid}-`));
const outDir = path.join(tmp, 'out');
function makeSpec(name, extra) {
  const dir = path.join(tmp, name);
  fs.cpSync(path.join(root, 'fixtures/v2/full'), dir, { recursive: true });
  const readme = path.join(dir, 'delivery/wave-1.md');
  fs.writeFileSync(readme, `${fs.readFileSync(readme, 'utf8')}\n${extra}\n`);
  return dir;
}
const specDir = makeSpec('spec', 'Row link: [the delete rule](../decisions/decision-log.md#decision-log.D2).');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('lint accepts the row link', () => {
  assert.deepEqual(lintSpec(specDir).problems.errors.map((e) => `${e.code} ${e.file}`), []);
});

test('the indexer rewrites <page>.<row> to the reader row id and keeps unknown rows at the page', () => {
  const { data } = indexSpec(specDir);
  const md = data.pages.find((p) => p.rel === 'delivery/wave-1.md').md;
  assert.match(md, /\[the delete rule\]\(#decision-log\.d2\)/);
  const unknown = indexSpec(makeSpec('unknown', 'Row link: [unknown row](../decisions/decision-log.md#decision-log.D99).')).data.pages.find((p) => p.rel === 'delivery/wave-1.md').md;
  assert.match(unknown, /\[unknown row\]\(#decision-log\)/);
});

test('clicking a ledger row link in the reader lands on that row', async () => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const render = spawnSync(process.execPath, [path.join(root, 'tools/reader/render.mjs'), specDir, '--out', outDir, ], { encoding: 'utf8' });
  assert.equal(render.status, 0, render.stderr);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 700 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(outDir, 'offline/index.html')).href + '#wave-1');
    await page.waitForSelector('#prose');
    await page.click('a:has-text("the delete rule")');
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => location.hash), '#decision-log.d2');
    const landed = await page.evaluate(() => {
      const row = document.getElementById('d2');
      const box = row && row.getBoundingClientRect();
      return { title: document.querySelector('#page-title')?.textContent, row: !!row, text: row ? row.textContent : '', inView: !!box && box.top >= 0 && box.top < innerHeight, flash: !!row && row.classList.contains('flash') };
    });
    assert.equal(landed.title, 'Decision log');
    assert.ok(landed.row && /Delete always asks for confirmation/.test(landed.text), JSON.stringify(landed));
    assert.ok(landed.inView, `the row is scrolled into view: ${JSON.stringify(landed)}`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('the indexer row-id pattern is the shell pattern', () => {
  const shell = fs.readFileSync(path.join(root, 'tools/reader/shell-src/js/02-markdown.js'), 'utf8');
  assert.equal(`/${ROW_ID.source}/`, /^const ROW_ID = (\/.*\/);$/m.exec(shell)[1]);
});

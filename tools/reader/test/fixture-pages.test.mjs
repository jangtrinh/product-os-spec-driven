import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { indexSpec } from '../indexer/index-spec.mjs';
import { loadContext } from '../verify/context.mjs';
import { runChecks } from '../verify/run.mjs';
import { chromiumOrNull, NO_BROWSER } from './helpers.mjs';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-pages-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const render = (spec, out) => spawnSync(process.execPath, [path.join(root, 'tools/reader/render.mjs'), spec, '--out', out], { encoding: 'utf8' });

/* The browser tests fail, never skip, when no browser is installed: a skipped check proves nothing. */
async function checked(t, fixture, only) {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const out = tmp(t); const r = render(path.join(root, 'fixtures/reader', fixture), out); assert.equal(r.status, 0, r.stderr);
  const browser = await chromium.launch(); t.after(() => browser.close());
  return runChecks(loadContext(out, browser, {}), only);
}
const failing = (res) => res.filter((x) => !x.ok).map((x) => `${x.name} ${JSON.stringify(x.detail).slice(0, 300)}`);

test('a populated source ledger links every mapped screen state, AC and scenario to a real target', async (t) => {
  const res = await checked(t, 'ledger', ['crawl', 'a11y-basics', 'views']);
  assert.deepEqual(failing(res), []);
  const links = res.find((x) => x.name === 'links'); assert.equal(links.detail.dead, 0);
});

test('a receipt that two lists name loads once: one row, one id', async (t) => {
  const res = await checked(t, 'shared-receipt', ['crawl', 'a11y-basics', 'views']);
  assert.deepEqual(failing(res), []);
  const data = indexSpec(path.join(root, 'fixtures/reader/shared-receipt'), {}).data;
  const base = indexSpec(path.join(root, 'fixtures/v2/full'), {}).data;
  const rows = (d) => (/receipt-spec/g.exec(d.pages.find((p) => p.id === 'evidence-view').md) ? d.pages.find((p) => p.id === 'evidence-view').md.match(/<tr id="receipt-spec">/g) : []) || [];
  assert.equal(rows(data).length, 1); assert.equal(rows(base).length, 1);
  assert.equal(data.views.receipts, base.views.receipts, 'receipt count equals the spec that lists it once');
});

test('malformed source ledgers disclose their problems and never crash the reader', (t) => {
  const cases = { 'item source is null': (l) => { l.items[0].source = null; }, 'items is null': (l) => { l.items = null; }, 'items is an object': (l) => { l.items = { a: 1 }; }, 'an item is null': (l) => { l.items.push(null); },
    'mappings is a string': (l) => { l.items[0].mappings = 'ac'; }, 'item is a string': (l) => { l.items.push('SRC'); }, 'item source missing': (l) => { delete l.items[0].source; } };
  for (const [name, mutate] of Object.entries(cases)) {
    const dir = tmp(t); fs.cpSync(path.join(root, 'fixtures/reader/ledger'), dir, { recursive: true });
    const f = path.join(dir, 'provenance/source-ledger.json'); const l = JSON.parse(fs.readFileSync(f, 'utf8')); mutate(l); fs.writeFileSync(f, JSON.stringify(l));
    let data; assert.doesNotThrow(() => { data = indexSpec(dir, {}).data; }, name);
    const md = data.pages.find((p) => p.id === 'source-ledger').md;
    assert.match(md, /Ledger problems|could not be read/, name);
  }
});

test('two different records under one receipt id are a visible conflict, not a silent pick', (t) => {
  const dir = tmp(t); fs.cpSync(path.join(root, 'fixtures/reader/shared-receipt'), dir, { recursive: true });
  const r = JSON.parse(fs.readFileSync(path.join(dir, 'assets/receipt.json'), 'utf8')); r.at = '2026-02-02T00:00:00Z';
  fs.writeFileSync(path.join(dir, 'assets/receipt-twin.json'), JSON.stringify(r));
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'spec.manifest.json'), 'utf8')); m.design.evidence = ['assets/receipt-twin.json']; fs.writeFileSync(path.join(dir, 'spec.manifest.json'), JSON.stringify(m));
  const md = indexSpec(dir, {}).data.pages.find((p) => p.id === 'evidence-view').md;
  assert.match(md, /Receipt problems/); assert.match(md, /defined in assets\/receipt\.json and again/); assert.equal((md.match(/<tr id="receipt-spec">/g) || []).length, 1);
});

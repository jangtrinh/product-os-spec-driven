import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packetProject } from '../../../fixtures/reader/packet-project.mjs';
import { generate } from '../packet.mjs';
import { viewCore } from '../packet/source-binding.mjs';
import { readParts, viewBindingCheck } from '../verify/packet-view-checks.mjs';
import { chromiumOrNull, NO_BROWSER } from './helpers.mjs';

/* Packet binding class: every reviewer-visible line is rebuilt from the embedded data and the pinned bytes; a mismatch anywhere is refused. */
const CLI = fileURLToPath(new URL('../packet.mjs', import.meta.url));
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'packet-bind-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const opts = (p, out) => ({ spec: p.spec, project: p.root, config: 'config/pipeline.yaml', changeSet: 'CS-filter', out });
const ROUTE = '/filters/confirm-before-save';

/* The verifier's screen negative case: an export whose inventory AND ui-contract agree with each other but differ from the pinned bytes. */
function altScreenExport(t, p) {
  const alt = path.join(tmp(t), 'alt'); fs.cpSync(p.spec, alt, { recursive: true });
  const inv = path.join(alt, 'assets/inventory.json'), ui = path.join(alt, 'ux/ui-contract.md'), mf = path.join(alt, 'spec.manifest.json');
  fs.writeFileSync(inv, fs.readFileSync(inv, 'utf8').replaceAll('/filters/s01', ROUTE));
  fs.writeFileSync(ui, fs.readFileSync(ui, 'utf8').replaceAll('/filters/s01', ROUTE));
  const m = JSON.parse(fs.readFileSync(mf, 'utf8')); delete m.gate_model; fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  return alt;
}

test('the verifier screen-route negative case: an unpinned alternate inventory and ui-contract are refused, not rendered (exit 3)', (t) => {
  const p = packetProject(t), alt = altScreenExport(t, p), out = path.join(tmp(t), 'o');
  assert.throws(() => generate({ ...opts(p, out), spec: alt }), /not the bytes|pinned/i);
  const cli = spawnSync(process.execPath, [CLI, alt, '--project', p.root, '--change-set', 'CS-filter', '--out', out], { encoding: 'utf8' });
  assert.equal(cli.status, 3, cli.stderr); assert.ok(!fs.existsSync(path.join(out, 'index.html')));
  assert.doesNotMatch(cli.stdout + cli.stderr, new RegExp(ROUTE));
});

test('a candidate that does not pin the screen inventory or the ui-contract cannot produce a packet', (t) => {
  const base = ['spec/contract/FC-001.md', 'spec/decisions/decision-log.md', 'spec/us/US-01.md'];
  assert.throws(() => generate(opts(packetProject(t, { files: [...base, 'spec/ux/ui-contract.md'] }), path.join(tmp(t), 'o'))), /does not pin|not pinned/i);
  assert.throws(() => generate(opts(packetProject(t, { files: [...base, 'spec/assets/inventory.json'] }), path.join(tmp(t), 'o'))), /does not pin|not pinned/i);
});

test('screens, routes and the ui-contract are rebuilt from the pinned bytes; previews are labelled not verified', (t) => {
  const p = packetProject(t), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8'), parts = readParts(html);
  const key = Object.keys(parts.sources).find((k) => k.endsWith('assets/inventory.json'));
  assert.ok(key && Object.keys(parts.sources).some((k) => k.endsWith('ux/ui-contract.md')), 'inventory and ui-contract bytes are embedded');
  assert.equal(viewCore.canon(parts.data.screens), viewCore.canon(viewCore.screensFor(Buffer.from(parts.sources[key], 'base64').toString('utf8'), parts.data.scope.ids)));
  assert.match(html, /Preview \(not verified\)/); assert.match(html, /UI contract \(pinned\)/);
  assert.match(html, /<td data-label="Preview \(not verified\)"><img class="thumb"[^>]*data-asset="[^"]+"[^>]*>[\s\S]*?not verified/);
  assert.doesNotMatch(html, /<img[^>]* src=/, 'no image bytes live in the static markup; the page sets them after the hash check');
});

test('an honest packet: the static markup equals the rebuild and the file regenerates byte for byte', async (t) => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const p = packetProject(t, { exception: true }), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const file = path.join(out, 'index.html'), html = fs.readFileSync(file, 'utf8');
  const res = await viewBindingCheck(browser, { file, html, parts: readParts(html) });
  assert.deepEqual(res.map((r) => [r.name, r.ok]), [['packet-view-binding', true], ['packet-file-regenerates', true]]);
});

/* The three negative cases that approved wrong presentation: only visible non-executable markup changes; the embedded data and scripts do not. */
const NEGATIVE_CASES = [
  { name: 'screen route', section: 'screens', from: '<code>/filters/s01</code>', to: `<code>${ROUTE}</code>`, truth: '/filters/s01' },
  { name: 'receipt domain', section: 'evidence', from: 'data-label="Domain">spec<', to: 'data-label="Domain">visual<', truth: 'data-label="Domain">spec<' },
  { name: 'exception reason', section: 'records', from: 'Only the original fixture scope is applicable', to: 'The owner permits deletion without confirmation for this batch', truth: 'Only the original fixture scope is applicable' },
];
for (const a of NEGATIVE_CASES) {
  test(`REFUSED: markup-only ${a.name} negative case; the page shows the data truth, blocks export, and the verifier is red`, async (t) => {
    const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
    const p = packetProject(t, { exception: true }), out = path.join(tmp(t), 'o'); generate(opts(p, out));
    const file = path.join(out, 'index.html'), honest = fs.readFileSync(file, 'utf8');
    const a0 = honest.indexOf(`<section id="${a.section}"`), b0 = honest.indexOf('</section>', a0), seg = honest.slice(a0, b0);
    assert.ok(seg.includes(a.from), `the negative case target is on the page: ${a.from}`);
    const tampered = honest.slice(0, a0) + seg.replace(a.from, a.to) + honest.slice(b0);
    fs.writeFileSync(file, tampered);
    const browser = await chromium.launch(); t.after(() => browser.close());
    const verdict = await viewBindingCheck(browser, { file, html: tampered, parts: readParts(tampered) });
    assert.equal(verdict.find((r) => r.name === 'packet-view-binding').ok, false, 'verifier: DOM differs from the rebuild of the embedded data');
    assert.equal(verdict.find((r) => r.name === 'packet-file-regenerates').ok, false);
    const page = await (await browser.newContext({ acceptDownloads: true })).newPage(); let downloaded = false; page.on('download', () => { downloaded = true; });
    await page.goto(`file://${file}`); await page.waitForFunction(() => document.querySelector('#binding-check')?.dataset.tone);
    assert.equal(await page.getAttribute('#binding-check', 'data-tone'), 'bad');
    assert.match(await page.textContent('#binding-check'), new RegExp(a.section));
    const shown = await page.$eval(`#${a.section}`, (el) => el.innerHTML);
    assert.ok(shown.includes(a.truth) && !shown.includes(a.to), 'the reviewer sees what the data says, not the tampered markup');
    await page.check('input[name="default"][value="approve"]'); await page.fill('#by', 'po@example.test'); await page.fill('#reason', 'ok');
    if (a.name === 'exception reason') await page.check('input[name="exception"]');
    assert.equal(await page.isDisabled('#export'), true);
    await page.$eval('#export', el => el.click()); await page.waitForTimeout(300);
    assert.equal(downloaded, false); assert.match(await page.textContent('#export-status'), /does not match|Nothing was exported/);
  });
}

test('a page whose pinned inventory bytes are replaced is refused by the page and by the verifier', async (t) => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const p = packetProject(t), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const file = path.join(out, 'index.html'), html = fs.readFileSync(file, 'utf8'), parts = readParts(html);
  const key = Object.keys(parts.sources).find((k) => k.endsWith('assets/inventory.json'));
  parts.sources[key] = Buffer.from(Buffer.from(parts.sources[key], 'base64').toString('utf8').replaceAll('/filters/s01', ROUTE)).toString('base64');
  fs.writeFileSync(file, html.replace(/(<script id="packet-sources" type="application\/json">)[\s\S]*?(<\/script>)/, `$1${JSON.stringify(parts.sources)}$2`));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await (await browser.newContext()).newPage(); await page.goto(`file://${file}`);
  await page.waitForFunction(() => document.querySelector('#binding-check')?.dataset.tone);
  assert.equal(await page.getAttribute('#binding-check', 'data-tone'), 'bad'); assert.match(await page.textContent('#binding-check'), /not the pinned bytes/);
});

test('core: the story id, inventory rows and ui-contract rows are read from bytes, not names', () => {
  assert.equal(viewCore.screensFor('not json', ['A']), null);
  assert.deepEqual(viewCore.screensFor(JSON.stringify({ screens: [{ screen: 'S2', state: 'b', ac: ['A'] }, { screen: 'S1', state: 'a', ac: ['A'] }, { screen: 'S3', state: 'a', ac: ['Z'] }] }), ['A']).map((r) => r.screen), ['S1', 'S2']);
  const rows = viewCore.contractRowsFor('| Screen | State | Route | Element | Kind |\n|---|---|---|---|---|\n| S1 | a | /x | role=button | button |\n');
  assert.deepEqual(rows, [{ screen: 'S1', state: 'a', route: '/x', element: 'role=button', kind: 'button' }]);
});

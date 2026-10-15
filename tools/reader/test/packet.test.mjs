import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { packetProject } from '../../../fixtures/reader/packet-project.mjs';
import { generate } from '../packet.mjs';
import { canonical } from '../../lib/config/strict-json.mjs';
import { sha256 } from '../../lib/config/path-selection.mjs';
import { chromiumOrNull, NO_BROWSER } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../packet.mjs', import.meta.url));
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'packet-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const opts = (p, out) => ({ spec: p.spec, project: p.root, config: 'config/pipeline.yaml', changeSet: 'CS-filter', out });

test('identical pinned inputs give byte-identical packet data and HTML', (t) => {
  const p = packetProject(t), a = path.join(tmp(t), 'a'), b = path.join(tmp(t), 'b');
  generate(opts(p, a)); generate(opts(p, b));
  for (const f of ['packet-data.json', 'index.html']) assert.equal(fs.readFileSync(path.join(a, f)).compare(fs.readFileSync(path.join(b, f))), 0, f);
  const data = JSON.parse(fs.readFileSync(path.join(a, 'packet-data.json'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(a, 'packet-data.json'), 'utf8'), canonical(data));
  assert.equal(data.product, 'PRODUCT:OS Spec Driven');
});

test('packet keeps before/after, impact, propagation, scope, evidence and OPEN visible', (t) => {
  const p = packetProject(t), out = path.join(tmp(t), 'o'); const r = generate(opts(p, out));
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  const data = JSON.parse(fs.readFileSync(path.join(out, 'packet-data.json'), 'utf8'));
  assert.equal(r.packetId, `packet-${sha256(canonical(data))}`);
  for (const needle of ['Before and after', 'Impact and closure', 'Propagation', 'Requested scope', 'US-01.AC-02', 'Evidence', 'fixture-receipt', 'Findings and open questions', 'PRODUCT:OS Spec Driven']) assert.ok(html.includes(needle), needle);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html.replace(/<script id="packet-data"[\s\S]*?<\/script>/, '')), 'no remote URL in the packet markup');
  assert.deepEqual(data.requests.map((x) => x.id), ['US-01.AC-01', 'US-01.AC-02']);
});

test('refuses a non-empty destination, an invalid spec and a change set without candidate', (t) => {
  const p = packetProject(t), out = tmp(t); fs.writeFileSync(path.join(out, 'x'), '1');
  assert.throws(() => generate(opts(p, out)), /not empty/);
  const q = packetProject(t); fs.appendFileSync(path.join(q.spec, 'us/US-01.md'), '\nOPEN[blocking]: ');
  assert.throws(() => generate(opts(q, path.join(tmp(t), 'n'))), /lint error/);
  const r = packetProject(t, { mutate: (pp, { changeSet }) => pp.write('review/changes/CS-filter.json', { ...changeSet, candidate: null }) });
  assert.throws(() => generate(opts(r, path.join(tmp(t), 'n'))), /no candidate/);
  const cli = spawnSync(process.execPath, [CLI, p.spec, '--project', p.root, '--change-set', 'CS-filter', '--out', out], { encoding: 'utf8' });
  assert.equal(cli.status, 3);
});

test('incomplete closure shows the BR-14 fallback and no smaller batch', (t) => {
  const p = packetProject(t, { mutate: (pp) => { const g = JSON.parse(fs.readFileSync(path.join(pp.root, 'review/graph.json'), 'utf8')); g.complete = false; pp.write('review/graph.json', g); } });
  const out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const data = JSON.parse(fs.readFileSync(path.join(out, 'packet-data.json'), 'utf8'));
  assert.deepEqual(data.change.closure, { complete: false, fallback: 'intake' }); assert.deepEqual(data.unaffected, []);
  assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /Impact closure is incomplete/);
});

test('exported decision from the HTML controls is accepted by the runner import; a tampered one is not', async (t) => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const p = packetProject(t), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage();
  await page.goto(`file://${out}/index.html`);
  await page.click('#export'); assert.match(await page.textContent('#export-status'), /Choose a decision/);
  await page.check('input[name="default"][value="approve"]'); await page.fill('#by', 'po@example.test'); await page.fill('#reason', 'Wording matches the amended rule');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const file = path.join(tmp(t), 'decision.json'); await dl.saveAs(file);
  fs.copyFileSync(file, path.join(p.root, 'decision.json')); fs.copyFileSync(path.join(out, 'packet-data.json'), path.join(p.root, 'packet-data.json'));
  const args = ['--import-decision', 'decision.json', '--packet-data', 'packet-data.json', '--as', 'po@example.test'];
  const ok = p.run(args); assert.equal(ok.code, 0, ok.out);
  const q = packetProject(t); const out2 = path.join(tmp(t), 'o'); generate(opts(q, out2));
  const d = JSON.parse(fs.readFileSync(file, 'utf8')); d.data_sha256 = '0'.repeat(64);
  q.write('decision.json', d); fs.copyFileSync(path.join(out2, 'packet-data.json'), path.join(q.root, 'packet-data.json'));
  assert.equal(q.run(args).code, 3);
});

/* Source binding: every displayed member's wording must come from bytes the member hashes pin. */
const altExport = (t, p, edit, rel = 'us/US-01.md') => {
  const alt = path.join(tmp(t), 'alt-spec'); fs.cpSync(p.spec, alt, { recursive: true });
  const f = path.join(alt, rel); fs.writeFileSync(f, edit(fs.readFileSync(f, 'utf8')));
  /* The verifier's negative case: an export without the optional gate model, so lint has no pinned member bytes to contradict. */
  const mf = path.join(alt, 'spec.manifest.json'); const m = JSON.parse(fs.readFileSync(mf, 'utf8')); delete m.gate_model; fs.writeFileSync(mf, JSON.stringify(m, null, 2));
  return alt;
};
const ALTERNATE = 'Delete every saved filter without confirmation.';

test('an alternate export with different AC wording is refused, not rendered (exit 3)', (t) => {
  const p = packetProject(t);
  const alt = altExport(t, p, (s) => s.replace('Bộ lọc xuất hiện trong danh sách đã lưu.', ALTERNATE));
  const out = path.join(tmp(t), 'o');
  assert.throws(() => generate({ ...opts(p, out), spec: alt }), /not the bytes|pinned|bound/i);
  assert.ok(!fs.existsSync(path.join(out, 'index.html')), 'no packet written');
  const cli = spawnSync(process.execPath, [CLI, alt, '--project', p.root, '--change-set', 'CS-filter', '--out', out], { encoding: 'utf8' });
  assert.equal(cli.status, 3, cli.stderr);
});

test('displayed AC cells are the raw cells of the pinned source row, and the sources are embedded for the page to re-hash', (t) => {
  const p = packetProject(t), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(html, /<script id="packet-sources" type="application\/json">/);
  assert.match(html, /<td data-label="[^"]+">Danh sách đang có điều kiện lọc</);
  const src = JSON.parse(/<script id="packet-sources" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
  const key = Object.keys(src).find((k) => k.endsWith('us/US-01.md'));
  assert.equal(sha256(Buffer.from(src[key], 'base64')), p.membership.members[0].artifacts[key], 'embedded bytes hash to the member pin');
});

test('a story file that no displayed member pins is refused', (t) => {
  const p = packetProject(t, { files: ['spec/decisions/decision-log.md'] });
  assert.throws(() => generate(opts(p, path.join(tmp(t), 'o'))), /not pinned|pinned/i);
});

test('the pinned source drifting after generation makes the runner import reject the decision (exit 3)', async (t) => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const p = packetProject(t), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage();
  await page.goto(`file://${out}/index.html`);
  await page.check('input[name="default"][value="approve"]'); await page.fill('#by', 'po@example.test'); await page.fill('#reason', 'ok');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const file = path.join(tmp(t), 'decision.json'); await dl.saveAs(file);
  fs.copyFileSync(file, path.join(p.root, 'decision.json')); fs.copyFileSync(path.join(out, 'packet-data.json'), path.join(p.root, 'packet-data.json'));
  fs.writeFileSync(path.join(p.spec, 'us/US-01.md'), fs.readFileSync(path.join(p.spec, 'us/US-01.md'), 'utf8').replace('Bộ lọc xuất hiện trong danh sách đã lưu.', ALTERNATE));
  const r = p.run(['--import-decision', 'decision.json', '--packet-data', 'packet-data.json', '--as', 'po@example.test']);
  assert.equal(r.code, 3, r.out); assert.match(r.out, /Stale candidate member|membership/);
});

test('a packet whose visible wording was swapped after generation blocks export in the browser', async (t) => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const p = packetProject(t), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const f = path.join(out, 'index.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('Bộ lọc xuất hiện trong danh sách đã lưu.', ALTERNATE));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const ctx = await browser.newContext({ acceptDownloads: true }); const page = await ctx.newPage();
  let downloaded = false; page.on('download', () => { downloaded = true; });
  await page.goto(`file://${out}/index.html`);
  await page.waitForFunction(() => document.querySelector('#binding-check')?.dataset.tone);
  assert.equal(await page.getAttribute('#binding-check', 'data-tone'), 'bad');
  await page.check('input[name="default"][value="approve"]'); await page.fill('#by', 'po@example.test'); await page.fill('#reason', 'ok');
  assert.equal(await page.isDisabled('#export'), true);
    await page.$eval('#export', el => el.click()); await page.waitForTimeout(300);
  assert.equal(downloaded, false); assert.match(await page.textContent('#export-status'), /does not match|Do not use/);
});

test('an honest packet passes the in-page source check', async (t) => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const p = packetProject(t), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await (await browser.newContext()).newPage(); await page.goto(`file://${out}/index.html`);
  await page.waitForFunction(() => document.querySelector('#binding-check')?.dataset.tone);
  assert.equal(await page.getAttribute('#binding-check', 'data-tone'), 'ok');
});

const ALTERNATE_RULING = 'Delete all filters automatically with no confirmation';

test('an alternate export whose decision log shows a different ruling is refused, not rendered (exit 3)', (t) => {
  const p = packetProject(t);
  const alt = altExport(t, p, (s) => s.replace('Filters can be saved with a name', ALTERNATE_RULING), 'decisions/decision-log.md');
  const out = path.join(tmp(t), 'o');
  assert.throws(() => generate({ ...opts(p, out), spec: alt }), /not the bytes|pinned|bound/i);
  assert.ok(!fs.existsSync(path.join(out, 'index.html')), 'no packet written');
  const cli = spawnSync(process.execPath, [CLI, alt, '--project', p.root, '--change-set', 'CS-filter', '--out', out], { encoding: 'utf8' });
  assert.equal(cli.status, 3, cli.stderr);
  assert.doesNotMatch(cli.stdout + cli.stderr, new RegExp(ALTERNATE_RULING));
});

test('an alternate export with different amendment rule wording is refused (exit 3)', (t) => {
  const p = packetProject(t);
  const alt = altExport(t, p, (s) => s.replace('Xoá bộ lọc luôn cần xác nhận', 'Xoá bộ lọc không cần xác nhận'), 'contract/FC-001.md');
  assert.notEqual(fs.readFileSync(path.join(alt, 'contract/FC-001.md'), 'utf8'), fs.readFileSync(path.join(p.spec, 'contract/FC-001.md'), 'utf8'), 'the negative case must change the contract bytes');
  assert.throws(() => generate({ ...opts(p, path.join(tmp(t), 'o')), spec: alt }), /not the bytes|pinned|bound/i);
});

test('rulings come only from the pinned ledger: a ledger no member pins is refused', (t) => {
  const p = packetProject(t, { files: ['spec/contract/FC-001.md', 'spec/us/US-01.md'] });
  assert.throws(() => generate(opts(p, path.join(tmp(t), 'o'))), /does not pin|not pinned/i);
});

test('a packet whose visible ruling was swapped after generation blocks export in the browser', async (t) => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  const p = packetProject(t), out = path.join(tmp(t), 'o'); generate(opts(p, out));
  const f = path.join(out, 'index.html'), html = fs.readFileSync(f, 'utf8');
  assert.match(html, /<td data-label="Ruling">Filters can be saved with a name</);
  fs.writeFileSync(f, html.replace('>Filters can be saved with a name<', `>${ALTERNATE_RULING}<`));
  const browser = await chromium.launch(); t.after(() => browser.close());
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage(); await page.goto(`file://${out}/index.html`);
  await page.waitForFunction(() => document.querySelector('#binding-check')?.dataset.tone);
  assert.equal(await page.getAttribute('#binding-check', 'data-tone'), 'bad');
});

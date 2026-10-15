import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromiumOrNull, NO_BROWSER } from './helpers.mjs';

/* The reader in headless Chromium: what lands on the clipboard when a spec selection or a prototype element is copied. */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const specDir = path.join(root, 'fixtures/reader/design-stages');
const outDir = path.join(os.tmpdir(), `copy-ai-${process.pid}`);
const core = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'tools/reader/shell-src/js/00b-copy-core.js'), 'utf8'), core);
const rawLines = (rel) => fs.readFileSync(path.join(specDir, rel), 'utf8').split('\n');
const lineOf = (rel, needle) => { const i = rawLines(rel).findIndex((l) => l.includes(needle)); assert.ok(i >= 0, `${rel} has ${needle}`); return i + 1; };
let browser, data, url;
test.before(async () => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  browser = await chromium.launch();
  fs.rmSync(outDir, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [path.join(root, 'tools/reader/render.mjs'), specDir, '--out', outDir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  data = JSON.parse(fs.readFileSync(path.join(outDir, 'artifact/content.json'), 'utf8'));
  url = pathToFileURL(path.join(outDir, 'offline/index.html')).href;
});
test.after(async () => { await browser?.close(); fs.rmSync(outDir, { recursive: true, force: true }); });

async function open(hash, { clipboard = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  if (clipboard) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}#${hash}`);
  await page.waitForSelector('#prose');
  return { page, context, errors };
}
async function selectIn(page, fromSel, toSel, within) {
  return page.evaluate(({ fromSel, toSel, within }) => {
    const q = (s) => [...document.querySelectorAll(s)].find((e) => !within || e.textContent.includes(within)) || document.querySelector(s);
    const a = q(fromSel), b = toSel ? q(toSel) : a;
    const r = document.createRange();
    r.setStartBefore(a.firstChild || a); r.setEndAfter(b.lastChild || b);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('#article').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return sel.toString();
  }, { fromSel, toSel, within });
}
const boxState = async (page) => {
  await page.waitForSelector('#copy-box:not([hidden])');
  return page.evaluate(() => ({ loc: document.querySelector('#copy-box-loc').textContent, kind: document.querySelector('#copy-box').dataset.copyKind }));
};
const copied = async (page) => { await page.click('#copy-box-copy'); await page.waitForFunction(() => document.querySelector('#copy-box')?.dataset.copyState !== 'idle'); return page.evaluate(() => navigator.clipboard.readText()); };
const project = () => data.source;

test('title and brand read product:os / project', async () => {
  const { page, context, errors } = await open('start');
  assert.equal(await page.title(), `Spec overview · product:os / ${data.title}`);
  assert.equal((await page.evaluate(() => document.querySelector('#brand-name').textContent)), 'product:os');
  assert.equal((await page.evaluate(() => document.querySelector('#brand-spec').textContent)), `/ ${data.title}`);
  await page.goto(`${url}#us-01`);
  await page.waitForFunction(() => document.title.startsWith('US-01'));
  assert.equal(await page.title(), `US-01 — Lưu bộ lọc · product:os / ${data.title}`);
  assert.ok(/^<title>product:os \/ /.test(fs.readFileSync(path.join(outDir, 'artifact/index.html'), 'utf8')));
  assert.deepEqual(errors, []);
  await context.close();
});

test('selecting a table row copies its real file and line', async () => {
  const { page, context, errors } = await open('us-01');
  const selected = await selectIn(page, 'tbody tr', null, 'AC-01');
  const box = await boxState(page);
  const line = lineOf('us/US-01.md', '| AC-01 |');
  assert.equal(box.kind, 'spec');
  assert.ok(box.loc.startsWith(`${project().specPath}/us/US-01.md:${line}-${line}`), box.loc);
  await page.fill('#copy-box-request', 'Rút gọn cột Then');
  const text = await copied(page);
  assert.equal(text, core.copyFormatSpec({ text: selected.replace(/\t/g, ' | '), rel: 'us/US-01.md', start: line, end: line, ids: ['US-01'], heading: '4. Acceptance Criteria', anchor: 'us-01.4-acceptance-criteria', project: project(), request: 'Rút gọn cột Then' }));
  assert.match(text, new RegExp(`- File: ${project().specPath}/us/US-01\\.md:${line}-${line}\\n`));
  assert.match(text, /\n- Mục: US-01 › "4\. Acceptance Criteria"\n- Trang reader: #us-01\.4-acceptance-criteria\n- Project: ~\/.+ \(spec @ \S+\)\n\nYêu cầu của tôi: Rút gọn cột Then$/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a selection across blocks copies the union line range; a code line is exact', async () => {
  const { page, context } = await open('us-01');
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('#prose h2')].find((e) => e.textContent.includes('4. Acceptance'));
    const row = [...document.querySelectorAll('#prose tbody tr')].find((e) => e.textContent.includes('AC-02'));
    const r = document.createRange(); r.setStartBefore(h.querySelector('.heading-text').firstChild); r.setEndAfter(row.lastElementChild.lastChild);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('#article').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await boxState(page);
  const lo = lineOf('us/US-01.md', '## 4. Acceptance Criteria'), hi = lineOf('us/US-01.md', '| AC-02 |');
  const text = await copied(page);
  assert.match(text, new RegExp(`- File: ${project().specPath}/us/US-01\\.md:${lo}-${hi}\\n`));
  await page.keyboard.press('Escape');
  await context.close();
  const second = await open('us-01');
  const picked = await second.page.evaluate(() => {
    const code = [...document.querySelectorAll('#prose [data-src-fence] code')].find((c) => c.textContent.includes('Filter bar'));
    const w = document.createTreeWalker(code, NodeFilter.SHOW_TEXT); const n = w.nextNode();
    const at = n.nodeValue.indexOf('Filter bar'); const r = document.createRange(); r.setStart(n, at); r.setEnd(n, at + 'Filter bar'.length);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('#article').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return sel.toString();
  });
  assert.equal(picked, 'Filter bar');
  await boxState(second.page);
  const codeLine = lineOf('us/US-01.md', '| Filter bar');
  assert.match(await copied(second.page), new RegExp(`- File: ${project().specPath}/us/US-01\\.md:${codeLine}-${codeLine}\\n`));
  await second.context.close();
});

test('a role view says it is generated and never invents a line', async () => {
  const { page, context } = await open('po-view');
  await selectIn(page, '#prose p');
  await boxState(page);
  const text = await copied(page);
  assert.match(text, /- File: Trang tạo tự động "Product owner view" \(generated:po-view\)/);
  assert.ok(!/\.md:\d+-\d+/.test(text), text);
  await context.close();
});

test('when the clipboard API is refused the text sits selected in a textarea', async () => {
  const { page, context } = await open('us-01', { clipboard: false });
  await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); document.execCommand = () => false; });
  await selectIn(page, 'tbody tr', null, 'AC-02');
  await boxState(page);
  await page.click('#copy-box-copy');
  await page.waitForFunction(() => document.querySelector('#copy-box').dataset.copyState === 'manual');
  const r = await page.evaluate(() => { const t = document.querySelector('#copy-box-text'); return { value: t.value, selected: t.selectionStart === 0 && t.selectionEnd === t.value.length, shown: !document.querySelector('#copy-box-manual').hidden }; });
  assert.ok(r.shown && r.selected);
  assert.match(r.value, /^Sửa đoạn spec này:\n\n> /);
  assert.match(r.value, new RegExp(`- File: ${project().specPath}/us/US-01\\.md:${lineOf('us/US-01.md', '| AC-02 |')}-`));
  await context.close();
});

test('Cmd/Ctrl+Enter copies and Esc closes the box', async () => {
  const { page, context } = await open('us-01');
  await selectIn(page, 'tbody tr', null, 'AC-01');
  await boxState(page);
  await page.keyboard.press('Control+Enter');
  await page.waitForFunction(() => document.querySelector('#copy-box').dataset.copyState === 'api');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^Sửa đoạn spec này:/);
  await selectIn(page, 'tbody tr', null, 'AC-01');
  await boxState(page);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.querySelector('#copy-box').hidden), true);
  await context.close();
});

test('the prototype page annotates an element and copies its source line', async () => {
  const { page, context, errors } = await open('prototype');
  await page.waitForSelector('#proto-frame');
  const frame = page.frameLocator('#proto-frame');
  await frame.locator('#start').waitFor();
  await page.click('#proto-annotate');
  assert.equal(await page.getAttribute('#proto-annotate', 'aria-pressed'), 'true');
  await page.click('[data-goto="SCR-001--normal"]');
  const field = frame.locator('#SCR-001--normal-name');
  await field.scrollIntoViewIfNeeded();
  await field.hover();
  const outlined = await field.evaluate((el) => el.classList.contains('reader-annotate-hover'));
  assert.ok(outlined, 'hover outlines the element');
  await field.click();
  const box = await boxState(page);
  assert.equal(box.kind, 'proto');
  const line = lineOf('prototype/index.html', 'id="SCR-001--normal-name"');
  assert.ok(box.loc.startsWith(`${project().specPath}/prototype/index.html:${line} · SCR-001 normal`), box.loc);
  await page.fill('#copy-box-request', 'Đổi nhãn thành Tên bộ lọc');
  const text = await copied(page);
  const screen = data.prototype.screens[0];
  assert.equal(text, core.copyFormatPrototype({ screen: 'SCR-001', title: 'Saved filters', state: 'normal', role: 'textbox', text: 'Filter name', line, related: screen.related, project: project(), request: 'Đổi nhãn thành Tên bộ lọc' }));
  assert.match(text, /^Sửa phần tử prototype này:\n\n- Màn: SCR-001 Saved filters · state: normal\n- Phần tử: textbox "Filter name"\n/);
  assert.deepEqual(errors, []);
  await page.click('#proto-annotate');
  assert.equal(await page.getAttribute('#proto-annotate', 'aria-pressed'), 'false');
  await context.close();
});

test('with Annotate off a click in the prototype follows the link and the new-tab copy is the clean file', async () => {
  const { page, context } = await open('prototype');
  const frame = page.frameLocator('#proto-frame');
  await frame.locator('#start').waitFor();
  await frame.locator('a.button').first().click();
  await page.waitForFunction(() => document.querySelector('#proto-states [aria-current]'));
  assert.equal(await page.evaluate(() => document.querySelector('#copy-box')?.hidden !== false), true);
  assert.equal(await page.getAttribute('#proto-open', 'href'), 'prototype/index.html');
  assert.equal(fs.readFileSync(path.join(outDir, 'offline/prototype/index.html'), 'utf8'), fs.readFileSync(path.join(specDir, 'prototype/index.html'), 'utf8'));
  await context.close();
});

test('the wireframes page shows screens, arrows and a legible contents list', async () => {
  const { page, context } = await open('wireframe-plan');
  const r = await page.evaluate(() => ({
    frames: document.querySelectorAll('.screen-frame').length, chrome: document.querySelectorAll('.screen-frame .code-head, .screen-frame [data-copy-code]').length,
    heads: [...document.querySelectorAll('#prose h3 .heading-text')].map((h) => h.textContent), toc: [...document.querySelectorAll('#toc .toc-link')].map((a) => a.textContent),
    flows: [...document.querySelectorAll('.flow-cell')].map((c) => c.textContent), tier: document.querySelector('.tier-banner')?.textContent || '', crumbs: document.querySelector('.breadcrumb-list')?.textContent || '',
  }));
  assert.equal(r.frames, 8); assert.equal(r.chrome, 0);
  assert.equal(r.heads[0], 'SCR-001 · Saved filters — normal');
  assert.ok(r.toc.includes('SCR-002 · Filter result — loading') && !r.toc.some((t) => /--/.test(t)));
  assert.deepEqual(r.flows, ['SCR-001 → SCR-002 (Save filter)', 'SCR-001 → SCR-002 (Open filter)', 'SCR-001 → SCR-002 (Delete filter)']);
  assert.ok(!/How this spec is organised/.test(r.tier) && /Wireframes & prototype/.test(r.tier), r.tier);
  assert.match(r.crumbs, /Wireframes & prototype/);
  await context.close();
});

test('the "*" mark has a legend and a tooltip that match the code', async () => {
  const { page, context } = await open('wireframe-plan');
  const legend = await page.evaluate(() => document.querySelector('#recent-legend').textContent);
  assert.match(legend, new RegExp(`${data.changes.recentDays} ngày.*${data.changes.newest}|${data.changes.recentDays} days.*${data.changes.newest}`));
  const chip = page.locator('.page-meta .change-chip').first();
  await chip.hover();
  await page.waitForSelector('#reader-tip:not([hidden])');
  assert.match(await page.textContent('#reader-tip'), new RegExp(data.changes.newest));
  assert.ok(!/lần đọc trước|since you last/i.test(legend + await page.textContent('#reader-tip')));
  await context.close();
});

test('a list item and a dossier section map to their own source lines', async () => {
  const { page, context } = await open('us-01');
  await page.evaluate(() => {
    const li = [...document.querySelectorAll('#prose li')].find((e) => e.textContent.includes('tên trùng'));
    const r = document.createRange(); r.selectNodeContents(li);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('#article').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await boxState(page);
  const line = lineOf('us/US-01.md', 'Lỗi: tên trùng');
  assert.match(await copied(page), new RegExp(`- File: ${project().specPath}/us/US-01\\.md:${line}-${line}\\n`));
  await page.keyboard.press('Escape');
  await page.goto(`${url}#dossier`);
  await page.waitForSelector('#dos-us-01 tbody tr');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('#dos-us-01 tbody tr')].find((e) => e.textContent.includes('AC-02'));
    const r = document.createRange(); r.selectNodeContents(row);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.querySelector('#article').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await boxState(page);
  const ac2 = lineOf('us/US-01.md', '| AC-02 |');
  const text = await copied(page);
  assert.match(text, new RegExp(`- File: ${project().specPath}/us/US-01\\.md:${ac2}-${ac2}\\n`));
  assert.match(text, /- Trang reader: #us-01\.[a-z0-9-]+\n/);
  await context.close();
});

/* Review fix round. */
const selectEl = (page, sel, within) => page.evaluate(({ sel, within }) => {
  const el = [...document.querySelectorAll(sel)].find((e) => !within || e.textContent.includes(within));
  if (!el) throw new Error(`no element for ${sel}`);
  const r = document.createRange(); r.selectNodeContents(el);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.querySelector('#article').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  return s.toString();
}, { sel, within });

test('a cell under a generated heading without a heading-text span opens the box with no line number', async () => {
  const { page, context, errors } = await open('po-view');
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('#prose h3')].some((h) => h.textContent.trim() === 'Gates' && !h.querySelector('.heading-text'))), 'the Gates heading has no .heading-text');
  await selectEl(page, '#prose h3 + .table-wrap tbody td', '');
  const box = await boxState(page);
  assert.ok(!/\.md:\d/.test(box.loc), box.loc);
  const text = await copied(page);
  assert.match(text, /- File: Trang tạo tự động "Product owner view" \(generated:po-view\)/);
  assert.match(text, /\n- Mục: .*"Gates"\n/);
  assert.ok(!/\.md:\d+-\d+/.test(text), text);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the dossier story title (a heading without heading-text) opens the box and cites no invented line', async () => {
  const { page, context, errors } = await open('dossier');
  await page.waitForSelector('#dos-us-01 .dossier-title');
  await selectEl(page, '#dos-us-01 h2.dossier-title', 'US-01');
  await boxState(page);
  const text = await copied(page);
  assert.match(text, new RegExp(`- File: ${project().specPath}/us/US-01\\.md\\n`));
  assert.deepEqual(errors, []);
  await context.close();
});

test('selecting a wireframe frame chip cites the whole frame, not its first ASCII line', async () => {
  const { page, context } = await open('wireframe-plan');
  await selectEl(page, '.screen-frame .chip', 'normal');
  await boxState(page);
  const raw = rawLines('wireframe/wireframes.md');
  const open1 = raw.findIndex((l) => l.startsWith('```')) + 1;
  const close1 = raw.findIndex((l, i) => i >= open1 && l.startsWith('```')) + 1;
  const text = await copied(page);
  assert.match(text, new RegExp(`- File: ${project().specPath}/wireframe/wireframes\\.md:${open1}-${close1}\\n`));
  await context.close();
});

test('a line inside a Mermaid fence cites the whole fence: the drawn diagram has no text-to-line mapping', async () => {
  const { page, context } = await open('us-01');
  await page.waitForSelector('#prose .diagram[data-done="1"] svg', { timeout: 15000 });
  const picked = await page.evaluate(() => {
    const svg = document.querySelector('#prose .diagram svg');
    const label = [...svg.querySelectorAll('span, text, p')].find((e) => e.textContent.trim().length > 3 && !e.querySelector('*'));
    const r = document.createRange(); r.selectNodeContents(label);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.querySelector('#article').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return label.textContent.trim();
  });
  assert.ok(picked);
  await boxState(page);
  const raw = rawLines('us/US-01.md');
  const open1 = raw.findIndex((l) => l.startsWith('```mermaid')) + 1;
  const close1 = raw.findIndex((l, i) => i >= open1 && l.startsWith('```')) + 1;
  assert.ok(close1 > open1 + 2, 'the fixture fence has several lines');
  assert.match(await copied(page), new RegExp(`- File: ${project().specPath}/us/US-01\\.md:${open1}-${close1}\\n`));
  await context.close();
});

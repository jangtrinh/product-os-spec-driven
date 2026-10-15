import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadContext, openPage, gotoPage } from '../verify/context.mjs';
import { chromiumOrNull, NO_BROWSER } from './helpers.mjs';

/* Measured layout of the role views. A missing browser fails these tests: a skipped layout test proves nothing. */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const out = (name) => path.join(os.tmpdir(), `layout-${process.pid}-${name}`);
let browser; const ctxs = {};
test.before(async () => {
  const chromium = chromiumOrNull(); assert.ok(chromium, NO_BROWSER);
  browser = await chromium.launch();
  for (const f of ['v2/full', 'reader/long-content', 'reader/ledger']) {
    const dir = out(path.basename(f)); fs.rmSync(dir, { recursive: true, force: true });
    const r = spawnSync(process.execPath, [path.join(root, 'tools/reader/render.mjs'), path.join(root, 'fixtures', f), '--out', dir], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr);
    ctxs[path.basename(f)] = loadContext(dir, browser, {});
  }
});
test.after(async () => { await browser?.close(); for (const n of ['full', 'long-content', 'ledger']) fs.rmSync(out(n), { recursive: true, force: true }); });

const view = async (fixture, id, size, fn) => {
  const { page, context } = await openPage(ctxs[fixture], id, { width: size[0], height: size[1] });
  try { await gotoPage(page, id); return await page.evaluate(fn); } finally { await context.close(); }
};
const SIZES = { 1440: [1440, 900], 971: [971, 730], 874: [874, 827], 768: [768, 1024], 375: [375, 812] };
const rowsOfCards = () => { const tops = [...document.querySelectorAll('#article .facts > div')].map((e) => Math.round(e.getBoundingClientRect().top)); return { n: tops.length, rows: new Set(tops).size }; };

test('stat cards share one row where they fit and never leave an orphan beside dead space', async () => {
  for (const [id, n] of [['po-view', 4], ['qa-view', 5]]) {
    const r = await view('full', id, SIZES[1440], rowsOfCards); assert.equal(r.n, n); assert.equal(r.rows, 1, `${id} at 1440 wraps into ${r.rows} rows`);
  }
  const wrapped = await view('full', 'po-view', SIZES[375], () => { const c = [...document.querySelectorAll('#article .facts > div')].map((e) => e.getBoundingClientRect()); return c.every((b) => b.width > 120); });
  assert.ok(wrapped, 'cards stay readable at 375');
});

test('a generated table never hides rows inside its own scroll box', async () => {
  for (const [fx, id, size] of [['full', 'design-view', SIZES[768]], ['full', 'dev-us-01', SIZES[1440]], ['full', 'dev-view', SIZES[375]], ['long-content', 'qa-view', SIZES[1440]]]) {
    const clipped = await view(fx, id, size, () => [...document.querySelectorAll('#article .table-wrap')].filter((w) => w.scrollHeight > w.clientHeight + 2).length);
    assert.equal(clipped, 0, `${fx}/${id} at ${size[0]}`);
  }
});

test('coverage keeps its first column readable and its headline column in view', async () => {
  const r = await view('full', 'coverage', SIZES[1440], () => {
    const t = document.querySelector('#article table'); const w = t.closest('.table-wrap'); const first = t.querySelector('tbody td');
    return { firstWidth: first.getBoundingClientRect().width, text: first.textContent.trim(), clippedX: w.scrollWidth > w.clientWidth + 2, lastVisible: (() => { const h = [...t.querySelectorAll('th')].find((x) => /passed/.test(x.textContent)).getBoundingClientRect(); return h.right <= w.getBoundingClientRect().right + 1; })() };
  });
  assert.ok(r.firstWidth >= 90, `first column ${r.firstWidth}px`); assert.ok(!/E1\s+E1/.test(r.text), r.text); assert.ok(r.lastVisible, 'the passed column is visible without scrolling'); assert.ok(!r.clippedX);
});

test('the role switch is reachable on a role page at 874, 768 and 375 without opening the drawer', async () => {
  for (const size of [SIZES[874], SIZES[768], SIZES[375]]) {
    const r = await view('full', 'po-view', size, () => { const n = document.querySelector('#role-inline'); if (!n) return null; const b = n.getBoundingClientRect(); return { shown: b.width > 0 && b.height > 0, inView: b.top < innerHeight && b.bottom > 0 && b.right <= innerWidth + 1, labels: [...n.querySelectorAll('a')].map((a) => a.textContent) }; });
    assert.ok(r && r.shown && r.inView, `at ${size[0]}`); assert.deepEqual(r.labels, ['PO', 'Dev', 'QA', 'Open items']);
  }
});

test('design previews are not cropped and say what they show', async () => {
  const r = await view('full', 'po-view', SIZES[1440], () => {
    const cards = [...document.querySelectorAll('.screen-card')];
    return { fit: [...new Set(cards.map((c) => getComputedStyle(c.querySelector('img')).objectFit))], text: cards.map((c) => c.querySelector('.screen-card-body').textContent), links: cards.map((c) => !!c.querySelector('a[href]')), widths: cards.map((c) => c.querySelector('img').getBoundingClientRect().width) };
  });
  assert.deepEqual(r.fit, ['contain']); assert.ok(r.links.every(Boolean), 'each card opens the full image'); assert.ok(r.widths.every((w) => w >= 200), JSON.stringify(r.widths));
  assert.ok(r.text[0].includes('Design source: not-created') && r.text[0].includes('Image shown: coded capture') && !/Coded screen/.test(r.text[0]), r.text[0]);
});

test('copy: no "ac · 1 ids", English chrome label, "Open items" in the role switch', async () => {
  const r = await view('full', 'po-view', SIZES[1440], () => ({ body: document.querySelector('#article').textContent, tree: document.querySelector('#tree').textContent, roles: [...document.querySelectorAll('#role-row .role-link')].map((a) => a.textContent) }));
  assert.ok(!/ac · \d+ ids/.test(r.body)); assert.ok(/1 acceptance criterion/.test(r.body)); assert.ok(r.tree.includes('Changes to read') && !r.tree.includes('Thay đổi')); assert.deepEqual(r.roles, ['PO', 'Dev', 'QA', 'Open items']);
});

test('evidence receipts keep id and time in one piece; the dev landing page carries facts and no empty rail', async () => {
  const ev = await view('full', 'evidence-view', SIZES[1440], () => [...document.querySelectorAll('#article tbody tr')].flatMap((tr) => [...tr.querySelectorAll('.keep')].map((e) => ({ h: e.getBoundingClientRect().height, text: e.textContent.trim() }))));
  assert.ok(ev.length >= 8 && ev.every((x) => x.h < 30), JSON.stringify(ev));
  const fit = await view('full', 'evidence-view', SIZES[1440], () => { const w = document.querySelector('#article .table-wrap'); return w.scrollWidth <= w.clientWidth + 1; });
  assert.ok(fit, 'receipts table fits at 1440 without sideways scroll');
  const dev = await view('full', 'dev-view', SIZES[1440], () => ({ facts: document.querySelectorAll('#article .facts > div').length, rail: getComputedStyle(document.querySelector('#toc')).display, text: document.querySelector('#toc').textContent }));
  assert.ok(dev.facts >= 5); assert.equal(dev.rail, 'none');
});

test('long content reaches the PO view and still fits the page', async () => {
  const r = await view('long-content', 'po-view', SIZES[375], () => ({ w: document.documentElement.scrollWidth, iw: innerWidth, text: document.querySelector('#article').textContent.includes('Pneumonoultramicroscopic') }));
  assert.ok(r.text); assert.ok(r.w <= r.iw + 1, `${r.w} > ${r.iw}`);
});

test('the dev landing page does not overflow at 768 (a chip inside a stat card must wrap)', async () => {
  const r = await view('full', 'dev-view', SIZES[768], () => ({ w: document.documentElement.scrollWidth, iw: innerWidth }));
  assert.ok(r.w <= r.iw + 1, `${r.w} > ${r.iw}`);
});

test('a very long epic name wraps inside the story page header at every width', async () => {
  for (const size of [SIZES[375], SIZES[768], SIZES[874], SIZES[1440]]) {
    const r = await view('long-content', 'us-01', size, () => ({ w: document.documentElement.scrollWidth, iw: innerWidth }));
    assert.ok(r.w <= r.iw + 1, `${size[0]}: ${r.w} > ${r.iw}`);
  }
});

test('design-state thumbnails keep a readable width in the table at 768 and 1440', async () => {
  for (const size of [SIZES[768], SIZES[1440]]) {
    const w = await view('full', 'design-view', size, () => [...document.querySelectorAll('#article img.thumb')].map((i) => Math.round(i.getBoundingClientRect().width)));
    assert.ok(w.length >= 8 && Math.min(...w) >= 140, `${size[0]}: smallest thumbnail ${Math.min(...w)}px`);
  }
});

test('on a phone a very long unbroken word in a link or cell wraps instead of hiding in a scroll box', async () => {
  for (const [id, size] of [['po-view', SIZES[375]], ['qa-view', SIZES[375]], ['open-items', SIZES[375]]]) {
    const bad = await view('long-content', id, size, () => [...document.querySelectorAll('#article .table-wrap')].filter((w) => w.scrollWidth > w.clientWidth + 1).length);
    assert.equal(bad, 0, `${id} at ${size[0]}: ${bad} table(s) scroll sideways`);
  }
});

test('the QA behaviour text keeps a readable width at 874 and 1440, as a column or as a card', async () => {
  for (const size of [SIZES[874], SIZES[1440]]) {
    const w = await view('full', 'qa-view', size, () => Math.round(document.querySelector('#article table tbody tr td:nth-child(2)').getBoundingClientRect().width));
    assert.ok(w >= 220, `${size[0]}: behaviour cell ${w}px`);
  }
});

const ROLE_VIEWS = ['qa-view', 'design-view', 'evidence-view', 'coverage', 'dev-view', 'source-ledger', 'open-items', 'po-view'];
test('no generated role table scrolls sideways at any device width: a table too wide for its column becomes cards', async () => {
  for (const fixture of ['full', 'ledger']) for (const size of Object.values(SIZES)) for (const id of ROLE_VIEWS) {
    const r = await view(fixture, id, size, () => { const t = [...document.querySelectorAll('#article .table-wrap:has(table.stack)')]; return { n: t.length, bad: t.filter((x) => x.scrollWidth > x.clientWidth + 1).length }; });
    assert.equal(r.bad, 0, `${fixture}/${id} at ${size[0]}: ${r.bad} of ${r.n} generated table(s) scroll sideways`);
  }
});

test('the QA source-item chips (partial, conflicting) are fully visible on the Fold and on a phone', async () => {
  for (const size of [SIZES[874], SIZES[971], SIZES[375]]) {
    const chips = await view('ledger', 'qa-view', size, () => [...document.querySelectorAll('#article .chip')].filter((c) => /partial|conflicting/.test(c.textContent)).map((c) => { const b = c.getBoundingClientRect(), box = c.closest('.table-wrap').getBoundingClientRect(); return { t: c.textContent.trim(), inside: b.left >= box.left - 1 && b.right <= box.right + 1 && b.width > 0 }; }));
    assert.deepEqual(chips.map((c) => c.t).sort(), ['conflicting', 'partial'], `${size[0]}: chips present`);
    assert.ok(chips.every((c) => c.inside), `${size[0]}: a source-item chip sits outside its table box`);
  }
});

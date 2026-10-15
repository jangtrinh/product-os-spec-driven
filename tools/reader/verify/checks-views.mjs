import fs from 'node:fs';
import path from 'node:path';
import { digest } from '../../lib/digests.mjs';
import { openPage, gotoPage } from './context.mjs';

const VIEWS = ['po-view', 'dev-view', 'qa-view', 'open-items', 'coverage', 'design-view', 'evidence-view', 'source-ledger'];

/* Required role views exist, are not empty and match the counts the data declares. Never skipped: a spec without amendments still gets them. */
export async function viewsCheck(ctx) {
  const v = ctx.data.views || {};
  const { page, context } = await openPage(ctx, 'start');
  const problems = [];
  const rows = {};
  for (const id of VIEWS) {
    if (!ctx.data.pages.some((p) => p.id === id)) { problems.push(`missing view ${id}`); continue; }
    await gotoPage(page, id);
    rows[id] = await page.evaluate(() => ({ h1: document.querySelectorAll('#article h1').length, blocks: document.querySelectorAll('#prose table, #prose .absent, #prose .facts').length, rows: document.querySelectorAll('#prose tbody tr').length, rowIds: document.querySelectorAll('#prose tbody tr[id]').length, text: document.querySelector('#prose').textContent.length }));
    if (rows[id].h1 !== 1 || !rows[id].blocks || rows[id].text < 40) problems.push(`${id} is empty or malformed`);
  }
  if (rows['qa-view'] && rows['qa-view'].rowIds !== v.ac) problems.push(`qa-view has ${rows['qa-view'].rowIds} AC rows, data has ${v.ac}`);
  if (rows['open-items'] && v.open && rows['open-items'].rows !== v.open) problems.push(`open-items has ${rows['open-items'].rows} rows, data has ${v.open}`);
  const panels = ctx.data.pages.filter((p) => /^dev-/.test(p.id) && p.kind === 'view' && p.id !== 'dev-view').length;
  if (panels !== v.stories) problems.push(`${panels} developer panels for ${v.stories} stories`);
  if (rows['coverage']) {
    await gotoPage(page, 'coverage');
    const cells = await page.evaluate(() => [...document.querySelectorAll('#prose tbody td')].map((t) => t.textContent).filter((t) => /\d+ of \d+/.test(t)).length);
    if (v.ac && !cells) problems.push('coverage matrix shows no explicit denominators');
  }
  await context.close();
  return { name: 'views', ok: problems.length === 0, detail: { views: VIEWS.length, panels, problems: problems.slice(0, 8) } };
}

/* Missing, retired, stale, not-created, unverified and no-image states must be on the page that owns them. */
export async function disclosureCheck(ctx) {
  const expect = (ctx.data.views && ctx.data.views.expect) || [];
  const { page, context } = await openPage(ctx, 'start');
  const missing = [];
  const byPage = {};
  for (const e of expect) (byPage[e.page] ||= []).push(e.text);
  for (const [id, texts] of Object.entries(byPage)) {
    await gotoPage(page, id);
    const body = (await page.evaluate(() => document.querySelector('#prose').textContent)).toLowerCase();
    for (const t of texts) if (!body.includes(t.toLowerCase())) missing.push(`${id}: ${t}`);
  }
  await context.close();
  return { name: 'disclosures', ok: missing.length === 0, detail: { expected: expect.length, missing: missing.slice(0, 10) } };
}

/* Accessibility basics on every page: one h1, landmarks, unique ids, alt text, named controls, table headers. */
export async function a11yCheck(ctx) {
  const { page, context } = await openPage(ctx, 'start');
  const ids = await page.evaluate(() => window.specReader.state.data.pages.map((x) => x.id));
  const bad = [];
  const shell = await page.evaluate(() => ({ lang: document.documentElement.lang, main: !!document.querySelector('main'), nav: document.querySelectorAll('nav').length, header: !!document.querySelector('header'), skip: !!document.querySelector('.skip-link') }));
  if (!shell.lang || !shell.main || shell.nav < 2 || !shell.header || !shell.skip) bad.push(`shell landmarks ${JSON.stringify(shell)}`);
  for (const id of ids) {
    if (id === 'dossier') continue;
    await gotoPage(page, id);
    const r = await page.evaluate(() => {
      const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && [...el.getAttribute('aria-labelledby').split(' ')].map((i) => (document.getElementById(i) || {}).textContent).join(' ') || el.textContent || el.getAttribute('title') || (el.id && document.querySelector(`label[for="${el.id}"]`) && 'label') || '').trim();
      const all = [...document.querySelectorAll('[id]')].map((e) => e.id);
      const dup = all.filter((x, i) => all.indexOf(x) !== i);
      const unnamed = [...document.querySelectorAll('#article button, #article a[href], #article input, #article select, #article textarea, #topbar button, #topbar a')].filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 80));
      const noAlt = [...document.querySelectorAll('#article img')].filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src'));
      const noTh = [...document.querySelectorAll('#article table')].filter((t) => !t.querySelector('th')).length;
      return { h1: document.querySelectorAll('#article h1').length, dup: [...new Set(dup)].slice(0, 3), unnamed: unnamed.slice(0, 3), noAlt: noAlt.slice(0, 3), noTh };
    });
    if (r.h1 !== 1 || r.dup.length || r.unnamed.length || r.noAlt.length || r.noTh) bad.push(`${id}: ${JSON.stringify(r)}`);
  }
  await context.close();
  return { name: 'a11y-basics', ok: bad.length === 0, detail: { pages: ids.length - 1, bad: bad.slice(0, 6) } };
}

/* Controls: theme, role links, search focus return, and the page drawer's inert background, focus trap and focus return. */
export async function controlsCheck(ctx) {
  const problems = [];
  const { page, context } = await openPage(ctx, 'po-view', { width: 874, height: 827 });
  const theme = await page.evaluate(() => { const before = document.documentElement.getAttribute('data-theme'); document.querySelector('#btn-theme').click(); return { before, after: document.documentElement.getAttribute('data-theme'), label: document.querySelector('#btn-theme').getAttribute('aria-label') }; });
  if (theme.before === theme.after || !theme.label) problems.push('theme toggle does nothing');
  for (const [id, text] of [['dev-view', 'Dev'], ['qa-view', 'QA'], ['open-items', 'Open'], ['po-view', 'PO']]) {
    await page.click('#btn-pages-show'); await page.waitForTimeout(350);
    await page.click(`.role-link[data-page="${id}"]`); await page.waitForTimeout(450);
    const at = await page.evaluate(() => window.specReader.state.current);
    if (at !== id) problems.push(`role link ${text} went to ${at}`);
  }
  await page.click('#btn-pages-show'); await page.waitForTimeout(350);
  const drawer = await page.evaluate(() => ({ inert: document.querySelector('#content-card').inert, locked: document.body.style.overflow, inDrawer: !!document.activeElement.closest('#pages-card'), modal: document.querySelector('#pages-card').getAttribute('aria-modal') }));
  if (!drawer.inert || drawer.locked !== 'hidden' || !drawer.inDrawer || drawer.modal !== 'true') problems.push(`drawer floor ${JSON.stringify(drawer)}`);
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('Tab');
  if (!(await page.evaluate(() => !!document.activeElement.closest('#pages-card')))) problems.push('focus escaped the drawer');
  await page.keyboard.press('Escape'); await page.waitForTimeout(450);
  const closed = await page.evaluate(() => ({ inert: document.querySelector('#content-card').inert, locked: document.body.style.overflow, focus: document.activeElement.id }));
  if (closed.inert || closed.locked === 'hidden' || closed.focus !== 'btn-pages-show') problems.push(`drawer did not restore ${JSON.stringify(closed)}`);
  await page.click('#btn-search'); await page.waitForTimeout(250);
  const search = await page.evaluate(() => ({ inert: document.querySelector('#shell').inert, inField: document.activeElement.id }));
  if (!search.inert || search.inField !== 'search-input') problems.push(`search floor ${JSON.stringify(search)}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  if (await page.evaluate(() => document.activeElement.id) !== 'btn-search') problems.push('search did not return focus to its opener');
  await context.close();
  return { name: 'controls', ok: problems.length === 0, detail: { problems } };
}

/* Skin contract: the parsed content is byte-for-byte what the render recorded, after the skin booted and the reader was used. */
export async function skinContractCheck(ctx) {
  const problems = [];
  const recorded = ctx.report.contentDigest;
  if (!recorded) problems.push('render-report has no contentDigest');
  const { page, context } = await openPage(ctx, 'start');
  await gotoPage(page, 'qa-view'); await page.click('#btn-theme');
  await page.keyboard.press('Control+k'); await page.keyboard.type('filter'); await page.keyboard.press('Escape');
  const live = await page.evaluate(() => JSON.parse(JSON.stringify(window.SPEC_DATA)));
  const state = await page.evaluate(() => ({ ready: document.documentElement.dataset.readerSkin, paths: document.querySelectorAll('.brand-mark svg path').length, icons: document.querySelectorAll('svg[data-icon]').length, brand: document.querySelector('#brand-name').textContent }));
  await context.close();
  /* The native shell prepends its own generated pages (overview, chain, decisions, dossier) at start-up; those are not content. */
  const stripped = (d) => ({ ...d, pages: d.pages.filter((p) => !(p.generated && p.kind !== 'view' && p.kind !== 'prototype')) });
  if (recorded && digest(stripped(live)) !== recorded) problems.push('SPEC_DATA changed after the skin booted');
  const artifactJson = path.join(ctx.artifactDir, 'content.json');
  if (recorded && fs.existsSync(artifactJson) && digest(JSON.parse(fs.readFileSync(artifactJson, 'utf8'))) !== recorded) problems.push('artifact content.json differs from the offline data');
  if (state.ready !== 'ready' || state.paths < 6 || state.icons < 3 || state.brand !== 'product:os') problems.push(`skin state ${JSON.stringify(state)}`);
  const reduced = await ctx.browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const rp = await reduced.newPage(); await rp.goto(ctx.url('start')); await rp.waitForSelector('#prose');
  if (await rp.evaluate(() => document.querySelector('.brand-mark').dataset.brandCube) !== 'static') problems.push('reduced motion does not keep the brand static');
  await reduced.close();
  return { name: 'skin-contract', ok: problems.length === 0, detail: { recorded: recorded && recorded.slice(0, 12), state, problems } };
}

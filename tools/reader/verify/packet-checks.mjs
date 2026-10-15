import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonical } from '../../lib/config/strict-json.mjs';
import { sha256 } from '../../lib/config/path-selection.mjs';
import { schema, validateSchema } from '../../lib/config/schema-validation.mjs';
import { VIEWPORTS } from './checks-ui.mjs';
import { readParts, sourceBindingProblems, viewBindingCheck } from './packet-view-checks.mjs';

/* Checks one generated review packet folder over file://. Every check names what it proves; none approves anything. */
export async function packetChecks(browser, dir, { proofDir } = {}) {
  const file = path.join(dir, 'index.html');
  const url = pathToFileURL(file).href;
  const html = fs.readFileSync(file, 'utf8');
  const dataFile = path.join(dir, 'packet-data.json');
  const results = [];
  const add = (name, ok, detail) => results.push({ name, ok, detail });
  const bytes = fs.readFileSync(dataFile, 'utf8');
  const embedded = /<script id="packet-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  const data = embedded ? JSON.parse(embedded[1]) : null;
  const packetId = /data-packet-id="([^"]+)"/.exec(html)?.[1];
  add('packet-digest', !!data && canonical(data) === bytes && packetId === `packet-${sha256(bytes)}`, { packetId, fileDigest: sha256(bytes).slice(0, 12), embeddedMatchesFile: !!data && canonical(data) === bytes });
  /* The shipped markup is rebuilt from the embedded data with the repository renderer and compared; pins re-checked on the same bytes. */
  const parts = readParts(html);
  const bindProblems = sourceBindingProblems(parts);
  add('packet-source-binding', bindProblems.length === 0, { problems: bindProblems.slice(0, 5) });
  results.push(...await viewBindingCheck(browser, { file, html, parts }));
  const open = async (viewport, scheme = 'light') => {
    const context = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] }, colorScheme: scheme, acceptDownloads: true });
    const page = await context.newPage(); const errors = []; const external = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { if (/^https?:/.test(r.url())) external.push(r.url()); });
    await page.goto(url); await page.waitForTimeout(300);
    return { page, context, errors, external };
  };
  const wide = [];
  for (const scheme of ['light', 'dark']) {
    for (const vp of VIEWPORTS) {
      const { page, context, errors, external } = await open(vp, scheme);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (m.sw > m.iw + 1) wide.push(`${vp.join('x')} ${scheme}: ${m.sw}>${m.iw}`);
      if (errors.length || external.length) add(`console-network ${vp.join('x')} ${scheme}`, false, { errors, external });
      if (proofDir) await page.screenshot({ path: path.join(proofDir, `packet-${vp[0]}x${vp[1]}-${scheme}.png`), fullPage: true });
      await context.close();
    }
  }
  add('packet-overflow', wide.length === 0, { wide, matrix: '4 viewports x light and dark' });
  const { page, context } = await open([1440, 900]);
  const a11y = await page.evaluate(() => {
    const name = (el) => (el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`) && 'label') || (el.closest('label') && 'label') || el.textContent || '').trim();
    const unnamed = [...document.querySelectorAll('button, input:not([type=radio]):not([type=checkbox]), select, textarea, a[href]')].filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 70));
    const radios = [...document.querySelectorAll('input[type=radio], input[type=checkbox]')].filter((e) => !(e.closest('label') && e.closest('label').textContent.trim())).length;
    return { lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length, main: !!document.querySelector('main'), nav: !!document.querySelector('nav'), skip: !!document.querySelector('.skip'), unnamed, radios, tables: [...document.querySelectorAll('table')].filter((t) => !t.querySelector('th')).length, regions: [...document.querySelectorAll('.table-wrap')].every((w) => w.getAttribute('tabindex') === '0' && w.getAttribute('role') === 'region') };
  });
  add('packet-a11y', a11y.lang && a11y.h1 === 1 && a11y.main && a11y.nav && a11y.skip && !a11y.unnamed.length && !a11y.radios && !a11y.tables && a11y.regions, a11y);
  const binding = await page.evaluate(async () => { for (let i = 0; i < 50 && !document.querySelector('#binding-check').dataset.tone; i += 1) await new Promise((r) => setTimeout(r, 100)); return document.querySelector('#binding-check').dataset.tone; });
  add('packet-source-binding-ui', binding === 'ok', { tone: binding });
  const digest = await page.textContent('#digest-check');
  add('packet-digest-ui', /matches the packet id/.test(digest), { digest });
  if (binding !== 'ok' || !/matches the packet id/.test(digest)) {
    let downloaded = false; page.on('download', () => { downloaded = true; });
    const disabled = await page.isDisabled('#export');
    await page.$eval('#export', el => el.click()); await page.waitForTimeout(350);
    const preview = await page.textContent('#decision-preview');
    add('packet-export-disabled', disabled && !downloaded && !preview && !(await page.isVisible('#preview-box')), {disabled, downloaded, preview: !!preview});
    add('packet-export', false, {verificationBlocked: true});
    await context.close(); return results;
  }
  await page.click('#export');
  const empty = await page.textContent('#export-status');
  await page.check('input[name="default"][value="defer"]'); await page.fill('#by', 'po@example.test');
  await page.click('#export');
  const noReason = await page.textContent('#export-status');
  await page.fill('#reason', 'Needs a second look');
  const sel = await page.$('input[data-override]');
  const ovId = await sel.getAttribute('data-override');
  await page.check(`input[data-override="${ovId}"][value="approve"]`);
  await page.click('#export');
  const noOverrideReason = await page.textContent('#export-status');
  await page.fill(`[data-override-reason="${ovId}"]`, 'This story is ready');
  const got = await Promise.all([page.waitForEvent('download', { timeout: 4000 }), page.click('#export')]).then(([d]) => d, () => null);
  let decision = {}; let schemaOk = false;
  if (got) {
    const saved = path.join(proofDir || dir, '.decision-check.json'); await got.saveAs(saved);
    decision = JSON.parse(fs.readFileSync(saved, 'utf8')); fs.rmSync(saved);
    schemaOk = true; try { validateSchema(decision, schema('batch-decision.schema.json'), 'decision'); } catch { schemaOk = false; }
  }
  add('packet-export', !!got && /Choose a decision/.test(empty) && /Give a reason\./.test(noReason) && /reason for the approve/i.test(noOverrideReason) && schemaOk && decision.packet_id === packetId && decision.data_sha256 === sha256(bytes) && decision.default === 'defer' && decision.overrides.length === 1 && decision.overrides[0].id === ovId,
    { downloaded: !!got, emptyBlocked: /Choose a decision/.test(empty), reasonRequired: /Give a reason\./.test(noReason), overrideReasonRequired: /reason for the approve/i.test(noOverrideReason), schemaOk, id: decision.id, overrides: decision.overrides });
  await page.focus('body');
  let reached = false;
  for (let i = 0; i < 120 && !reached; i += 1) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement && document.activeElement.id === 'export'); }
  add('packet-keyboard', reached, { exportReachableByTab: reached });
  await page.click('#theme-toggle');
  add('packet-theme', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== null, {});
  await context.close();
  return results;
}

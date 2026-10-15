import fs from 'node:fs';
import path from 'node:path';

/* Folder (artifact) mode: serve the artifact folder from a fake origin through request interception (no port is bound), wrap index.html
   in a page skeleton the way the artifact host does, and check that the shell loads content.json, marked and mermaid from its own folder. */
export async function artifactModeCheck(ctx) {
  const dir = ctx.artifactDir;
  if (!fs.existsSync(path.join(dir, 'index.html'))) return { name: 'artifact-mode', ok: true, detail: { skipped: 'no artifact folder rendered' } };
  const origin = 'https://spec-reader.test';
  const context = await ctx.browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errs = []; const foreign = [];
  const mimes = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  await context.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) { foreign.push(u.href); return route.abort(); }
    const f = path.join(dir, decodeURIComponent(u.pathname === '/' ? 'index.html' : u.pathname));
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(f);
    if (f.endsWith('index.html')) body = Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`);
    return route.fulfill({ status: 200, contentType: mimes[path.extname(f)] || 'application/octet-stream', body });
  });
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(e.message));
  const first = (ctx.data.chain && ctx.data.chain.stories[0] && ctx.data.chain.stories[0].page) || 'start';
  await page.goto(`${origin}/#${first}`);
  await page.waitForSelector('#prose', { timeout: 20000 });
  await page.waitForFunction((x) => window.specReader && window.specReader.state.current === x, first, { timeout: 20000 });
  await page.evaluate(() => window.specReader.renderAll());
  await page.waitForFunction(() => { const s = window.specReader.diagramStats(document); return s.rendered + s.failed >= s.total; }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ h1: document.querySelector('.page-title').textContent, stats: window.specReader.diagramStats(document), pages: window.specReader.state.data.pages.length, mode: window.specReader.mode }));
  await page.goto(`${origin}/#start`);
  await page.waitForSelector('#prose');
  await page.waitForFunction(() => window.specReader.state.current === 'start', null, { timeout: 20000 });
  await page.evaluate(() => window.specReader.renderAll());
  await page.waitForFunction(() => { const s = window.specReader.diagramStats(document); return s.rendered + s.failed >= s.total; }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
  r.landing = await page.evaluate(() => window.specReader.diagramStats(document));
  const img = ctx.data.chain && ctx.data.chain.boards[0] ? ctx.data.chain.boards[0].png : '';
  if (img) r.imageStatus = await page.evaluate((u) => fetch(u).then((x) => x.status), img);
  if (ctx.opts.proofDir) await page.screenshot({ path: path.join(ctx.opts.proofDir, 'artifact-mode-1440x900-light.png') });
  await context.close();
  const waived = (ctx.opts.waiveDiagrams || []).length > 0;
  const ok = r.mode === 'folder' && r.pages === ctx.data.counts.pages && (r.stats.failed === 0 || waived) && r.landing.failed === 0 && r.landing.rendered === r.landing.total && (!img || r.imageStatus === 200) && !errs.length && !foreign.length;
  return { name: 'artifact-mode', ok, detail: { ...r, consoleErrors: errs.slice(0, 5), foreignRequests: foreign.slice(0, 5) } };
}

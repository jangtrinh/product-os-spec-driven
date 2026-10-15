import { openPage, gotoPage, renderAll, probe } from './context.mjs';

/* Page-tree toggle rule: exactly one visible "Show pages" / "Hide pages" button in every state and width, never one in the top bar. */
export async function pageToggleCheck(ctx) {
  const rows = [];
  const target = probe(ctx.data).anyPage;
  for (const w of [375, 640, 768, 874, 899, 900, 1024, 1279, 1280, 1440, 1920]) {
    const { page, context } = await openPage(ctx, target, { width: w, height: 800 });
    const count = () => page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight; };
      const names = [...document.querySelectorAll('button')].filter((b) => /^\s*(Show|Hide) pages\s*$/.test(b.textContent) && vis(b)).map((b) => `${b.textContent.trim()}@${b.closest('#topbar') ? 'topbar' : b.closest('#pages-card') ? 'pages-card' : 'content-header'}`);
      const topbar = [...document.querySelectorAll('#topbar button')].map((b) => b.textContent.trim()).filter((t) => /pages/i.test(t) && !/^Search/.test(t));
      return { names, topbar };
    });
    const row = { width: w, initial: await count() };
    if (w >= 1280) {
      await page.click('#btn-pages-hide'); await page.waitForTimeout(250); row.afterHide = await count();
      await page.click('#btn-pages-show'); await page.waitForTimeout(250); row.afterShow = await count();
    } else {
      await page.click('#btn-pages-show'); await page.waitForTimeout(450); row.drawerOpen = await count();
      await page.keyboard.press('Escape'); await page.waitForTimeout(450); row.drawerClosed = await count();
    }
    row.ok = [row.initial, row.afterHide, row.afterShow, row.drawerOpen, row.drawerClosed].filter(Boolean).every((c) => c.names.length === 1 && c.topbar.length === 0);
    rows.push(row);
    await context.close();
  }
  return { name: 'page-toggles', ok: rows.every((r) => r.ok), detail: { widths: rows.length, bad: rows.filter((r) => !r.ok).map((r) => ({ width: r.width, initial: r.initial })) } };
}

/* Image rule, evaluated in the page. A wireframe image is allowed only on a wireframe page or with the "not built yet" caption; a denied shot never appears. */
const IMAGE_RULE = ([deny]) => {
  const st = window.specReader.state;
  const page = st.pages[st.current];
  const bad = [];
  document.querySelectorAll('#article img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (/\/wireframes\//.test(src) && !(page && page.wireframe) && !(img.alt || '').includes('Coded screen not built yet')) bad.push({ page: st.current, why: 'wireframe image outside a wireframe section', src });
    if (deny.some((d) => src.endsWith(d))) bad.push({ page: st.current, why: 'denied shot', src });
  });
  return bad;
};

export async function imageRuleCheck(ctx) {
  const deny = (ctx.data.imageDeny || []).map((d) => `images/${d}`);
  const { page, context } = await openPage(ctx, 'start');
  const ids = await page.evaluate(() => window.specReader.state.data.pages.map((x) => x.id));
  const violations = [];
  let withImages = 0;
  for (const id of ids) {
    if (id === 'dossier') continue;
    await gotoPage(page, id);
    withImages += await page.evaluate(() => (document.querySelectorAll('#article img').length ? 1 : 0));
    violations.push(...await page.evaluate(IMAGE_RULE, [deny]));
  }
  /* Red proof: inject a wireframe image (and a denied one) into a page that is not a wireframe page; the rule must report both. */
  const host = probe(ctx.data).nonWireframe || 'start';
  await gotoPage(page, host);
  const inject = (src) => page.evaluate((s) => { const i = document.createElement('img'); i.alt = 'injected'; i.src = s; document.querySelector('#prose').appendChild(i); }, src);
  await inject('images/ux/wireframes/png/injected-probe.png');
  const redWireframe = (await page.evaluate(IMAGE_RULE, [deny])).length > 0;
  let redDenied = null;
  if (deny.length) { await inject(deny[0]); redDenied = (await page.evaluate(IMAGE_RULE, [deny])).filter((v) => v.why === 'denied shot').length > 0; }
  await context.close();
  const detail = { pagesChecked: ids.length - 1, pagesWithImages: withImages, violations: violations.slice(0, 10), redProof: { wireframeInjected: redWireframe ? 'detected' : 'NOT DETECTED', deniedInjected: redDenied === null ? 'skipped (manifest has no images.deny)' : redDenied ? 'detected' : 'NOT DETECTED' } };
  return { name: 'image-rule', ok: !violations.length && redWireframe && redDenied !== false, detail };
}

export async function searchCheck(ctx) {
  const p0 = probe(ctx.data);
  const word = (ctx.data.pages.find((p) => p.id === p0.anyPage).title.match(/[A-Za-zÀ-ỹ]{4,}/) || ['spec'])[0];
  const { page, context, errors } = await openPage(ctx, 'start');
  const r = {};
  await page.keyboard.press('Control+k');
  r.opens = await page.evaluate(() => !document.querySelector('#search-layer').hidden);
  await page.keyboard.type(word);
  await page.waitForTimeout(300);
  r.results = await page.evaluate(() => document.querySelectorAll('.search-item').length);
  await page.keyboard.press('ArrowDown');
  r.selectedAfterDown = await page.evaluate(() => (document.querySelector('.search-item[aria-selected="true"]') || { dataset: {} }).dataset.i);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  r.hashAfterEnter = await page.evaluate(() => location.hash);
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  r.closes = await page.evaluate(() => document.querySelector('#search-layer').hidden);
  await context.close();
  return { name: 'search', ok: r.opens && r.results > 0 && r.hashAfterEnter.length > 1 && r.closes && !errors.length, detail: { term: word, ...r, pageErrors: errors.slice(0, 3) } };
}

/* Overflow at 375, 768, 1440 and the Fold 7 inner screen 874x827, in light and dark: no page may scroll sideways. */
export const VIEWPORTS = [[375, 812], [768, 1024], [1440, 900], [874, 827]];
export async function overflowChecks(ctx) {
  const out = [];
  for (const scheme of ['light', 'dark']) {
    for (const [width, height] of VIEWPORTS) {
      const { page, context } = await openPage(ctx, 'start', { width, height }, scheme);
      const ids = await page.evaluate(() => window.specReader.state.data.pages.map((x) => x.id));
      const wide = [];
      for (const id of ids) {
        if (id === 'dossier') continue;
        await gotoPage(page, id);
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        if (m.sw > m.iw + 1) wide.push(`${id}: ${m.sw}>${m.iw}`);
      }
      await page.evaluate(() => { location.hash = '#dossier'; });
      await page.waitForFunction(() => /pages rendered/.test((document.querySelector('.dossier-progress') || {}).textContent || ''), null, { timeout: 90000 });
      await renderAll(page);
      const dm = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (dm.sw > dm.iw + 1) wide.push(`dossier: ${dm.sw}>${dm.iw}`);
      out.push({ viewport: `${width}x${height} ${scheme}`, pagesChecked: ids.length, wide });
      await context.close();
    }
  }
  return { name: 'overflow', ok: out.every((o) => !o.wide.length), detail: out.map((o) => ({ viewport: o.viewport, pagesChecked: o.pagesChecked, wide: o.wide.slice(0, 6) })) };
}

/* Behaviour: copy-link, copy-code, lightbox, pager, deep link, sticky table header, tree hide/show. A behaviour the spec has no element for is listed as skipped. */
export async function interactionChecks(ctx) {
  const p0 = probe(ctx.data);
  const target = p0.storyWithBoard || p0.story || p0.tablePage || p0.anyPage;
  const { page, context, errors } = await openPage(ctx, target);
  const r = {}; const skipped = [];
  const toast = () => page.evaluate(() => document.querySelector('#toast').textContent);
  if (await page.$('#prose h2')) {
    await page.hover('#prose h2'); await page.click('#prose h2 .anchor-btn'); await page.waitForTimeout(250); r.anchorToast = await toast();
  } else skipped.push('copy-link (no heading)');
  if (await page.$('#prose [data-copy-code]')) { await page.click('#prose [data-copy-code]'); await page.waitForTimeout(250); r.codeToast = await toast(); } else skipped.push('copy-code (no code block)');
  r.nextLabel = await page.evaluate(() => (document.querySelector('#pager a.next') || { getAttribute: () => '' }).getAttribute('aria-label'));
  if (r.nextLabel) { await page.click('#pager a.next'); await page.waitForTimeout(300); r.afterNext = await page.evaluate(() => location.hash); }
  const hp = ctx.data.pages.find((p) => p.id === target);
  const head = hp && p0.heading(hp);
  if (head) {
    await page.goto(ctx.url(target)); await page.waitForSelector('#prose');
    const id = await page.evaluate((t) => { const h = [...document.querySelectorAll('#prose h2, #prose h3')].find((x) => x.textContent.includes(t)); return h ? h.id : ''; }, head.replace(/[*_`]/g, '').slice(0, 14));
    if (id) { await page.goto(ctx.url(`${target}.${id}`)); await page.waitForSelector('#prose'); await page.waitForTimeout(1500); r.deepLinkScrolled = await page.evaluate((x) => { const h = document.getElementById(x); return !!h && Math.abs(h.getBoundingClientRect().top) < 200; }, id); } else skipped.push('deep link (heading id not found)');
  } else skipped.push('deep link (no heading)');
  if (p0.tablePage) {
    await page.goto(ctx.url(p0.tablePage)); await page.waitForSelector('#prose');
    r.tableSticky = await page.evaluate(() => { const th = document.querySelector('.table-wrap th'); return !!th && getComputedStyle(th).position === 'sticky'; });
    r.tableScrollBox = await page.evaluate(() => { const w = document.querySelector('.table-wrap'); return ['auto', 'scroll'].includes(getComputedStyle(w).overflowX); });
  } else skipped.push('table (no table in any page)');
  if (p0.imagePage) {
    await page.goto(ctx.url(p0.imagePage)); await page.waitForSelector('#prose img');
    await page.click('#prose img');
    r.lightboxOpen = await page.evaluate(() => !document.querySelector('#lightbox').hidden);
    await page.keyboard.press('Escape');
    r.lightboxClosed = await page.evaluate(() => document.querySelector('#lightbox').hidden);
    r.lazyImages = await page.evaluate(() => [...document.querySelectorAll('#prose img')].every((i) => i.loading === 'lazy'));
  } else skipped.push('lightbox (no image in any page)');
  await page.goto(ctx.url('start')); await page.waitForSelector('#prose');
  await page.click('#btn-pages-hide'); r.treeHidden = await page.evaluate(() => document.querySelector('#shell').classList.contains('pages-hidden'));
  await page.click('#btn-pages-show'); r.treeShown = await page.evaluate(() => !document.querySelector('#shell').classList.contains('pages-hidden'));
  await context.close();
  const bad = Object.entries(r).filter(([k, v]) => v === false || (k.endsWith('Toast') && !v) || (k === 'afterNext' && !v));
  return { name: 'interactions', ok: bad.length === 0 && !errors.length, detail: { ...r, skipped, failing: bad.map(([k]) => k), pageErrors: errors.slice(0, 3) } };
}

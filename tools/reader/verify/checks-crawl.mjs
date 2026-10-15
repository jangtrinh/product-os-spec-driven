import fs from 'node:fs';
import path from 'node:path';
import { openPage, gotoPage, renderAll } from './context.mjs';

/* Opens every page once and records diagrams, ids, links, images and the hash links of the dossier. Returns raw findings. */
async function crawl(ctx) {
  const { page, context, errors, external } = await openPage(ctx, 'start');
  const ids = await page.evaluate(() => window.specReader.state.data.pages.map((x) => x.id));
  const out = { pages: ids.length, diagrams: { total: 0, rendered: 0, failed: 0, failedPages: [] }, ids: {}, links: [], local: [], images: { total: 0, broken: [] }, chain: null, chainIds: [], dossier: null };
  for (const id of ids) {
    if (id === 'dossier') continue;
    await gotoPage(page, id);
    const r = await page.evaluate(async () => {
      const st = window.specReader.diagramStats(document.querySelector('#article'));
      const idset = [...document.querySelectorAll('#article [id]')].map((e) => e.id);
      const links = [...document.querySelectorAll('#article a')].map((a) => a.getAttribute('href') || a.getAttribute('xlink:href') || '').filter((h) => h.startsWith('#') && h.length > 1);
      const local = [...document.querySelectorAll('#article a[href]')].map((a) => a.getAttribute('href')).filter((h) => h && !/^(#|[a-z][a-z0-9+.-]*:)/i.test(h));
      const imgs = [...document.querySelectorAll('#article img')];
      imgs.forEach((i) => { i.loading = 'eager'; });
      await Promise.all(imgs.map((i) => i.decode().catch(() => null)));
      return { st, idset, links, local, nimg: imgs.length, broken: imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')) };
    });
    out.diagrams.total += r.st.total; out.diagrams.rendered += r.st.rendered; out.diagrams.failed += r.st.failed;
    if (r.st.failed || r.st.rendered < r.st.total) out.diagrams.failedPages.push({ id, ...r.st });
    out.ids[id] = r.idset;
    r.links.forEach((l) => out.links.push([id, l]));
    r.local.forEach((l) => out.local.push([id, l]));
    out.images.total += r.nimg; out.images.broken.push(...r.broken.map((b) => `${id}: ${b}`));
  }
  if (ctx.data.chain) {
    out.chainIds = [...ctx.data.chain.reqs.map((r) => r.id.toLowerCase()), ...ctx.data.chain.stories.map((x) => x.id.toLowerCase())];
    out.chain = await page.evaluate(async () => {
      const c = window.specReader.state.data.chain;
      const tokens = [...c.reqs.map((r) => r.id.toLowerCase()), ...c.stories.map((s) => s.id.toLowerCase())];
      let ok = 0; let bad = 0;
      location.hash = '#reference-chain';
      await new Promise((r) => setTimeout(r, 300));
      for (const t of tokens) {
        history.replaceState(null, '', `#reference-chain.${t}`);
        const sel = document.querySelector('#chain-select');
        sel.value = t.toUpperCase();
        sel.dispatchEvent(new Event('change'));
        await window.specReader.renderAll();
        const st = window.specReader.diagramStats(document.querySelector('#chain-result'));
        if (st.rendered === st.total && st.total > 0 && !st.failed) ok += 1; else bad += 1;
      }
      return { tokens: tokens.length, ok, bad };
    });
  }
  await page.evaluate(() => { location.hash = '#dossier'; });
  await page.waitForFunction(() => /pages rendered/.test((document.querySelector('.dossier-progress') || {}).textContent || ''), null, { timeout: 90000 });
  await renderAll(page);
  out.dossier = await page.evaluate(() => ({ ...window.specReader.diagramStats(document.querySelector('#prose')), sections: document.querySelectorAll('.dossier-page').length, ids: [...document.querySelectorAll('#prose [id]')].map((e) => e.id) }));
  out.consoleErrors = errors; out.external = external;
  await context.close();
  return out;
}

function deadLinks(c) {
  const pages = new Set(Object.keys(c.ids)); pages.add('dossier');
  const dos = new Set(c.dossier.ids);
  const dead = [];
  for (const [from, h] of c.links) {
    const body = h.slice(1); const dot = body.indexOf('.');
    const pg = dot < 0 ? body : body.slice(0, dot); const tok = dot < 0 ? '' : body.slice(dot + 1);
    let ok = pages.has(pg);
    if (ok && tok) ok = pg === 'dossier' ? dos.has(`dos-${tok}`) : pg === 'reference-chain' ? c.chainIds.includes(tok) || c.ids[pg].includes(tok) : c.ids[pg].includes(tok);
    if (!ok) dead.push(`${from} -> ${h}`);
  }
  return { total: c.links.length, unique: new Set(c.links.map((l) => l[1])).size, dead: [...new Set(dead)] };
}

/* waived = page ids whose diagram failures are accepted on purpose (--allow-diagram-failure); they are listed in the report, never silent. */
export async function crawlChecks(ctx) {
  const c = await crawl(ctx);
  const waived = new Set(ctx.opts.waiveDiagrams || []);
  const failedPages = c.diagrams.failedPages.filter((f) => !waived.has(f.id));
  const waivedFailed = c.diagrams.failedPages.filter((f) => waived.has(f.id)).reduce((n, f) => n + f.failed, 0);
  const links = deadLinks(c);
  const deadLocal = [...new Set(c.local.filter(([, h]) => !fs.existsSync(path.join(ctx.offlineDir, decodeURIComponent(h.split('#')[0].split('?')[0])))).map(([from, h]) => `${from} -> ${h}`))];
  const expectedDossier = ctx.data.pages.filter((p) => !p.generated && p.layer !== 'readable').length;
  const checks = [
    { name: 'pages-render', ok: c.pages === ctx.data.counts.pages && c.pages > 0, detail: { pages: c.pages } },
    { name: 'console-and-network', ok: !c.consoleErrors.length && !c.external.length, detail: { consoleErrors: c.consoleErrors.slice(0, 5), externalRequests: c.external.slice(0, 5) } },
    { name: 'diagrams', ok: failedPages.length === 0, detail: { total: c.diagrams.total, rendered: c.diagrams.rendered, failed: c.diagrams.failed, failedPages: failedPages.slice(0, 10), waived: c.diagrams.failedPages.filter((f) => waived.has(f.id)).map((f) => f.id) } },
    { name: 'local-files', ok: deadLocal.length === 0, detail: { total: c.local.length, dead: deadLocal.slice(0, 10) } },
    { name: 'images', ok: c.images.broken.length === 0, detail: { total: c.images.total, broken: c.images.broken.slice(0, 10) } },
    { name: 'links', ok: links.dead.length === 0 && links.total > 0, detail: { total: links.total, unique: links.unique, dead: links.dead.length, deadList: links.dead.slice(0, 20) } },
    { name: 'dossier', ok: c.dossier.sections === expectedDossier && c.dossier.failed <= waivedFailed, detail: { sections: c.dossier.sections, expected: expectedDossier, diagrams: `${c.dossier.rendered}/${c.dossier.total}` } },
  ];
  if (c.chain) checks.push({ name: 'chain-diagrams', ok: c.chain.bad === 0 && c.chain.ok > 0, detail: c.chain });
  return checks;
}

import { openPage, gotoPage } from './context.mjs';

/* Check the rendered consumer: dated rows carry exact target links and searchable chips. */
export async function recentChangesCheck(ctx) {
  const changes = ctx.data.changes;
  if (!changes) return { name: 'recent-changes', ok: true, detail: { skipped: 'content predates recent changes' } };
  const { page, context } = await openPage(ctx, 'changes-to-read');
  try {
    const expected = ctx.data.pages.filter((p) => p.recent).length
      + (ctx.data.decisions?.items || []).filter((d) => d.recent).length
      + (ctx.data.amendments?.items || []).filter((a) => a.recent).length;
    const list = await page.evaluate(() => {
      const d = window.specReader.state.data;
      const rows = [...document.querySelectorAll('#prose tbody tr')];
      return {
        title: document.querySelector('.page-title').textContent,
        topEntry: !!document.querySelector('#tree .tree-top a[data-page="changes-to-read"]'),
        rows: rows.length,
        chips: rows.filter((r) => r.querySelector('.change-chip[aria-label]')).length,
        dates: rows.map((r) => r.cells[0].textContent.slice(0, 10)),
        links: rows.map((r) => r.cells[2].querySelector('a')?.getAttribute('href')),
        expectedLinks: d.changes.items.map((i) => '#' + i.page + (i.token ? '.' + i.token : '')),
      };
    });
    let ok = list.topEntry && list.rows === expected && list.chips === expected
      && list.title === 'Changes to read'
      && JSON.stringify(list.links) === JSON.stringify(list.expectedLinks)
      && list.dates.every((date, i, dates) => !i || dates[i - 1] >= date);
    const problems = [];
    const recentPage = ctx.data.pages.find((p) => p.recent);
    if (recentPage) {
      await gotoPage(page, recentPage.id);
      const chip = await page.locator('.page-head .change-chip').count();
      const treeChip = await page.locator(`#tree a[data-page="${recentPage.id}"] .change-chip`).count();
      if (chip !== 1 || treeChip !== 1) problems.push('recent page header/tree chip missing');
    }
    for (const [kind, source] of [['decisions', ctx.data.decisions], ['amendments', ctx.data.amendments]]) {
      const items = (source?.items || []).filter((i) => i.recent);
      if (!items.length) continue;
      await gotoPage(page, kind);
      const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id.toLowerCase())?.querySelector('.change-chip[aria-label]')), items.map((i) => i.id));
      if (missing.length) problems.push(`${kind} chips missing: ${missing.join(', ')}`);
      const first = items[0];
      const hits = await page.evaluate((q) => window.specReader.runSearch(q).hits.map((h) => ({ page: h.e.p.id, token: h.e.row?.token })), first.id);
      if (!hits.some((h) => h.page === kind && h.token === first.id.toLowerCase())) problems.push(`${kind} direct search hit missing`);
      await gotoPage(page, source.pageId || source.fcId);
      const sourceId = kind === 'decisions' ? first.id.toLowerCase() : first.rows[0]?.id.toLowerCase();
      if (sourceId && await page.locator(`#${sourceId} .change-chip`).count() !== 1) problems.push(`${kind} source row chip missing`);
    }
    const text = (changes.locale === 'vi' ? 'Mới' : 'New');
    const search = await page.evaluate((q) => window.specReader.runSearch(q).total, text);
    if (expected && !search) problems.push('chip text is not searchable');
    ok &&= !problems.length;
    return { name: 'recent-changes', ok, detail: { expected, ...list, links: list.links.slice(0, 5), expectedLinks: undefined, dates: list.dates.slice(0, 5), problems } };
  } finally {
    await context.close();
  }
}

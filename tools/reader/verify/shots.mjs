import path from 'node:path';
import { openPage, renderAll, probe } from './context.mjs';
import { VIEWPORTS } from './checks-ui.mjs';

/* Proof screenshots of every role view at 375, 768, 1440 and 874x827, light and dark. Only pages the spec really has; others are listed as skipped. */
export const SHOT_PAGES = ['start', 'po-view', 'dev-view', 'dev-us-01', 'qa-view', 'open-items', 'coverage', 'design-view', 'evidence-view', 'source-ledger'];

export function shotPlan(data) {
  const p = probe(data);
  const have = (id) => data.pages.some((x) => x.id === id);
  const firstPanel = (data.pages.find((x) => /^dev-/.test(x.id) && x.kind === 'view' && x.id !== 'dev-view') || {}).id;
  return SHOT_PAGES.map((id) => (id === 'dev-us-01' ? firstPanel : have(id) ? id : '')).concat(p.story ? [p.story] : []);
}

export async function takeShots(ctx, proofDir, full, pages) {
  const plan = pages ? pages.filter((id) => ctx.data.pages.some((p) => p.id === id)) : shotPlan(ctx.data);
  const sizes = full ? VIEWPORTS : [[1440, 900], [375, 812]];
  const schemes = full ? ['light', 'dark'] : ['light'];
  const files = []; const skipped = [];
  for (const [w, h] of sizes) {
    for (const scheme of schemes) {
      for (let i = 0; i < plan.length; i += 1) {
        const id = plan[i];
        if (!id) { if (w === 1440 && scheme === 'light') skipped.push(SHOT_PAGES[i] || `plan-${i}`); continue; }
        const { page, context } = await openPage(ctx, id, { width: w, height: h }, scheme);
        await page.waitForTimeout(500);
        await renderAll(page);
        await page.waitForTimeout(350);
        const file = `${id}-${w}x${h}-${scheme}.png`;
        await page.screenshot({ path: path.join(proofDir, file), fullPage: true });
        const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        files.push({ file, overflow: m.sw > m.iw + 1 });
        await context.close();
      }
    }
  }
  return { files, skipped };
}

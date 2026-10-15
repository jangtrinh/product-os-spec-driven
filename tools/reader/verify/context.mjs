import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* Everything a check needs: the rendered offline file, its content, and a page opener. No port is ever bound: pages open over file://. */
export function loadContext(outDir, browser, opts = {}) {
  const offlineDir = path.join(outDir, 'offline');
  const artifactDir = path.join(outDir, 'artifact');
  const file = path.join(offlineDir, 'index.html');
  const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const m = /window\.SPEC_DATA = (\{[\s\S]*?\});<\/script>/.exec(html);
  const data = m ? JSON.parse(m[1]) : fs.existsSync(path.join(artifactDir, 'content.json')) ? JSON.parse(fs.readFileSync(path.join(artifactDir, 'content.json'), 'utf8')) : null;
  return {
    browser, outDir, offlineDir, artifactDir, offlineFile: file, data, opts, hasOffline: !!html,
    url: (hash) => `${pathToFileURL(file).href}#${hash}`,
    report: fs.existsSync(path.join(outDir, 'render-report.json')) ? JSON.parse(fs.readFileSync(path.join(outDir, 'render-report.json'), 'utf8')) : {},
  };
}

/* Opens one page of the offline reader and waits until the router rendered it. */
export async function openPage(ctx, hash, viewport = { width: 1440, height: 900 }, scheme = 'light') {
  const context = await ctx.browser.newContext({ viewport, colorScheme: scheme });
  const page = await context.newPage();
  const errors = []; const external = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (/^https?:/.test(r.url())) external.push(r.url()); });
  await page.goto(ctx.url(hash));
  await page.waitForSelector('#prose, .dossier-progress, .not-found', { timeout: 20000 });
  return { page, context, errors, external };
}

export const renderAll = (page) => page.evaluate(() => window.specReader.renderAll());
export const gotoPage = async (page, id) => {
  await page.evaluate((x) => { location.hash = `#${x}`; }, id);
  await page.waitForFunction((x) => window.specReader.state.current === x, id);
  await renderAll(page);
};

/* Pages the checks and screenshots pick from, derived from the content only. */
export function probe(data) {
  const pages = data.pages;
  const real = pages.filter((p) => !p.generated);
  const story = data.chain && data.chain.stories[0];
  const withBoard = data.chain && data.chain.stories.find((s) => s.boards.length);
  const readable = data.orderReadable || [];
  const epic = readable.find((id) => pages.find((p) => p.id === id).kind === 'epic') || readable[1] || readable[0] || '';
  const imagePage = real.find((p) => /!\[[^\]]*\]\(images\//.test(p.md) && p.layer !== 'readable') || real.find((p) => /!\[[^\]]*\]\(images\//.test(p.md));
  const nonWireframe = real.find((p) => !p.wireframe && p.layer !== 'readable');
  const tablePage = real.find((p) => /^\|.*\|\s*$/m.test(p.md) && !p.generated);
  const heading = (p) => { const h = /^#{2,3} (.+)$/m.exec(p.md); return h ? h[1] : ''; };
  return {
    start: 'start', first: readable[0] || 'start', epic, story: story ? story.page : '', storyWithBoard: withBoard ? withBoard.page : '', imagePage: imagePage ? imagePage.id : '',
    nonWireframe: nonWireframe ? nonWireframe.id : '', tablePage: tablePage ? tablePage.id : '', anyPage: real[0] ? real[0].id : 'start', heading,
    hasChain: !!data.chain, hasAmendments: !!data.amendments, hasDecisions: !!data.decisions, firstReq: data.chain && data.chain.reqs[0] ? data.chain.reqs[0].id.toLowerCase() : '',
    firstDecision: data.decisions ? data.decisions.items[0].id.toLowerCase() : '',
  };
}

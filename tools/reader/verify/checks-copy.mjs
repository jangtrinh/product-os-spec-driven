/* "Copy cho AI": a selection in rendered spec text and an element picked in the prototype each put a located Markdown block on the clipboard.
   The check reads the real clipboard in Chromium, so a copy button that writes nothing, or a block that lost its source lines, turns it red. */
export async function copyForAiCheck(ctx) {
  const problems = [];
  const detail = {};
  const context = await ctx.browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const copy = async () => { await page.click('#copy-box-copy'); await page.waitForFunction(() => document.querySelector('#copy-box').dataset.copyState !== 'idle', null, { timeout: 5000 }); return clipboard(); };
  try {
    const source = ctx.data.pages.find((p) => !p.generated && p.src && /^\|.*\|\s*$/m.test(p.md) && p.layer !== 'readable');
    if (!source) problems.push('no source page with a table to select from');
    else {
      await page.goto(ctx.url(source.id));
      await page.waitForSelector('#prose tbody tr');
      await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#prose tbody tr')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.querySelector('#article').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
      await page.waitForSelector('#copy-box:not([hidden])', { timeout: 5000 });
      const text = await copy();
      detail.spec = text.split('\n').find((l) => l.startsWith('- File:')) || ''; detail.quote = text.split('\n')[2];
      if (!/^Sửa đoạn spec này:\n\n> .+/.test(text)) problems.push('spec text does not start with the quoted selection');
      if (!new RegExp(`\\n- File: .*${source.src.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\d+-\\d+\\n`).test(text)) problems.push(`spec text has no real file:lines for ${source.src.file}`);
      const at = /\n- File: .*:(\d+)-(\d+)\n/.exec(text);
      const first = (text.split('\n')[2] || '').replace(/^>\s?/, '').split(' | ')[0].trim();
      if (at && first) {
        const mdLine = source.src.map ? source.src.map.indexOf(Number(at[1])) : Number(at[1]) - source.src.first;
        const held = source.md.split('\n')[mdLine] || '';
        if (!held.includes(first)) problems.push(`line ${at[1]} of ${source.src.file} does not hold the quoted text "${first}"`);
      }
      if (!/\n- Mục: .+\n- Trang reader: #\S+\n- Project: .+ \(spec @ \S+\)\n\nYêu cầu của tôi: /.test(text)) problems.push('spec text lost its Mục / Trang reader / Project / request lines');
    }
    if (ctx.data.prototype) {
      await page.goto(ctx.url('prototype'));
      const frame = page.frameLocator('#proto-frame');
      await frame.locator('[data-src-line]').first().waitFor({ timeout: 10000 });
      await page.click('#proto-annotate');
      await frame.locator('a, p').first().click();
      await page.waitForSelector('#copy-box:not([hidden])', { timeout: 5000 });
      const text = await copy();
      detail.prototype = text.split('\n').find((l) => l.startsWith('- File:')) || '';
      if (!/^Sửa phần tử prototype này:\n\n- Màn: .+\n- Phần tử: \S+/.test(text)) problems.push('prototype text does not start with the screen and element');
      if (!/\n- File: .*prototype\/index\.html:[1-9]\d*\n- Liên quan: .+\n- Project: .+\n\nYêu cầu của tôi: /.test(text)) problems.push('prototype text has no real source line');
    }
    if (errors.length) problems.push(`page errors: ${errors.slice(0, 2).join('; ')}`);
  } catch (e) {
    problems.push(String(e.message).split('\n')[0]);
  }
  await context.close();
  return { name: 'copy-for-ai', ok: problems.length === 0, detail: { ...detail, problems } };
}

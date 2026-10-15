import { canonical } from '../../lib/config/strict-json.mjs';
import { sha256 } from '../../lib/config/path-selection.mjs';
import { viewCore } from '../packet/source-binding.mjs';
import { assemblePacketHtml } from '../packet/packet-html.mjs';

/* Checks that what a packet file SHOWS is what its embedded data and pinned sources SAY. The verifier rebuilds the whole view with the
   repository's own renderer, never the renderer inside the file, and compares it with the file's static markup. Any difference is RED. */
const script = (html, id) => { const m = new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`).exec(html); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } };

export function readParts(html) {
  return { data: script(html, 'packet-data'), sources: script(html, 'packet-sources'), hints: script(html, 'packet-view-hints'), assets: script(html, 'packet-assets'), packetId: /data-packet-id="([^"]*)"/.exec(html)?.[1], dataSha: /data-data-sha="([^"]*)"/.exec(html)?.[1] };
}

/* Pins: every embedded source hashes to what each member that names it pins; every preview image hashes to the data's asset hash;
   the structure the view relies on (stories, rulings, screens, ui-contract routes) re-derives from those bytes. */
export function sourceBindingProblems({ data, sources, hints, assets }) {
  if (!data || !sources || !hints || !assets) return ['packet-data, packet-sources, packet-view-hints or packet-assets is missing or unreadable'];
  const problems = [], texts = {};
  for (const [key, b64] of Object.entries(sources)) {
    const buf = Buffer.from(b64, 'base64'); texts[key] = buf.toString('utf8');
    const members = data.membership.members.filter((m) => key in m.artifacts);
    if (!members.length || members.some((m) => m.artifacts[key] !== sha256(buf))) problems.push(`${key} is not the pinned bytes`);
  }
  for (const [key, a] of Object.entries(assets)) if (data.assets[key] !== sha256(Buffer.from(a.b64, 'base64'))) problems.push(`preview ${key} is not the pinned asset bytes`);
  try { problems.push(...viewCore.viewProblems(data, texts)); } catch (e) { problems.push(`the view cannot be derived: ${e.message}`); }
  return problems;
}

/* The shipped markup, parsed by the browser with scripts OFF, against the repository renderer's output parsed the same way. */
export async function viewBindingCheck(browser, { file, html, parts }) {
  const { data, sources, hints } = parts;
  if (!data || !sources || !hints) return [{ name: 'packet-view-binding', ok: false, detail: { problem: 'embedded parts unreadable' } }];
  const texts = Object.fromEntries(Object.entries(sources).map(([k, b]) => [k, Buffer.from(b, 'base64').toString('utf8')]));
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage(); await page.goto(`file://${file}`);
  const shipped = await page.$eval('#app', (el) => el.innerHTML).catch(() => null);
  await ctx.close();
  const live = await browser.newContext(); const blank = await live.newPage();
  await blank.addScriptTag({ content: viewCore.source }).catch(() => {});
  const result = await blank.evaluate(({ data, texts, hints, shipped }) => {
    const rebuilt = document.createElement('template'); rebuilt.innerHTML = renderView(data, texts, hints);
    const old = document.createElement('template'); old.innerHTML = shipped || '';
    if (rebuilt.innerHTML === shipped) return [];
    const ids = [...rebuilt.content.querySelectorAll('section[id]')].filter((s) => { const o = old.content.querySelector('#' + s.id); return !o || o.outerHTML !== s.outerHTML; }).map((s) => s.id);
    return ids.length ? ids : ['page frame'];
  }, { data, texts, hints, shipped }).catch((e) => [`rebuild failed: ${String(e.message).split('\n')[0]}`]);
  await live.close();
  const whole = assemblePacketHtml({ json: canonical(data), dataSha: parts.dataSha, packetId: parts.packetId, changeId: data.change.id, sources, hints, assets: parts.assets });
  return [
    { name: 'packet-view-binding', ok: shipped !== null && result.length === 0, detail: { sectionsDifferingFromTheRebuildOfTheEmbeddedData: result } },
    { name: 'packet-file-regenerates', ok: whole === html, detail: { regeneratedBytes: whole.length, fileBytes: html.length, sha: sha256(whole).slice(0, 12), fileSha: sha256(html).slice(0, 12) } },
  ];
}

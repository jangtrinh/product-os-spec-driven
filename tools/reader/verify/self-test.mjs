import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadContext } from './context.mjs';
import { runChecks } from './run.mjs';
import { packetChecks } from './packet-checks.mjs';
import { generate } from '../packet.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE = path.resolve(here, '../../../fixtures/reader/design-stages');
const RENDER = path.resolve(here, '../render.mjs');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const n of fs.readdirSync(from)) {
    const a = path.join(from, n); const b = path.join(to, n);
    if (fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

/* Edits the content inlined in the offline index.html (SPEC_DATA) or the html around it. */
const patchData = (file, fn) => {
  const html = fs.readFileSync(file, 'utf8');
  const m = /window\.SPEC_DATA = (\{[\s\S]*?\});<\/script>/.exec(html);
  const data = JSON.parse(m[1]);
  fn(data);
  fs.writeFileSync(file, html.replace(m[0], () => `window.SPEC_DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>`));
};
const addMd = (id, extra) => (dir) => patchData(path.join(dir, 'index.html'), (d) => { d.pages.find((p) => p.id === id).md += `\n\n${extra}\n`; });
/* Replaces the LAST occurrence: the inlined libraries contain these tags as text, the real one is at the end. */
const patchHtml = (from, to) => (dir) => {
  const f = path.join(dir, 'index.html'); const s = fs.readFileSync(f, 'utf8');
  const i = s.lastIndexOf(from);
  if (i < 0) throw new Error(`self-test patch target missing: ${from}`);
  fs.writeFileSync(f, s.slice(0, i) + to + s.slice(i + from.length));
};

/* [name, checks to run, check that must go red, mutation of a copy of the rendered offline folder] */
export const CASES = [
  ['dead link (hash that no heading carries)', ['crawl'], 'links', addMd('us-01', '[dead link](#us-01.no-such-heading)')],
  ['link to a requirement the chain does not have', ['crawl'], 'links', addMd('us-01', '[ghost](#reference-chain.req-999)')],
  ['link to a story the chain does not have', ['crawl'], 'links', addMd('us-01', '[ghost](#reference-chain.us-99)')],
  ['link to a non-functional id the chain does not have', ['crawl'], 'links', addMd('us-01', '[ghost](#reference-chain.nf-01)')],
  ['broken Mermaid diagram', ['crawl'], 'diagrams', addMd('us-02', '```mermaid\nflowchart LR\n  A[ --> \n```')],
  ['image that does not exist', ['crawl'], 'images', addMd('us-02', '![gone](images/nope.png)')],
  ['network call from an offline page', ['crawl'], 'console-and-network', patchHtml('</body>', "<script>fetch('https://example.invalid/ping').catch(() => {});</script></body>")],
  ['console error', ['crawl'], 'console-and-network', patchHtml('</body>', "<script>setTimeout(() => { throw new Error('planted'); }, 50);</script></body>")],
  ['wireframe image in a non-wireframe section', ['image-rule'], 'image-rule', addMd('us-03', '![board](images/ux/wireframes/png/W-01-saved-filters-list.png)')],
  ['denied shot on a page', ['image-rule'], 'image-rule', (dir) => {
    fs.mkdirSync(path.join(dir, 'images/assets/shots'), { recursive: true });
    fs.copyFileSync(path.join(dir, 'images/assets/shots/saved-filters-1440.png'), path.join(dir, 'images/assets/shots/old-search.png'));
    addMd('us-03', '![old](images/assets/shots/old-search.png)')(dir);
  }],
  ['two page toggles', ['page-toggles'], 'page-toggles', patchHtml('<div class="topbar-actions">', '<div class="topbar-actions"><button type="button" class="btn">Show pages</button>')],
  ['horizontal overflow', ['overflow'], 'overflow', patchHtml('</style>', '#prose h2 { width: 3000px; }\n</style>')],
  ['link to a data file that was not copied', ['crawl'], 'local-files', addMd('us-01', '[data](files/assets/nope.json)')],
  ['hidden not-created disclosure', ['disclosures'], 'disclosures', (dir) => patchData(path.join(dir, 'index.html'), (d) => { const p = d.pages.find((x) => x.id === 'design-view'); p.md = p.md.replace(/not-created/g, 'ready'); })],
  ['required view missing', ['views'], 'views', (dir) => patchData(path.join(dir, 'index.html'), (d) => { d.pages = d.pages.filter((x) => x.id !== 'open-items'); d.orderArtifact = d.orderArtifact.filter((x) => x !== 'open-items'); d.orderAudience = d.orderAudience.filter((x) => x !== 'open-items'); })],
  ['QA view drops an AC row', ['views'], 'views', (dir) => patchData(path.join(dir, 'index.html'), (d) => { const p = d.pages.find((x) => x.id === 'qa-view'); p.md = p.md.replace(/<tr id="us-01-ac-01">.*?<\/tr>/s, ''); })],
  ['unlabeled control', ['a11y-basics'], 'a11y-basics', (dir) => patchData(path.join(dir, 'index.html'), (d) => { d.pages.find((x) => x.id === 'po-view').md += '\n\n<button type="button"></button>\n'; })],
  ['content changed after render', ['skin-contract'], 'skin-contract', (dir) => patchData(path.join(dir, 'index.html'), (d) => { d.title += ' (edited)'; })],
  ['drawer no longer inerts the background', ['controls'], 'controls', patchHtml('sibling.inert = true;', '/* planted: no inert */')],
  ['change list omits a recent item', ['recent-changes'], 'recent-changes', (dir) => patchData(path.join(dir, 'index.html'), (d) => { d.changes.items.pop(); })],
  ['recent chips missing', ['recent-changes'], 'recent-changes', patchHtml("if (!recent || !date) return '';", "return ''; // planted missing chips\nif (!recent || !date) return '';")],
  ['rendered blocks lose their source lines', ['copy-for-ai'], 'copy-for-ai', (dir) => { patchHtml("'<$1 data-src-start=\"'", "'<$1 data-x-start=\"'")(dir); patchHtml("'<tr data-src-start=\"'", "'<tr data-x-start=\"'")(dir); }],
  ['source line numbers shifted by one', ['copy-for-ai'], 'copy-for-ai', patchHtml('return src.first + i;', 'return src.first + i + 1;')],
  ['copy button writes nothing to the clipboard', ['copy-for-ai'], 'copy-for-ai', patchHtml('await navigator.clipboard.writeText(text);', '/* planted: nothing written */')],
  ['prototype frame never reports the picked element', ['copy-for-ai'], 'copy-for-ai', patchHtml("send({ type: 'pick',", "void ({ type: 'pick',")],
  ['change list missing from tree top', ['recent-changes'], 'recent-changes', patchHtml("if (state.pages['changes-to-read']) {", "if (false) {")],
];


const inSection = (f, id, edit) => { const h = fs.readFileSync(f, 'utf8'); const a = h.indexOf(`<section id="${id}"`), b = h.indexOf('</section>', a); fs.writeFileSync(f, h.slice(0, a) + edit(h.slice(a, b)) + h.slice(b)); };
/* Edits the embedded data only (the digest is NOT recomputed here; the digest check is its own red). */
const inData = (f, edit) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace(/(<script id="packet-data"[^>]*>)([\s\S]*?)(<\/script>)/, (m, a, j, c) => { const d = JSON.parse(j); edit(d); return a + JSON.stringify(d) + c; })); };

const PACKET_CASES = [
  ['digest metadata mismatch', 'packet-digest-ui', f => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace(/data-data-sha="[a-f0-9]+"/, `data-data-sha="${'0'.repeat(64)}"`)); }],
  ['digest verification replaced with a successful result', 'packet-digest-ui', f => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace('async function verifyDigest() {', 'async function verifyDigest() { return true;')); }],
  ['changed packet data', 'packet-digest', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace(/(<script id="packet-data"[^>]*>[\s\S]*?"reason":")/, '$1X')); }],
  ['unlabeled packet input (the page renderer drops the label)', 'packet-a11y', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replaceAll('<label for="by">Your email as PO</label>', '')); }],
  ['label removed from the shipped markup only', 'packet-view-binding', (f) => { const h = fs.readFileSync(f, 'utf8'); const a = h.indexOf('<div id="app">'), b = h.indexOf('</div><script id="packet-data"'); fs.writeFileSync(f, h.slice(0, a) + h.slice(a, b).replace('<label for="by">Your email as PO</label>', '') + h.slice(b)); }],
  ['packet overflow', 'packet-overflow', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace('</style>', 'section { width: 3000px; }\n</style>')); }],
  ['export no longer requires a reason', 'packet-export', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace("if (!reason) errors.push(", "if (false) errors.push(")); }],
  ['visible acceptance wording swapped after generation', 'packet-view-binding', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace('Bộ lọc xuất hiện trong danh sách đã lưu.', 'Alternative saved-filter outcome.')); }],
  ['embedded source bytes replaced', 'packet-source-binding', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace(/(<script id="packet-sources" type="application\/json">\{"[^"]+":")[A-Za-z0-9+\/]/, (m, a) => `${a}${m.endsWith('A') ? 'B' : 'A'}`)); }],
  ['visible decision ruling swapped after generation', 'packet-view-binding', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace('>Filters can be saved with a name<', '>Alternative filter ruling for the control<')); }],
  ['visible screen route swapped, embedded data unchanged', 'packet-view-binding', (f) => inSection(f, 'screens', (t) => t.replace('<code>/filters/s01</code>', '<code>/filters/confirm-before-save</code>'))],
  ['visible receipt domain swapped, embedded data unchanged', 'packet-view-binding', (f) => inSection(f, 'evidence', (t) => t.replace('data-label="Domain">spec<', 'data-label="Domain">visual<'))],
  ['visible exception reason swapped, embedded data unchanged', 'packet-view-binding', (f) => inSection(f, 'records', (t) => t.replace('Only the original fixture scope is applicable', 'Alternative applicability wording for this batch'))],
  ['hand-edited note in the page chrome', 'packet-view-binding', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace('This page is not an approval.', 'This page is an approval.')); }],
  ['shown screen row no longer in the pinned inventory', 'packet-source-binding', (f) => inData(f, (d) => { d.screens[0].route = '/filters/confirm-before-save'; })],
  ['page renderer replaced by a lenient copy', 'packet-file-regenerates', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace('function viewProblems(p, texts) {', 'function viewProblems(p, texts) { return [];')); }],
  ['page stops re-checking the wording before export', 'packet-source-binding-ui', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace("const bound = verifySources();", "const bound = Promise.resolve(true);")); }],
  ['packet calls the network', 'packet-overflow', (f) => { const h = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, h.replace('</body>', "<script>fetch('https://example.invalid/x').catch(() => {});</script></body>")); }, 'console-network'],
];

async function packetSelfTest(browser, tmp) {
  let ok = true;
  const { packetProject } = await import('../../../fixtures/reader/packet-project.mjs');   // kit-only: a project has no fixtures/
  const project = packetProject(undefined, { exception: true });
  try {
    const base = path.join(tmp, 'packet-base');
    generate({ spec: project.spec, project: project.root, config: 'config/pipeline.yaml', changeSet: 'CS-filter', out: base });
    const green = await packetChecks(browser, base, { proofDir: path.join(tmp, 'packet-proof') });
    const baseOk = green.every((r) => r.ok);
    console.log(`${baseOk ? 'GREEN as expected' : 'NOT GREEN'} — the unmodified packet: ${green.length} checks${baseOk ? '' : `, failing: ${green.filter((r) => !r.ok).map((r) => r.name).join(', ')}`}`);
    ok &&= baseOk;
    for (const [name, expect, mutate, prefix] of PACKET_CASES) {
      const dir = path.join(tmp, 'packet-case');
      fs.rmSync(dir, { recursive: true, force: true }); copyDir(base, dir);
      mutate(path.join(dir, 'index.html'));
      const res = await packetChecks(browser, dir, { proofDir: path.join(tmp, 'packet-proof') });
      const hit = res.find((r) => (prefix ? r.name.startsWith(prefix) : r.name === expect) && !r.ok);
      console.log(`${hit ? 'RED as expected' : 'NOT CAUGHT'} — ${name} [${prefix || expect}]${hit ? ` ${JSON.stringify(hit.detail).slice(0, 100)}` : ''}`);
      ok &&= !!hit;
    }
  } finally { fs.rmSync(project.root, { recursive: true, force: true }); }
  return ok;
}

export async function selfTest(browser) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-verify-'));
  let ok = true;
  try {
    execFileSync(process.execPath, [RENDER, EXAMPLE, '--out', path.join(tmp, 'base')], { stdio: 'ignore' });
    const base = loadContext(path.join(tmp, 'base'), browser, { artifact: true });
    const green = await runChecks(base);
    const baseOk = green.length > 0 && green.every((r) => r.ok);
    console.log(`${baseOk ? 'GREEN as expected' : 'NOT GREEN'} — the unmodified example reader: ${green.length} checks${baseOk ? '' : `, failing: ${green.filter((r) => !r.ok).map((r) => `${r.name} ${JSON.stringify(r.detail).slice(0, 200)}`).join('; ')}`}`);
    ok &&= baseOk;
    const forcedDir = path.join(tmp, 'forced');
    copyDir(path.join(tmp, 'base', 'offline'), path.join(forcedDir, 'offline'));
    patchData(path.join(forcedDir, 'offline/index.html'), (d) => {
      d.lint = { errors: 31, problems: Array.from({ length: 31 }, (_, i) => `Missing evidence image ${i + 1}: ${'long-source-path/'.repeat(8)}capture.png`) };
    });
    const forced = await runChecks(loadContext(forcedDir, browser, {}), ['page-toggles']);
    const forcedOk = forced.length > 0 && forced.every((r) => r.ok);
    console.log(`${forcedOk ? 'GREEN as expected' : 'NOT GREEN'} — forced lint warning preserves page toggles at every width`);
    ok &&= forcedOk;
    for (const [name, only, expect, mutate] of CASES) {
      const dir = path.join(tmp, 'case');
      fs.rmSync(dir, { recursive: true, force: true });
      copyDir(path.join(tmp, 'base', 'offline'), path.join(dir, 'offline'));
      mutate(path.join(dir, 'offline'));
      const ctx = loadContext(dir, browser, {});
      const res = await runChecks(ctx, only);
      const hit = res.find((r) => r.name === expect && !r.ok);
      console.log(`${hit ? 'RED as expected' : 'NOT CAUGHT'} — ${name} [${expect}]${hit ? ` ${JSON.stringify(hit.detail).slice(0, 110)}` : ` (checks that ran: ${res.map((r) => `${r.name}=${r.ok}`).join(', ')})`}`);
      ok &&= !!hit;
    }
    ok = (await packetSelfTest(browser, tmp)) && ok;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(ok ? `verify self-test OK: green baselines, ${CASES.length} reader and ${PACKET_CASES.length} packet defects all red` : 'verify self-test FAILED');
  return ok;
}

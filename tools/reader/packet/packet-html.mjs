import fs from 'node:fs';
import path from 'node:path';
import { SHELL_DIR, READER_DIR } from '../lib/paths.mjs';
import { sha256 } from '../../lib/config/path-selection.mjs';
import { viewCore } from './source-binding.mjs';

/* Single self-contained review packet (D8). Deterministic: no clock, no randomness, no network. Every reviewer-visible line is built by
   renderView() from the canonical data plus the pinned source bytes; the static markup is that same output, so the page, the generator
   and the verifier can each rebuild it and compare. Nothing is typed into the markup by hand. */
const mime = (p) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' })[path.extname(p).toLowerCase()] || 'application/octet-stream';
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonIn = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

function fontCss() {
  const manifest = JSON.parse(fs.readFileSync(path.join(READER_DIR, 'shell-src/fonts-manifest.json'), 'utf8'));
  return manifest.filter((f) => [400, 600].includes(Number(f.weight))).map((f) => `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(SHELL_DIR, 'fonts', f.file)).toString('base64')}) format('woff2');unicode-range:${f.range}}`).join('\n');
}
const rendererJs = () => fs.readFileSync(path.join(READER_DIR, 'packet/packet-client.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const rendererCss = () => fs.readFileSync(path.join(READER_DIR, 'packet/packet.css'), 'utf8');

/* The page from its parts. Used to write the packet and, with the parts read back out of a packet file, to rebuild it for comparison. */
export function assemblePacketHtml({ json, dataSha, packetId, changeId, sources, hints, assets }) {
  const data = JSON.parse(json);
  const texts = Object.fromEntries(Object.entries(sources).map(([k, b64]) => [k, Buffer.from(b64, 'base64').toString('utf8')]));
  const view = viewCore.renderView(data, texts, hints);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Batch review packet ${escHtml(changeId)} · PRODUCT:OS Spec Driven</title>
<style>
${fontCss()}
${rendererCss()}
</style>
</head>
<body>
<div id="app">${view}</div>
<script id="packet-data" type="application/json" data-packet-id="${escHtml(packetId)}" data-data-sha="${escHtml(dataSha)}">${json.replace(/</g, '\\u003c')}</script>
<script id="packet-sources" type="application/json">${jsonIn(sources)}</script>
<script id="packet-view-hints" type="application/json">${jsonIn(hints)}</script>
<script id="packet-assets" type="application/json">${jsonIn(assets)}</script>
<script>
${viewCore.source.replace(/<\/script/gi, '<\\/script')}
${rendererJs()}
</script>
</body>
</html>
`;
}

/* Preview images are orientation only: which image belongs to which screen is not pinned, so it lives in the hints, labelled "not verified". */
export function renderPacketHtml({ built, spec, root, bound }) {
  const { data: d, json, dataSha, packetId, changeState } = built;
  const previews = {}, assets = {};
  for (const r of d.screens) {
    const coded = (spec.codedByScreen[r.screen] || [])[0];
    const rel = coded || (r.boards || []).map((b) => spec.boardPng[b]).find(Boolean);
    const key = rel && Object.keys(d.assets).find((k) => k.endsWith(`/${rel}`) || k === rel);
    if (!key) continue;
    const bytes = fs.readFileSync(path.join(root, key));
    if (sha256(bytes) !== d.assets[key]) throw new Error(`asset ${key} changed while the packet was rendered`);
    previews[`${r.screen}/${r.state}`] = { asset: key, built: !!coded };
    assets[key] = { mime: mime(key), b64: bytes.toString('base64') };
  }
  return assemblePacketHtml({ json, dataSha, packetId, changeId: d.change.id, sources: bound.sources, hints: { changeState, dataSha, previews }, assets });
}

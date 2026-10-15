#!/usr/bin/env node
/* render: spec folder (Spec Format v2) -> reader files. Lints first and refuses to render when the lint fails.
   usage: node tools/reader/render.mjs <spec-folder> --out <dir> [--offline] [--artifact] [--force]
     --artifact   <dir>/artifact/  index.html (fragment) + shell.js + shell.css + tokens.css + fonts.css + libs/ + fonts/ + content.json + images/ + wireframes/html/ + files/
     --offline    <dir>/offline/   one index.html with shell, marked, mermaid and content inlined, plus images/, wireframes/html/ and files/
     (neither flag renders both)
     --force      render even when lint fails; the reader then shows a red banner listing the problems (never a checkpoint, never an approvable packet)
   Needs no network. A re-render never touches the shell: it only reruns the indexer on the spec. */
import fs from 'node:fs';
import path from 'node:path';
import { lintSpec } from '../lint/index.mjs';
import { indexSpec } from './indexer/index-spec.mjs';
import { readShell } from './lib/shell-files.mjs';
import { expandTheme } from '../lib/theme.mjs';
import { SHELL_DIR } from './lib/paths.mjs';
import { localPath } from '../lib/local-path.mjs';
import { contentDigest } from './lib/content-digest.mjs';

const USAGE = 'usage: node tools/reader/render.mjs <spec-folder> --out <dir> [--offline] [--artifact] [--force]';
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const specDir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const outDir = opt('out');
if (!specDir || !outDir) { console.error(USAGE); process.exit(2); }
const wantOffline = args.includes('--offline') || !args.includes('--artifact');
const wantArtifact = args.includes('--artifact') || !args.includes('--offline');
const force = args.includes('--force');

const lint = lintSpec(specDir);
const problems = lint.problems.list;
const errors = problems.filter((p) => p.severity !== 'warning');
const indexed = indexSpec(specDir, {});
if (!indexed.spec.docs.length) { console.error(`render refused: no documents found in ${specDir}. Is this the spec folder?`); process.exit(2); }
if (errors.length) {
  for (const p of errors) console.error(lint.problems.format(p));
  if (!force) { console.error(`render refused: ${errors.length} lint error(s). Fix them, or use --force to render an invalid preview with a red banner (never a checkpoint).`); process.exit(1); }
  console.error(`--force: rendering an invalid preview with ${errors.length} lint error(s)`);
}
const lintInfo = errors.length ? { errors: errors.length, problems: errors.map((p) => `${p.file}:${p.line} [${p.code}] ${p.message}`) } : null;
const warnings = problems.filter((p) => p.severity === 'warning').map((p) => `${p.file}:${p.line} [${p.code}] ${p.message}`);
const { data, images, htmlBoards, spec, report, dataFiles } = lintInfo ? indexSpec(specDir, { lint: lintInfo }) : indexed;
data.warnings = warnings;

const shell = readShell();
const themeFile = spec.manifest && spec.manifest.theme && spec.manifest.theme.tokens;
const tokensCss = themeFile ? expandTheme(fs.readFileSync(localPath(spec.root, themeFile), 'utf8')) : shell['tokens.css'];
const reset = (dir) => { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); };
const put = (dir, rel, content) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
const copy = (from, dir, rel) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.copyFileSync(from, p); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const safeScript = (s) => s.replace(/<\/script/gi, '<\\/script');
const bodyInner = (/<body>\n([\s\S]*?)<script src="libs\/marked/.exec(shell['index.html']) || [])[1];
if (!bodyInner) throw new Error('shell/index.html has an unexpected shape; run: node tools/reader/make-shell.mjs');

function copySpecAssets(dir) {
  for (const rel of images) copy(path.join(spec.root, rel), dir, `images/${rel}`);
  for (const rel of htmlBoards) copy(path.join(spec.root, rel), dir, `wireframes/html/${path.posix.basename(rel)}`);
  for (const rel of dataFiles) copy(path.join(spec.root, rel), dir, `files/${rel}`);
  if (data.prototype) copy(path.join(spec.root, data.prototype.file), dir, data.prototype.file);
}

const digest = contentDigest(data);
const out = { shell: shell.SHELL_VERSION.trim(), product: data.product, spec: spec.root, contentDigest: digest, lint: { errors: errors.length, warnings: warnings.length, forced: !!errors.length && force }, ...report };
if (wantArtifact) {
  const dir = path.join(outDir, 'artifact');
  reset(dir);
  put(dir, 'index.html', `<title>product:os / ${esc(data.title)}</title>\n<link rel="stylesheet" href="fonts.css">\n<link rel="stylesheet" href="tokens.css">\n<link rel="stylesheet" href="shell.css">\n${bodyInner}<script src="libs/marked.umd.min.js"></script>\n<script src="libs/mermaid.min.js"></script>\n<script src="shell.js"></script>\n`);
  for (const f of ['shell.js', 'shell.css', 'fonts.css']) put(dir, f, shell[f]);
  put(dir, 'tokens.css', tokensCss);
  for (const f of fs.readdirSync(path.join(SHELL_DIR, 'fonts'))) copy(path.join(SHELL_DIR, 'fonts', f), dir, `fonts/${f}`);
  for (const f of fs.readdirSync(path.join(SHELL_DIR, 'libs'))) copy(path.join(SHELL_DIR, 'libs', f), dir, `libs/${f}`);
  copy(path.join(SHELL_DIR, 'LICENSE-lucide.txt'), dir, 'LICENSE-lucide.txt');
  put(dir, 'content.json', JSON.stringify(data));
  copySpecAssets(dir);
  out.artifact = { dir, indexBytes: fs.statSync(path.join(dir, 'index.html')).size, contentBytes: fs.statSync(path.join(dir, 'content.json')).size, images: images.length, htmlBoards: htmlBoards.length };
}
if (wantOffline) {
  const dir = path.join(outDir, 'offline');
  reset(dir);
  const fontsCss = shell['fonts.css'].replace(/url\(fonts\/([^)]+)\)/g, (_, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(SHELL_DIR, 'fonts', f)).toString('base64')})`);
  const lib = (f) => safeScript(fs.readFileSync(path.join(SHELL_DIR, 'libs', f), 'utf8'));
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  put(dir, 'index.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>product:os / ${esc(data.title)}</title>\n<style>\n${fontsCss}\n${tokensCss}\n${shell['shell.css']}\n</style>\n</head>\n<body>\n${bodyInner}<script>${lib('marked.umd.min.js')}</script>\n<script>${lib('mermaid.min.js')}</script>\n<script>window.SPEC_DATA = ${json};</script>\n<script>\n${safeScript(shell['shell.js'])}\n</script>\n</body>\n</html>\n`);
  copySpecAssets(dir);
  copy(path.join(SHELL_DIR, 'LICENSE-lucide.txt'), dir, 'LICENSE-lucide.txt');
  out.offline = { dir, bytes: fs.statSync(path.join(dir, 'index.html')).size };
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'render-report.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, (k, v) => (k === 'brokenList' ? `${v.length} unresolved` : k === 'notBuilt' ? `${v.length} not-built wireframes` : k === 'problems' && Array.isArray(v) ? v.length : v), 1));

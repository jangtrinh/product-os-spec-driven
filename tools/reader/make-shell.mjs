#!/usr/bin/env node
/* Assembles the committed shell/ folder from shell-src/ (modules, css, tokens, fonts manifest). The shell is project-neutral:
   index.html + shell.js + shell.css + tokens.css + fonts.css + libs/ (marked, mermaid) + fonts/.
   usage: node make-shell.mjs            rewrite shell/
          node make-shell.mjs --check    exit 1 when shell/ is older than shell-src/ (run it in CI and before every commit) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandTheme } from '../lib/theme.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, 'shell-src');
const OUT = path.join(here, 'shell');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const list = (dir, ext) => fs.readdirSync(path.join(SRC, dir)).filter((f) => f.endsWith(ext)).sort();
const version = read('SHELL_VERSION').trim();

export function shellFiles() {
  const fonts = JSON.parse(read('fonts-manifest.json'));
  const fontsCss = fonts.map((f) => `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url(fonts/${f.file}) format('woff2');unicode-range:${f.range}}`).join('\n');
  const js = `/* PRODUCT:OS Spec Driven reader shell ${version}. Project-neutral: all content comes from content.json (Spec Format v2). */\n(function () {\n'use strict';\nconst SHELL_VERSION = '${version}';\nconst SHELL_MAJOR = parseInt(SHELL_VERSION, 10);\nconst MODE = window.SPEC_DATA ? 'offline' : 'folder';\n${list('js', '.js').map((f) => read(`js/${f}`)).join('\n')}\n})();\n`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>product:os</title>
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="shell.css">
</head>
<body>
${read('shell.html').trimEnd()}
<script src="libs/marked.umd.min.js"></script>
<script src="shell.js"></script>
</body>
</html>
`;
  return {
    'index.html': html, 'shell.js': js, 'shell.css': list('css', '.css').map((f) => read(`css/${f}`)).join('\n'),
    'tokens.css': expandTheme(read('tokens.css')), 'theme.default.css': read('tokens.css'), 'fonts.css': `${fontsCss}\n`, SHELL_VERSION: `${version}\n`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = shellFiles();
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([n, c]) => !fs.existsSync(path.join(OUT, n)) || fs.readFileSync(path.join(OUT, n), 'utf8') !== c).map(([n]) => n);
    if (stale.length) { console.error(`shell/ is stale: ${stale.join(', ')}. Run: node tools/reader/make-shell.mjs`); process.exit(1); }
    console.log(`shell/ is current (${version}, ${Object.keys(files).length} generated files)`);
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(OUT, n), c);
    console.log(`shell ${version}: wrote ${Object.keys(files).join(', ')}`);
  }
}

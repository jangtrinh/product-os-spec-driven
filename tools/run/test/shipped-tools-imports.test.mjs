import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {kitContentPaths} from '../../lib/kit-content-paths.mjs';

// init copies kitContentPaths into every project and nothing else (fixtures/ and plans/ stay in the kit). A shipped tool
// that loads such a path at module load crashes with ERR_MODULE_NOT_FOUND inside a project. Kit-only developer
// features reach their fixtures through a dynamic import() that runs only when the feature is asked for.
const kit = fileURLToPath(new URL('../../../', import.meta.url));
const ignored = new Set(['node' + '_modules', '.' + 'git']);
const shippedIn = relative => kitContentPaths.some(owned => owned.endsWith('/') ? relative.startsWith(owned) : relative === owned);
function* sources(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'test') yield* sources(file); }   // tests are kit-developer checks, not tools a project runs
    else if (/\.(mjs|js|cjs)$/.test(entry.name)) yield file;
  }
}
// Imports a module performs while loading: static import/export-from, and a column-0 `await import()` (top-level await).
// An `await import()` inside a function or an `if` is indented and runs only when that code path does.
const STATIC = /(?:^|[;{}\n])\s*(?:import|export)\b[^'"`;()]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|[;{}\n])\s*import\s*['"]([^'"]+)['"]/g;
const TOP_LEVEL_AWAIT = /^[^\s/][^\n]*\bawait\s+import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
const staticImports = text => [...text.matchAll(STATIC)].map(match => match[1] ?? match[2]).filter(specifier => specifier.startsWith('.'));
const loadTimeImports = text => staticImports(text).concat([...text.matchAll(TOP_LEVEL_AWAIT)].map(match => match[1]).filter(specifier => specifier.startsWith('.')));
const isEntryPoint = text => text.startsWith('#!') || text.includes('process.argv');

// Every load-time import reachable from a shipped entry point that leaves the inventory.
function escapes(root) {
  const found = new Set();
  const visit = (file, via, seen) => {
    if (seen.has(file)) return; seen.add(file);
    for (const specifier of loadTimeImports(fs.readFileSync(file, 'utf8'))) {
      const target = path.resolve(path.dirname(file), specifier);
      const relative = path.relative(root, target).split(path.sep).join('/');
      if (!shippedIn(relative)) found.add(`${via} -> ${specifier} (${relative})`);
      else if (fs.existsSync(target) && fs.statSync(target).isFile()) visit(target, `${via} > ${relative}`, seen);
    }
  };
  for (const file of sources(path.join(root, 'tools'))) {
    if (isEntryPoint(fs.readFileSync(file, 'utf8'))) visit(file, path.relative(root, file), new Set());
  }
  return [...found].sort();
}

test('no shipped tools file statically imports a path outside the shipped inventory', () => {
  const offenders = [];
  for (const file of sources(path.join(kit, 'tools'))) {
    for (const specifier of staticImports(fs.readFileSync(file, 'utf8'))) {
      const target = path.relative(kit, path.resolve(path.dirname(file), specifier)).split(path.sep).join('/');
      if (!shippedIn(target)) offenders.push(`${path.relative(kit, file)} imports ${specifier} (${target})`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('no shipped entry point loads a path outside the shipped inventory, through static imports or top-level await', () => {
  assert.deepEqual(escapes(kit), []);
});

test('the guard flags static and top-level-await imports that leave the inventory and ignores lazy ones', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-guard-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), text); };
  write('fixtures/x.mjs', 'export const x = 1;\n');
  write('tools/entry-static.mjs', "#!/usr/bin/env node\nimport {helper} from './lib/helper.mjs';\n");
  write('tools/lib/helper.mjs', "import {x} from '../../fixtures/x.mjs';\nexport const helper = x;\n");
  write('tools/entry-await.mjs', "#!/usr/bin/env node\nimport './lib/loader.mjs';\n");
  write('tools/lib/loader.mjs', "const {x} = await import('../../fixtures/x.mjs');\nexport {x};\n");
  assert.deepEqual(escapes(root), [
    'tools/entry-await.mjs > tools/lib/loader.mjs -> ../../fixtures/x.mjs (fixtures/x.mjs)',
    'tools/entry-static.mjs > tools/lib/helper.mjs -> ../../fixtures/x.mjs (fixtures/x.mjs)',
  ]);
  write('tools/entry-await.mjs', "#!/usr/bin/env node\nexport async function run() {\n  const {x} = await import('../fixtures/x.mjs');\n  return x;\n}\nif (process.argv[1]) await run();\n");
  write('tools/lib/loader.mjs', 'export const x = 1;\n'); write('tools/lib/helper.mjs', 'export const helper = 1;\n');
  assert.deepEqual(escapes(root), [], 'a dynamic import inside a function is the allowed lazy form');
});

test('kit-only developer checks refuse inside an initialized project with a clear message', t => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shipped-tools-')));   // lint.mjs compares its entry path without resolving symlinks
  t.after(() => fs.rmSync(base, {recursive: true, force: true}));
  const project = path.join(base, 'project');
  const made = spawnSync(process.execPath, [path.join(kit, 'tools/run/init.mjs'), '--project', project, '--name', 'Saved filters', '--lang', 'en'], {encoding: 'utf8', timeout: 20000});
  assert.equal(made.status, 0, made.stdout + made.stderr);
  for (const [tool, args] of [['tools/lint/lint.mjs', ['--self-test']], ['tools/evals/run-evals.mjs', ['--fake']]]) {
    const r = spawnSync(process.execPath, [path.join(project, tool), ...args], {encoding: 'utf8', cwd: project, timeout: 60000});
    assert.equal(r.status, 2, `${tool}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /kit-only developer/, tool); assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/, tool);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromiumOrNull, NO_BROWSER } from './helpers.mjs';

/* /spec:view runs the project's own copy of the reader tools. init copies tools/ but not fixtures/, so verify must not need them. */
const root = fileURLToPath(new URL('../../..', import.meta.url));
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-in-project-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const node = (args, options = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 300000, ...options });
function initProject(t) {
  const project = path.join(tmp(t), 'project');
  const made = node([path.join(root, 'tools/run/init.mjs'), '--project', project, '--name', 'Saved filters', '--lang', 'en']);
  assert.equal(made.status, 0, made.stdout + made.stderr);
  assert.equal(fs.existsSync(path.join(project, 'fixtures')), false, 'init does not copy fixtures/');
  return project;
}

test('the project copy of verify.mjs checks a rendered reader without the kit fixtures', (t) => {
  assert.ok(chromiumOrNull(), NO_BROWSER);
  const project = initProject(t);
  const out = path.join(project, 'reader-out');
  const rendered = node([path.join(project, 'tools/reader/render.mjs'), path.join(root, 'fixtures/v2/full'), '--out', out]);
  assert.equal(rendered.status, 0, rendered.stdout + rendered.stderr);
  const verified = node([path.join(project, 'tools/reader/verify.mjs'), out, '--proof', path.join(project, 'proof')], { cwd: project });
  assert.doesNotMatch(verified.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/);
  assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  assert.match(verified.stdout, /VERIFY GREEN/);
});

test('--self-test inside a project without fixtures says it is a kit-only developer check and exits 2', (t) => {
  const project = initProject(t);
  const r = node([path.join(project, 'tools/reader/verify.mjs'), '--self-test'], { cwd: project });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /kit-only developer check/);
  assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/);
});

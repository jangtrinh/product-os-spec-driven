import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const render = (spec, out, extra = []) => spawnSync(process.execPath, [path.join(root, 'tools/reader/render.mjs'), path.join(root, spec), '--out', out, ...extra], { encoding: 'utf8' });
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'render-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('render is deterministic and offline output names the product and loads nothing remote', (t) => {
  const a = tmp(t), b = tmp(t);
  assert.equal(render('fixtures/v2/full', a).status, 0); assert.equal(render('fixtures/v2/full', b).status, 0);
  const ra = JSON.parse(fs.readFileSync(path.join(a, 'render-report.json'), 'utf8')), rb = JSON.parse(fs.readFileSync(path.join(b, 'render-report.json'), 'utf8'));
  assert.equal(ra.contentDigest, rb.contentDigest);
  assert.equal(fs.readFileSync(path.join(a, 'artifact/content.json'), 'utf8'), fs.readFileSync(path.join(b, 'artifact/content.json'), 'utf8'));
  const html = fs.readFileSync(path.join(a, 'offline/index.html'), 'utf8');
  assert.match(html, /PRODUCT:OS Spec Driven/);
  const tags = html.replace(/<script>[\s\S]*?<\/script>/g, '');
  assert.ok(!/(src|href)="https?:/.test(tags) && !/url\(https?:/.test(tags));
});

test('render refuses a spec with lint errors; --force marks the preview invalid', (t) => {
  const bad = tmp(t); fs.cpSync(path.join(root, 'fixtures/v2/full'), bad, { recursive: true }); fs.appendFileSync(path.join(bad, 'us/US-01.md'), '\nOPEN[blocking]: ask\n');
  const out = tmp(t), refused = spawnSync(process.execPath, [path.join(root, 'tools/reader/render.mjs'), bad, '--out', out], { encoding: 'utf8' });
  assert.equal(refused.status, 1); assert.match(refused.stderr, /render refused/); assert.equal(fs.existsSync(path.join(out, 'offline')), false);
  const forced = spawnSync(process.execPath, [path.join(root, 'tools/reader/render.mjs'), bad, '--out', out, '--force'], { encoding: 'utf8' });
  assert.equal(forced.status, 0);
  const data = JSON.parse(fs.readFileSync(path.join(out, 'artifact/content.json'), 'utf8'));
  assert.ok(data.lint.errors >= 1);
});

test('the committed shell matches shell-src and the adverse fixtures match a fresh build', () => {
  const shell = spawnSync(process.execPath, [path.join(root, 'tools/reader/make-shell.mjs'), '--check'], { encoding: 'utf8' }); assert.equal(shell.status, 0, shell.stderr);
  const fixtures = spawnSync(process.execPath, [path.join(root, 'fixtures/reader/build-adverse-fixtures.mjs'), '--check'], { encoding: 'utf8' }); assert.equal(fixtures.status, 0, fixtures.stderr);
});

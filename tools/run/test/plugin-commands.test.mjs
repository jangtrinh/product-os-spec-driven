import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {kitContentPaths} from '../../lib/kit-content-paths.mjs';
const kit = fileURLToPath(new URL('../../../', import.meta.url));
const commands = ['setup', 'new', 'run', 'clarify', 'gate', 'status', 'view', 'upgrade'];
const read = file => fs.readFileSync(path.join(kit, file), 'utf8');
test('plugin id, marketplace, version and eight bounded skill entrypoints match the shipped kit', () => {
  const plugin = JSON.parse(read('.claude-plugin/plugin.json')), marketplace = JSON.parse(read('.claude-plugin/marketplace.json'));
  assert.equal(plugin.name, 'spec'); assert.equal(plugin.version, JSON.parse(read('tools/package.json')).version); assert.match(plugin.description, /PRODUCT:OS Spec Driven/);
  assert.equal(marketplace.name, 'product-os-spec-driven'); assert.deepEqual(marketplace.plugins.map(p => [p.name, p.source]), [['spec', './']]);
  for (const command of commands) {
    const text = read(`skills/${command}/SKILL.md`);
    assert.ok(text.split('\n').length <= 120, command); assert.match(text, /description:/); assert.match(text, /argument-hint:/);
    assert.ok(text.includes('${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md')); assert.ok(text.includes('--project'));
  }
  assert.match(read('skills/_shared/rules.md'), /same.session/i);
  assert.match(read('skills/gate/SKILL.md'), /--confirmed-via ask-user/);
  assert.match(read('skills/clarify/SKILL.md'), /input\/answers.md/);
});
for (const host of ['codex', 'grok']) test(`${host} installer binds paths with spaces, is idempotent, check is read-only and collisions refuse`, t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'host with spaces ')); t.after(() => fs.rmSync(home, {recursive: true, force: true}));
  const call = args => spawnSync(process.execPath, [path.join(kit, 'scripts/install-hosts.mjs'), '--host', host, '--home', home, ...args], {encoding: 'utf8'});
  let r = call(['--check']); assert.notEqual(r.status, 0); assert.deepEqual(fs.readdirSync(home), []);
  r = call([]); assert.equal(r.status, 0, r.stdout + r.stderr);
  const directory = path.join(home, host === 'codex' ? '.agents/skills' : '.claude/skills');
  for (const command of commands) {
    const full = path.join(directory, `spec-${command}`); assert.ok(fs.lstatSync(full).isSymbolicLink());
    const text = fs.readFileSync(path.join(full, 'SKILL.md'), 'utf8'); assert.ok(!text.includes('${CLAUDE_PLUGIN_ROOT}'));
    assert.match(text, new RegExp(`name: spec-${command}`)); assert.ok(text.includes(kit.replace(/\/$/, '')));
  }
  assert.equal(call([]).status, 0); assert.equal(call(['--check']).status, 0);
  const collision = path.join(directory, 'spec-run'); fs.unlinkSync(collision); fs.mkdirSync(collision); fs.writeFileSync(path.join(collision, 'SKILL.md'), 'Owner file');
  r = call([]); assert.equal(r.status, 3); assert.match(r.stdout, /unrelated/); assert.equal(fs.readFileSync(path.join(collision, 'SKILL.md'), 'utf8'), 'Owner file');
});
test('embedded runtime works from a read-only plugin cache with spaces without plans, evidence or dependencies', t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin cache with spaces '));
  const cache = path.join(scratch, 'read only kit'), project = path.join(scratch, 'new project'); fs.mkdirSync(cache);
  const modes = [];
  t.after(() => {for (const [file, mode] of modes.reverse()) fs.chmodSync(file, mode); fs.rmSync(scratch, {recursive: true, force: true});});
  for (const file of [...kitContentPaths, '.claude-plugin/', 'skills/', 'scripts/install-hosts.mjs']) fs.cpSync(path.join(kit, file), path.join(cache, file), {recursive: true, filter: source => !source.split(path.sep).includes('node_modules') && !source.includes('/evals/results')});
  function readonly(dir) {for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, ent.name); if (ent.isDirectory()) readonly(full);
    const mode = fs.statSync(full).mode & 0o777; modes.push([full, mode]); fs.chmodSync(full, ent.isDirectory() ? 0o555 : mode & ~0o222);
  }} readonly(cache); modes.push([cache, 0o755]); fs.chmodSync(cache, 0o555);
  const call = (entry, args = []) => spawnSync(process.execPath, [path.join(cache, 'tools/run', entry), '--project', project, ...args], {encoding: 'utf8'});
  let r = call('init.mjs', ['--name', 'Cached fixture', '--lang', 'en']); assert.equal(r.status, 0, r.stdout + r.stderr);
  r = call('status.mjs', ['--json']); assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(JSON.parse(r.stdout).stages.length, 9);
  for (const file of ['plans', 'node_modules', 'reference', 'review']) assert.equal(fs.existsSync(path.join(cache, file)), false, file);
  assert.equal(fs.existsSync(path.join(cache, 'kit.lock.json')), false);
});
test('plugin distribution stages the complete runtime without repo history, plans or node_modules', t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-distribution-')); t.after(() => fs.rmSync(scratch, {recursive: true, force: true}));
  const out = path.join(scratch, 'plugin');
  const call = args => spawnSync(process.execPath, [path.join(kit, 'scripts/pack-plugin.mjs'), '--out', out, ...args], {encoding: 'utf8'});
  let r = call(['--dry-run']); assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(fs.existsSync(out), false);
  r = call([]); assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const file of [...kitContentPaths, '.claude-plugin/plugin.json', 'skills/status/SKILL.md', 'fixtures/runner/project-fixture.mjs', 'scripts/install-hosts.mjs']) assert.ok(fs.existsSync(path.join(out, file)), file);
  for (const file of ['plans', 'reference', '.git', 'node_modules', 'tools/node_modules']) assert.equal(fs.existsSync(path.join(out, file)), false, file);
  assert.equal(call([]).status, 3);
});

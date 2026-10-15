import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const kit = fileURLToPath(new URL('../../../', import.meta.url));
// A project installed by the real `init`, so it carries its own runner copy and the real install lock.
function installedProject(t, {lock} = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'context-installed-')));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const project = path.join(dir, 'project'), source = path.join(dir, 'prepared');
  const init = spawnSync(process.execPath, [path.join(kit, 'tools/run/init.mjs'), '--project', project, '--name', 'Installed', '--lang', 'en', '--writer', 'manual', '--reviewer', 'manual'], {encoding: 'utf8'});
  assert.equal(init.status, 0, init.stdout + init.stderr);
  if (lock === null) fs.rmSync(path.join(project, 'kit.lock.json'));
  else if (lock !== undefined) fs.writeFileSync(path.join(project, 'kit.lock.json'), lock);
  fs.mkdirSync(source, {recursive: true}); fs.writeFileSync(path.join(source, 'notes.md'), 'Prepared notes\n');
  const call = (args = [], cwd = project) => spawnSync(process.execPath, [path.join(project, 'tools/run/load-context.mjs'), '--project', cwd, '--kind', 'sources', '--json', ...args], {encoding: 'utf8'});
  return {dir, project, source, call};
}
const refusals = result => JSON.parse(result.stdout).refusals;

test('the project own installed copy loads prepared context into its own context folder', t => {
  const p = installedProject(t);
  const r = p.call(['--from', p.source]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.readFileSync(path.join(p.project, 'context/sources/notes.md'), 'utf8'), 'Prepared notes\n');
});
test('an installed copy still refuses a subfolder of itself as the project', t => {
  const p = installedProject(t);
  const inner = path.join(p.project, 'nested'); fs.mkdirSync(inner);
  const r = p.call(['--from', p.source], inner);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.deepEqual(refusals(r), ['Project is inside the kit']);
});
test('an installed copy still refuses sources that overlap the project or its kit files', t => {
  const p = installedProject(t);
  const file = path.join(p.project, 'tools/run/load-context.mjs');
  const r = p.call(['--from', file]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.deepEqual(refusals(r), [`Refusing path inside the kit: ${file}`]);
  assert.equal(fs.existsSync(path.join(p.project, 'context/sources')), false);
});
for (const [name, lock] of [
  ['no lock', null],
  ['a stub lockVersion-only lock', '{"lockVersion":1}\n'],
  ['a lock with a version and files but no inventory', '{"lockVersion":1,"kitVersion":"0.0.0","kitCommit":null,"files":{}}\n'],
]) {
  test(`a kit root with ${name} is refused as its own project and nothing is written`, t => {
    const p = installedProject(t, {lock});
    const before = fs.existsSync(path.join(p.project, 'context/sources'));
    const r = p.call(['--from', p.source]);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.deepEqual(refusals(r), ['Project is inside the kit']);
    assert.equal(fs.existsSync(path.join(p.project, 'context/sources')), before);
    assert.equal(fs.existsSync(path.join(p.project, 'context/sources/notes.md')), false);
  });
}
test('the source kit checkout refuses itself as project even when the target carries a real lock', t => {
  const p = installedProject(t);
  const r = spawnSync(process.execPath, [path.join(kit, 'tools/run/load-context.mjs'), '--project', kit, '--kind', 'sources', '--json', '--from', p.source], {encoding: 'utf8'});
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).refusals, ['Project is inside the kit']);
  assert.equal(fs.existsSync(path.join(kit, 'context/sources/notes.md')), false);
});

// The source kit checkout: kit content plus source-only trees, no review registries.
function kitCopy(t, lockFrom) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'context-kit-copy-')));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const root = path.join(dir, 'kit'), source = path.join(dir, 'prepared');
  for (const name of ['SPEC.md', 'README.md', 'AGENTS.md', 'format', 'templates', 'rules', 'prompts', 'tools', 'config', 'evals', 'fixtures']) {
    if (fs.existsSync(path.join(kit, name))) fs.cpSync(path.join(kit, name), path.join(root, name), {recursive: true, filter: file => !/[/\\](node_modules|\.git)$/.test(file)});
  }
  if (lockFrom) fs.copyFileSync(path.join(lockFrom, 'kit.lock.json'), path.join(root, 'kit.lock.json'));
  fs.mkdirSync(source, {recursive: true}); fs.writeFileSync(path.join(source, 'notes.md'), 'Prepared notes\n');
  return {root, source, call: () => spawnSync(process.execPath, [path.join(root, 'tools/run/load-context.mjs'), '--project', root, '--kind', 'sources', '--json', '--from', source], {encoding: 'utf8'})};
}
test('a real install lock copied onto the source kit root does not make it a project', t => {
  const installed = installedProject(t);
  const copy = kitCopy(t, installed.project);
  const r = copy.call();
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.deepEqual(refusals(r), ['Project is inside the kit']);
  assert.equal(fs.existsSync(path.join(copy.root, 'context')), false);
});
test('an installed project whose owner edited approvers and agent commands is still accepted', t => {
  const p = installedProject(t);
  const file = path.join(p.project, 'config/pipeline.yaml');
  let config = fs.readFileSync(file, 'utf8');
  config = config.replace(/(\n  po:\n    enabled: true\n    gate: true\n)/, '$1    approvers:\n      - "po@example.test"\n').replace('  writer:\n    command: "manual"', '  writer:\n    command: "node tools/agents/codex-writer"');
  fs.writeFileSync(file, config);
  const r = p.call(['--from', p.source]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test('an installed project with an edited kit file is still its own project (drift is the upgrade command\'s concern)', t => {
  const p = installedProject(t);
  fs.appendFileSync(path.join(p.project, 'prompts/intake.md'), '\nowner edit\n');
  const r = p.call(['--from', p.source]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

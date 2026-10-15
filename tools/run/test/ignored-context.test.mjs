import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
const kit = fileURLToPath(new URL('../../../', import.meta.url));
const statusEntry = path.join(kit, 'tools/run/status.mjs');
function snapshot(root) {
  const rows = {};
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, ent.name);
      rows[path.relative(root, full)] = ent.isDirectory() ? 'directory' : fs.readFileSync(full).toString('base64');
      if (ent.isDirectory()) walk(full);
    }
  }
  walk(root);
  return rows;
}
function status(root, args = []) {
  return spawnSync(process.execPath, [statusEntry, '--project', root, ...args], {encoding: 'utf8'});
}
test('status lists each ignored optional file by folder and writes nothing', t => {
  const p = projectFixture(t, ['prd', 'wireframe']);
  p.config.stages.prd.optional_context = ['context/sources/**'];
  p.config.stages.us.optional_context = ['context/sources/**'];
  p.config.stages.wireframe.optional_context = ['context/ui/**'];
  p.save();
  p.write('context/sources/note.md', 'Prepared context');
  p.write('context/sources/shot.png', 'png');
  p.write('context/sources/notes.pdf', 'pdf');
  p.write('context/ui/page.html', '<main>Page</main>');
  p.write('context/ui/frame.jpg', 'jpg');
  p.write('context/other/extra.png', 'png');
  fs.writeFileSync(path.join(p.root, 'context/sources/.DS_Store'), Buffer.from([0, 1, 2, 0]));
  fs.writeFileSync(path.join(p.root, 'context/sources/._note.md'), Buffer.from([0, 1]));
  const before = snapshot(p.root);
  const json = status(p.root, ['--json']);
  assert.equal(json.status, 0, json.stdout + json.stderr);
  const value = JSON.parse(json.stdout);
  assert.deepEqual(value.ignored_context, [
    {folder: 'context/sources', files: [
      {file: 'context/sources/notes.pdf', reason: 'unsupported format: export as .md / .html / .json UTF-8 text'},
      {file: 'context/sources/shot.png', reason: 'unsupported format: describe the screen in a .md file'},
    ], os_junk: 2},
    {folder: 'context/ui', files: [
      {file: 'context/ui/frame.jpg', reason: 'unsupported format: describe the screen in a .md file'},
    ], os_junk: 0},
  ]);
  const text = status(p.root);
  assert.equal(text.status, 0, text.stdout + text.stderr);
  assert.match(text.stdout, /Ignored context\/sources:\n- context\/sources\/notes\.pdf: unsupported format: export as \.md \/ \.html \/ \.json UTF-8 text\n- context\/sources\/shot\.png: unsupported format: describe the screen in a \.md file\n- OS junk: 2\nIgnored context\/ui:\n- context\/ui\/frame\.jpg: unsupported format: describe the screen in a \.md file\n/);
  assert.doesNotMatch(text.stdout, /note\.md|page\.html|extra\.png|\.DS_Store|\._note\.md/);
  assert.deepEqual(snapshot(p.root), before);
});
test('a stage run warns once per ignored non-junk file and leaves the gate and exit code unchanged', t => {
  const p = projectFixture(t, ['prd']);
  p.config.roles.po.enabled = false;
  p.config.stages.prd.optional_context = ['context/sources/**'];
  p.save();
  p.write('context/sources/note.md', 'Prepared context');
  p.write('context/sources/shot.png', 'png');
  fs.writeFileSync(path.join(p.root, 'context/sources/.DS_Store'), Buffer.from([0, 1, 2, 0]));
  const first = p.run();
  assert.equal(first.code, 0, first.out);
  assert.deepEqual(first.out.split('\n').filter(line => line.startsWith('Ignored context file:')), ['Ignored context file: context/sources/shot.png: unsupported format: describe the screen in a .md file']);
  assert.ok(p.gate('prd').data.inputs['context/sources/note.md']);
  assert.equal(p.gate('prd').data.inputs['context/sources/shot.png'], undefined);
  assert.equal(Object.hasOwn(p.gate('prd').data.inputs, 'context/sources/.DS_Store'), false);
  const raw = p.gate('prd').raw;
  const second = p.run();
  assert.equal(second.code, 0, second.out);
  assert.equal(second.out.includes('Ignored context file:'), false);
  assert.equal(p.gate('prd').raw, raw);
});
test('a stage that does not read the folder prints no ignore warning', t => {
  const p = projectFixture(t, ['prd']);
  p.config.roles.po.enabled = false;
  p.save();
  fs.mkdirSync(path.join(p.root, 'context/sources'), {recursive: true});
  fs.writeFileSync(path.join(p.root, 'context/sources/shot.png'), 'png');
  const result = p.run();
  assert.equal(result.code, 0, result.out);
  assert.equal(result.out.includes('Ignored context file:'), false);
});
test('the guide and status skill tell the PO that dropped files are listed', () => {
  const guide = fs.readFileSync(path.join(kit, 'docs/context-guide.md'), 'utf8');
  const skill = fs.readFileSync(path.join(kit, 'skills/status/SKILL.md'), 'utf8');
  assert.match(guide, /File ngoài danh sách cho phép bị bỏ qua khi stage đọc context, và `\/spec:status` liệt kê chúng\./);
  assert.match(skill, /ignored context files/i);
  assert.match(skill, /plain words/);
  assert.match(skill, /docs\/context-guide\.md/);
  assert.match(skill, /describe the screen in a \.md file/);
});

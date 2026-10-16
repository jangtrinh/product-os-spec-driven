import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('T6: init does not copy promoted cases or provenance into a project', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'init-promoted-case-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  const kit = path.join(temp, 'kit');
  fs.cpSync('.', kit, {recursive: true, filter: source => !['.git', 'node_modules'].includes(path.basename(source))});
  const promoted = path.join(kit, 'evals/promoted/example');
  fs.mkdirSync(promoted, {recursive: true});
  fs.writeFileSync(path.join(promoted, 'provenance.json'), '{"fixture":true}\n');
  const project = path.join(temp, 'project');
  const result = spawnSync(process.execPath, [path.join(kit, 'tools/run/init.mjs'), '--project', project, '--name', 'Fixture', '--lang', 'en'], {cwd: kit, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.existsSync(path.join(project, 'evals/promoted')), false);
});

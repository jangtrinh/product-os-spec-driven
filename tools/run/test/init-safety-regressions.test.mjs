import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadConfig} from '../../lib/config/config-loader.mjs';

const entry = fileURLToPath(new URL('../init.mjs', import.meta.url));
function temp(t) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'init-safety-'));
 t.after(() => fs.rmSync(root, {recursive:true, force:true}));
 return root;
}
function call(init, root, {name='Literal project', agent='manual', force=false}={}) {
 return spawnSync(process.execPath, [init, '--project', root, '--name', name, '--lang', 'en', '--agent', agent, ...(force ? ['--force'] : [])], {encoding:'utf8', timeout:20000});
}
function installed(t) {
 const parent = temp(t), kit = path.join(parent, 'kit');
 const result = call(entry, kit);
 assert.equal(result.status, 0, result.stdout + result.stderr);
 return {parent, kit, init:path.join(kit, 'tools/run/init.mjs')};
}
function contents(root) {
 const result = {};
 function walk(dir) {
  for (const ent of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) {
   const rel = path.join(dir, ent.name);
   if (ent.isDirectory()) walk(rel);
   else if (ent.isSymbolicLink()) result[rel] = {link:fs.readlinkSync(path.join(root, rel))};
   else result[rel] = fs.readFileSync(path.join(root, rel)).toString('base64');
  }
 }
 walk('');
 return result;
}

test('existing descendant target is refused without copying any files', t => {
 const {kit, init} = installed(t), target = path.join(kit, 'nested');
 fs.mkdirSync(target);
 const before = contents(kit), result = call(init, target);
 assert.equal(result.status, 3, result.stdout + result.stderr);
 assert.match(result.stdout, /overlaps the source kit/);
 assert.deepEqual(fs.readdirSync(target), []);
 assert.deepEqual(contents(kit), before);
});

test('missing descendant target is refused before creating directories', t => {
 const {kit, init} = installed(t), target = path.join(kit, 'nested', 'project');
 const before = contents(kit), result = call(init, target);
 assert.equal(result.status, 3, result.stdout + result.stderr);
 assert.match(result.stdout, /overlaps the source kit/);
 assert.equal(fs.existsSync(path.join(kit, 'nested')), false);
 assert.deepEqual(contents(kit), before);
});

test('a symlinked parent cannot hide a missing descendant destination', t => {
 const {parent, kit, init} = installed(t), alias = path.join(parent, 'kit-alias');
 fs.symlinkSync(kit, alias);
 const before = contents(kit), result = call(init, path.join(alias, 'nested', 'project'));
 assert.equal(result.status, 3, result.stdout + result.stderr);
 assert.match(result.stdout, /overlaps the source kit/);
 assert.equal(fs.existsSync(path.join(kit, 'nested')), false);
 assert.deepEqual(contents(kit), before);
});

test('ancestor target is refused even with force and preserves the source kit', t => {
 const {parent, init} = installed(t), before = contents(parent);
 const result = call(init, parent, {force:true});
 assert.equal(result.status, 3, result.stdout + result.stderr);
 assert.match(result.stdout, /overlaps the source kit/);
 assert.deepEqual(contents(parent), before);
});

test('a sibling sharing the kit name prefix remains a valid destination', t => {
 const {kit, init} = installed(t), target = kit + '-other';
 const before = contents(kit), result = call(init, target);
 assert.equal(result.status, 0, result.stdout + result.stderr);
 assert.equal(loadConfig(target).project.name, 'Literal project');
 assert.deepEqual(contents(kit), before);
});

for (const name of ['$&', '$1', '$$']) {
 test(`project name ${JSON.stringify(name)} round-trips literally through the config loader`, t => {
  const root = temp(t), result = call(entry, root, {name});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(loadConfig(root).project.name, name);
 });
}

test('custom agent replacement tokens round-trip literally for both roles', t => {
 const root = temp(t), agent = 'node custom-agent.mjs --literal "$& $1 $$ $` $\'"';
 const result = call(entry, root, {agent});
 assert.equal(result.status, 0, result.stdout + result.stderr);
 const config = loadConfig(root);
 assert.equal(config.agents.writer.command, agent);
 assert.equal(config.agents.reviewer.command, agent);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadConfig, STAGES} from '../../lib/config/config-loader.mjs';
import {loadRegistries} from '../registries.mjs';
const kit = fileURLToPath(new URL('../../../', import.meta.url));
const init = path.join(kit, 'tools/run/init.mjs');
function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-init-')); t.after(() => fs.rmSync(root, {recursive:true,force:true})); return root; }
function call(root, args=[]) { return spawnSync(process.execPath,[init,'--project',root,'--name','A fresh project','--lang','en',...args],{encoding:'utf8',timeout:20000}); }
function contents(root) { const result={}; function walk(dir) { for (const ent of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) { const rel=path.join(dir,ent.name); if(ent.isDirectory()) walk(rel); else result[rel]=fs.readFileSync(path.join(root,rel)).toString('base64'); } } walk(''); return result; }
test('empty project initializes all registries and immediately reaches the manual intake prompt', t => {
 const root=temp(t), r=call(root); assert.equal(r.status,0,r.stdout+r.stderr);
 const c=loadConfig(root), registry=loadRegistries(root,c);
 assert.equal(c.project.name,'A fresh project'); assert.equal(c.project.doc_language,'en');
 assert.equal(c.agents.writer.command,'manual'); assert.equal(c.agents.reviewer.command,'manual');
 assert.equal(c.roles.po.approvers,undefined); assert.match(r.stdout,/approvers/);
 for(const stage of STAGES) assert.ok(fs.existsSync(path.join(root,`review/definitions/${c.gates.stage_definitions[stage].id}/1.json`)));
 assert.equal(registry.graph.complete,false); assert.ok(registry.baseline);
 assert.deepEqual(fs.readdirSync(path.join(root,'spec')),[]);
 assert.equal(fs.readFileSync(path.join(root,'context/tech.md'),'utf8'),fs.readFileSync(path.join(kit,'templates/tech-context.md'),'utf8'));
 assert.equal(fs.existsSync(path.join(root,'evals/results')),false);
 const runner=spawnSync(process.execPath,[path.join(root,'tools/run/run.mjs'),'--project',root,'--head','fresh-source','--build','not-built'],{encoding:'utf8',timeout:20000});
 assert.equal(runner.status,2,runner.stdout+runner.stderr); assert.match(runner.stdout,/STAGE: intake/); assert.match(runner.stdout,/--result/);
});
test('refusal and explicit reuse preserve every existing input, spec and review byte', t => {
 const root=temp(t); assert.equal(call(root).status,0);
 fs.writeFileSync(path.join(root,'input/po-spec.md'),'Owner input'); fs.writeFileSync(path.join(root,'spec/owner.md'),'Owner spec'); fs.writeFileSync(path.join(root,'review/owner.txt'),'Owner review');
 const before=contents(root); assert.equal(call(root).status,3); assert.deepEqual(contents(root),before);
 assert.equal(call(root,['--force']).status,0); assert.deepEqual(contents(root),before);
});
test('nonempty and symlink targets refuse without changing their bytes or outside files', t => {
 const root=temp(t); fs.writeFileSync(path.join(root,'keep.txt'),'Keep'); const before=contents(root);
 assert.equal(call(root).status,3); assert.deepEqual(contents(root),before);
 const outside=temp(t); fs.symlinkSync(outside,path.join(root,'input')); assert.equal(call(root,['--force']).status,3);
 assert.deepEqual(fs.readdirSync(outside),[]);
});
test('writer/reviewer selection is independent and malformed options have no side effects', t => {
 const root=temp(t), r=call(root,['--writer','codex','--reviewer','claude']); assert.equal(r.status,0,r.stderr);
 const c=loadConfig(root); assert.match(c.agents.writer.command,/codex-writer/); assert.match(c.agents.reviewer.command,/claude-reviewer/);
 for(const args of [['--lang','xx'],['--writer','unknown'],['--agent','codex','--writer','manual'],['--name',''],['--unknown']]) {
  const p=temp(t); assert.equal(call(p,args).status,3); assert.deepEqual(fs.readdirSync(p),[]);
 }
});

test('init on an existing project refuses a differing writer with exit 3 and writes nothing', t => {
 const root=temp(t); assert.equal(call(root,['--writer','codex','--reviewer','claude']).status,0);
 fs.rmSync(path.join(root,'SPEC.md')); // a successful --force copy would restore this missing kit file
 const before=contents(root), config=fs.readFileSync(path.join(root,'config/pipeline.yaml'));
 const r=call(root,['--force','--writer','claude','--reviewer','claude']);
 assert.equal(r.status,3,r.stdout+r.stderr);
 assert.match(r.stdout,/Writer differs from config: config\/pipeline\.yaml agents\.writer\.command is "node tools\/agents\/codex-writer"; to switch, set it to "node tools\/agents\/claude-writer", then run doctor\./);
 assert.ok(fs.readFileSync(path.join(root,'config/pipeline.yaml')).equals(config));
 assert.deepEqual(contents(root),before);
});
test('init on an existing project with equal writer and reviewer flags still exits 0', t => {
 const root=temp(t); assert.equal(call(root,['--writer','codex','--reviewer','claude']).status,0);
 const r=call(root,['--force','--writer','codex','--reviewer','claude']); assert.equal(r.status,0,r.stdout+r.stderr);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadConfig} from '../../lib/config/config-loader.mjs';
import {parseYaml} from '../../lib/config/yaml-parser.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';
import {planUpgrade,applyUpgrade,kitStatus} from '../kit-upgrade.mjs';
const kit=fileURLToPath(new URL('../../../',import.meta.url)),configFile='config/pipeline.yaml';
function fresh(t) {const root=fs.mkdtempSync(path.join(os.tmpdir(),'readable-upgrade-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const r=spawnSync(process.execPath,[path.join(kit,'tools/run/init.mjs'),'--project',root,'--name','Product','--lang','en'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout);return root;}
function text(root) {return fs.readFileSync(path.join(root,configFile),'utf8');}
function lint(root) {const r=spawnSync(process.execPath,[path.join(kit,'tools/lint/lint.mjs'),path.join(root,'spec'),'--pipeline',path.join(root,configFile),'--stage','intake','--json'],{encoding:'utf8'});return JSON.parse(r.stdout).problems.filter(p=>p.code==='E-INPUT'&&p.file===path.join(root,configFile));}
function priorJson(root) {const c=loadConfig(root),bytes=canonical(c)+'\n';fs.writeFileSync(path.join(root,configFile),bytes);const file=path.join(root,'kit.lock.json'),lock=JSON.parse(fs.readFileSync(file));lock.files[configFile]=sha256(bytes);const {inventoryHash,...rest}=lock;lock.inventoryHash=sha256(canonical(rest));fs.writeFileSync(file,canonical(lock)+'\n');return c;}
function snapshot(root) {const rows=[];function walk(dir=''){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const f=dir?dir+'/'+e.name:e.name;if(e.isDirectory())walk(f);else rows.push([f,sha256(fs.readFileSync(path.join(root,f)))]);}}walk();return rows.sort();}
test('definition bump changes only its YAML value line and keeps every comment',t=>{
 const root=fresh(t),before=text(root),c=loadConfig(root),file=path.join(root,'review/definitions/g1-intake/1.json'),def=JSON.parse(fs.readFileSync(file));def.outputs=['spec/old.md'];fs.writeFileSync(file,canonical(def));
 applyUpgrade(root,planUpgrade(kit,root));const after=text(root);assert.equal(after,before.replace(/(    intake:\n      id: g1-intake\n      version: )'1'/,"$1'2'"));c.gates.stage_definitions.intake.version='2';assert.equal(canonical(parseYaml(after)),canonical(c));assert.deepEqual(lint(root),[]);
});
test('previous upgrade JSON is listed for repair, restores template comments, and remains current',t=>{
 const root=fresh(t),c=priorJson(root),before=snapshot(root),plan=planUpgrade(kit,root);assert.ok(plan.rows.includes('repair config (written by previous upgrade)'));assert.deepEqual(snapshot(root),before);applyUpgrade(root,plan);assert.ok(!text(root).trimStart().startsWith('{'));assert.deepEqual(text(root).match(/^\s*#.*$/gm),fs.readFileSync(path.join(kit,configFile),'utf8').match(/^\s*#.*$/gm));assert.equal(canonical(loadConfig(root)),canonical(c));assert.deepEqual(lint(root),[]);assert.equal(kitStatus(root,kit),'current');assert.equal(planUpgrade(kit,root).operations.length,0);
});
test('owner-edited JSON refuses with exit 3 and a manual instruction before any writes',t=>{
 const root=fresh(t);priorJson(root);fs.appendFileSync(path.join(root,configFile),' ');const before=snapshot(root),r=spawnSync(process.execPath,[path.join(kit,'tools/run/init.mjs'),'--project',root,'--upgrade'],{encoding:'utf8'});assert.equal(r.status,3,r.stdout);assert.match(r.stdout,/config\/pipeline.yaml.*manual/i);assert.deepEqual(snapshot(root),before);
});
test('lint and runner parser agree on shipped, JSON and invalid configuration syntax',t=>{
 const root=fresh(t),shipped=text(root);for(const source of [shipped,canonical(parseYaml(shipped)),'roles:\n  po: {enabled: true, enabled: false}\n','broken','a: &anchor x\n','a:\n\tb: 1\n']) {fs.writeFileSync(path.join(root,configFile),source);let accepted=true;try{parseYaml(source);}catch{accepted=false;}assert.equal(lint(root).length===0,accepted,source.slice(0,80));}
});
test('unsafe required value edit refuses the whole upgrade plan and names its key',t=>{
 const root=fresh(t),c=loadConfig(root),file=path.join(root,configFile),yaml=text(root);fs.writeFileSync(file,yaml.replace("    intake:\n      id: g1-intake\n      version: '1'","    intake: {id: g1-intake, version: '1'}"));
 const definition=path.join(root,'review/definitions/g1-intake/1.json'),def=JSON.parse(fs.readFileSync(definition));def.outputs=['spec/old.md'];fs.writeFileSync(definition,canonical(def));assert.equal(canonical(loadConfig(root)),canonical(c));const before=snapshot(root),r=spawnSync(process.execPath,[path.join(kit,'tools/run/init.mjs'),'--project',root,'--upgrade'],{encoding:'utf8'});assert.equal(r.status,3,r.stdout);assert.match(r.stdout,/gates.stage_definitions.intake.version.*manually edit/);assert.deepEqual(snapshot(root),before);
});
test('new kit default keys append as block YAML without changing existing bytes',async t=>{
 const root=fresh(t),source=fresh(t),before=text(root),next=loadConfig(source);next.roles.po.approvers=['po@example.test'];const {editYaml}=await import('../../lib/config/yaml-in-place.mjs');fs.writeFileSync(path.join(source,configFile),editYaml(text(source),next));
 applyUpgrade(root,planUpgrade(source,root));assert.equal(text(root),before.replace('  po:\n    enabled: true\n    gate: true\n','  po:\n    enabled: true\n    gate: true\n    approvers:\n      - "po@example.test"\n'));assert.deepEqual(loadConfig(root).roles.po.approvers,['po@example.test']);assert.deepEqual(lint(root),[]);
});

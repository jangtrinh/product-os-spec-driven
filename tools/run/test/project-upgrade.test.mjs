import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadConfig} from '../../lib/config/config-loader.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {editYaml} from '../../lib/config/yaml-in-place.mjs';
import {concreteOutputs} from '../../lib/output-patterns.mjs';
import {hasKitHistory} from './kit-history.mjs';

const kit=fileURLToPath(new URL('../../../',import.meta.url));
const entry=path.join(kit,'tools/run/init.mjs');
function temp(t) {const root=fs.mkdtempSync(path.join(os.tmpdir(),'kit-upgrade-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function call(root,flags=[],source=entry) {return spawnSync(process.execPath,[source,'--project',root,...flags],{encoding:'utf8',timeout:30000});}
function fresh(t) {const root=temp(t),r=call(root,['--name','Product','--lang','en']);assert.equal(r.status,0,r.stdout+r.stderr);return root;}
function tree(root) {
 const files={};
 function walk(dir='') {for(const ent of fs.readdirSync(path.join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
  const rel=dir?`${dir}/${ent.name}`:ent.name,file=path.join(root,rel);
  if(ent.isDirectory()) {files[rel+'/']='directory';walk(rel);}
  else files[rel]=ent.isSymbolicLink()?`link:${fs.readlinkSync(file)}`:`${fs.statSync(file).mode&0o777}:${sha256(fs.readFileSync(file))}`;
 }}
 walk();return files;
}
function put(root,file,bytes) {fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);}
function config(root,edit) {const c=loadConfig(root,'config/pipeline.yaml',{legacyStages:true});edit(c);put(root,'config/pipeline.yaml',editYaml(fs.readFileSync(path.join(root,'config/pipeline.yaml'),'utf8'),c));}
function nextKit(t) {const root=fresh(t);return {root,entry:path.join(root,'tools/run/init.mjs')};}
const legacySkillIds={
 'vsf:spec':'spec-structure',
 'vsf:gates':'gates',
 'vsf:think':'think',
 'vsf:design':'design',
 'vsf:review':'review',
 'vsf:dev':'dev',
 'vsf:brainstorm':'brainstorm',
};
function migrateSkillIds(config) {
 for(const stage of Object.values(config.stages)) if(stage.skill) stage.skill.skills=stage.skill.skills.map(id=>legacySkillIds[id]??id);
}

test('fresh init records installed hashes and doctor detects missing and changed kit files',async t=>{
 const root=fresh(t),file=path.join(root,'kit.lock.json');assert.ok(fs.existsSync(file),'fresh init must write kit.lock.json');
 const lock=JSON.parse(fs.readFileSync(file));assert.equal(lock.kitVersion,JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../package.json',import.meta.url)))).version);assert.ok(Object.hasOwn(lock,'kitCommit'));
 assert.equal(lock.files['tools/agents/agent-cli.mjs'],sha256(fs.readFileSync(path.join(root,'tools/agents/agent-cli.mjs'))));
 assert.equal(lock.files['config/pipeline.yaml'],sha256(fs.readFileSync(path.join(root,'config/pipeline.yaml'))));
 assert.equal(lock.files['evals/results/owner.txt'],undefined);
 const {doctor}=await import('../doctor.mjs');let lines=[];await doctor(['--project',root],s=>lines.push(s));assert.match(lines.join('\n'),/kit: current/);
 put(root,'tools/agents/agent-cli.mjs','stale');fs.unlinkSync(path.join(root,'templates/us.md'));
 lines=[];await doctor(['--project',root],s=>lines.push(s));assert.match(lines.join('\n'),/kit: drift \(2 files\)/);
 fs.unlinkSync(file);lines=[];await doctor(['--project',root],s=>lines.push(s));assert.match(lines.join('\n'),/kit: unknown \(no lock\)/);
});

test('legacy base init upgrades stale tools and appends a definition without modifying approvals or owner bytes',t=>{
 if (!hasKitHistory(t, kit, '35f878b')) return;
 const old=temp(t),archive=spawnSync('git',['archive','35f878b','SPEC.md','format','templates','rules','prompts','tools','evals','config'],{cwd:kit,maxBuffer:1024*1024*100});assert.equal(archive.status,0,archive.error?.message);
 const extracted=spawnSync('tar',['-x','-C',old],{input:archive.stdout});assert.equal(extracted.status,0);
 const root=temp(t),created=call(root,['--name','Legacy','--lang','en'],path.join(old,'tools/run/init.mjs'));assert.equal(created.status,0,created.stdout+created.stderr);
 assert.equal(fs.existsSync(path.join(root,'kit.lock.json')),false);
 put(root,'tools/agents/agent-cli.mjs','// legacy wrapper\n');
 const defFile='review/definitions/g3-us/1.json',def=JSON.parse(fs.readFileSync(path.join(root,defFile)));def.outputs=['spec/us/US-001.md'];put(root,defFile,canonical(def)+'\n');
 const originals={};for(const file of [defFile,'input/po-spec.md','spec/decisions/decisions.md','review/gates/G3.md','review/decisions/po.json','review/log/prior.txt','review/runtime/us.json','ui/screen.ts','tests/owner.test.js','evals/results/owner.txt']) {
  if(file!==defFile)put(root,file,file==='review/gates/G3.md'?'GATE: APPROVED\n\nOwner approval remains bound to definition version 1.\n':'owner-controlled bytes\n');originals[file]=sha256(fs.readFileSync(path.join(root,file)));
 }
 config(root,c=>{c.agents.reviewer.command='node owner-reviewer.mjs';});
 const r=call(root,['--upgrade']);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/unknown kit/);assert.match(r.stdout,/replace tools\/agents\/agent-cli.mjs/);
 assert.equal(fs.readFileSync(path.join(root,'tools/agents/agent-cli.mjs'),'utf8'),fs.readFileSync(path.join(kit,'tools/agents/agent-cli.mjs'),'utf8'));
 for(const [file,digest] of Object.entries(originals))assert.equal(sha256(fs.readFileSync(path.join(root,file))),digest,file);
 const c=loadConfig(root);assert.equal(c.agents.reviewer.command,'node owner-reviewer.mjs');assert.equal(c.gates.stage_definitions.us.version,'2');
 const current=JSON.parse(fs.readFileSync(path.join(root,'review/definitions/g3-us/2.json')));put(root,'spec/us/US-1.md','# US-1');assert.ok(concreteOutputs(root,current.outputs).includes('spec/us/US-1.md'));
 const before=tree(root),again=call(root,['--upgrade']);assert.equal(again.status,0,again.stdout);assert.match(again.stdout,/already current/);assert.deepEqual(tree(root),before);
});

test('dry run prints replacements, unknown obsolete keeps and definition versions without writes',t=>{
 const root=fresh(t);fs.unlinkSync(path.join(root,'kit.lock.json'));put(root,'tools/old-only.mjs','unknown file');put(root,'prompts/us.md','old');
 const defFile='review/definitions/g3-us/1.json',def=JSON.parse(fs.readFileSync(path.join(root,defFile)));def.outputs=['spec/us/US-001.md'];put(root,defFile,canonical(def));
 const before=tree(root),r=call(root,['--upgrade','--dry-run']);assert.equal(r.status,0,r.stdout);assert.match(r.stdout,/replace prompts\/us.md/);assert.match(r.stdout,/keep tools\/old-only.mjs/);assert.match(r.stdout,/definition.*g3-us\/2.json/);assert.match(r.stdout,/config.*agents.reviewer.command/);assert.deepEqual(tree(root),before);
});

test('three-way config merge preserves commands and project edits while updating defaults',t=>{
 const root=fresh(t),source=nextKit(t);config(root,c=>{c.agents.reviewer.command='node owner.mjs';c.review.max_rounds=7;});
 config(source.root,c=>{c.limits.max_fix_rounds=5;});
 const oldDef=fs.readFileSync(path.join(root,'review/definitions/g1-intake/1.json'));
 const r=call(root,['--upgrade'],source.entry);assert.equal(r.status,0,r.stdout+r.stderr);
 const c=loadConfig(root);assert.equal(c.project.name,'Product');assert.equal(c.project.doc_language,'en');assert.equal(c.agents.reviewer.command,'node owner.mjs');assert.equal(c.review.max_rounds,7);assert.equal(c.limits.max_fix_rounds,5);
 assert.deepEqual(fs.readFileSync(path.join(root,'review/definitions/g1-intake/1.json')),oldDef);
});

test('upgrade migrates owner-held legacy skill ids in dry-run and remains idempotent',t=>{
 const root=fresh(t),source=nextKit(t);
 config(root,c=>{c.stages.intake.skill.skills=['vsf:think'];});
 config(source.root,migrateSkillIds);
 const before=tree(root),dry=call(root,['--upgrade','--dry-run'],source.entry);
 assert.equal(dry.status,0,dry.stdout);
 assert.match(dry.stdout,/config stages\.intake\.skill\.skills/);
 assert.match(dry.stdout,/think/);
 assert.deepEqual(tree(root),before);
 const upgraded=call(root,['--upgrade'],source.entry);
 assert.equal(upgraded.status,0,upgraded.stdout);
 const after=loadConfig(root);
 assert.deepEqual(after.stages.intake.skill.skills,['think']);
 for(const stage of Object.values(after.stages)) assert.ok(stage.skill.skills.every(id=>!id.startsWith('vsf:')));
 const stable=tree(root),again=call(root,['--upgrade'],source.entry);
 assert.equal(again.status,0,again.stdout);
 assert.match(again.stdout,/already current/);
 assert.deepEqual(tree(root),stable);
});

test('a conflicting config key refuses the complete plan with exit 3 and no writes',t=>{
 const root=fresh(t),source=nextKit(t);config(root,c=>{c.limits.max_fix_rounds=4;});config(source.root,c=>{c.limits.max_fix_rounds=5;});
 put(source.root,'tools/agents/agent-cli.mjs','new kit bytes');const before=tree(root),r=call(root,['--upgrade'],source.entry);
 assert.equal(r.status,3,r.stdout);assert.match(r.stdout,/conflict.*limits.max_fix_rounds/i);assert.deepEqual(tree(root),before);
});

test('only known unchanged obsolete kit files are removed; modified obsolete files remain kept across reruns',t=>{
 const installing=nextKit(t),source=nextKit(t);
 for(const file of ['tools/obsolete.mjs','tools/modified.mjs'])put(installing.root,file,'old kit');
 const root=temp(t),created=call(root,['--name','Product','--lang','en'],installing.entry);assert.equal(created.status,0,created.stdout);
 put(root,'tools/modified.mjs','project changed');
 const r=call(root,['--upgrade'],source.entry);assert.equal(r.status,0,r.stdout);assert.match(r.stdout,/remove tools\/obsolete.mjs/);assert.match(r.stdout,/keep tools\/modified.mjs/);assert.equal(fs.existsSync(path.join(root,'tools/obsolete.mjs')),false);assert.equal(fs.readFileSync(path.join(root,'tools/modified.mjs'),'utf8'),'project changed');
 const before=tree(root);assert.equal(call(root,['--upgrade'],source.entry).status,0);assert.deepEqual(tree(root),before);
});

test('symlink escapes and malformed locks fail before changing any project or outside bytes',t=>{
 const root=fresh(t),outside=temp(t);put(outside,'us.md','outside');fs.unlinkSync(path.join(root,'templates/us.md'));fs.symlinkSync(path.join(outside,'us.md'),path.join(root,'templates/us.md'));
 let before=tree(root),r=call(root,['--upgrade']);assert.equal(r.status,3);assert.match(r.stdout,/symlink/i);assert.deepEqual(tree(root),before);assert.equal(fs.readFileSync(path.join(outside,'us.md'),'utf8'),'outside');
 fs.unlinkSync(path.join(root,'templates/us.md'));put(root,'kit.lock.json','{"files":{"../escape":"bad"}}');before=tree(root);r=call(root,['--upgrade']);assert.equal(r.status,3);assert.deepEqual(tree(root),before);
});

test('fault after replacements, removal and new definition rolls back bytes, modes and directories',async t=>{
 const installing=nextKit(t);put(installing.root,'tools/obsolete.mjs','old');
 const root=temp(t),created=call(root,['--name','Product','--lang','en'],installing.entry);assert.equal(created.status,0,created.stdout);
 put(root,'tools/agents/agent-cli.mjs','stale wrapper');fs.chmodSync(path.join(root,'tools/agents/agent-cli.mjs'),0o600);
 const file='review/definitions/g3-us/1.json',def=JSON.parse(fs.readFileSync(path.join(root,file)));def.outputs=['spec/us/US-001.md'];put(root,file,canonical(def));
 const before=tree(root);const {planUpgrade,applyUpgrade}=await import('../kit-upgrade.mjs');const plan=planUpgrade(kit,root);
 let count=0;assert.throws(()=>applyUpgrade(root,plan,{afterMutation:()=>{if(++count===plan.operations.length-1)throw Error('injected mid-write');}}),/injected mid-write/);
 assert.ok(count>2);assert.deepEqual(tree(root),before);
});

test('invalid upgrade option combinations refuse before writes',t=>{
 const root=fresh(t),before=tree(root);
 for(const flags of [['--dry-run'],['--upgrade','--force'],['--upgrade','--name','changed'],['--upgrade','--lang','vi']]) {const r=call(root,flags);assert.equal(r.status,3,r.stdout);assert.deepEqual(tree(root),before);}
});

test('unchanged definitions retain bytes and changed definitions skip every occupied version',t=>{
 const root=fresh(t),source=nextKit(t),file='review/definitions/g3-us/1.json';
 const prior=fs.readFileSync(path.join(root,file));put(root,'review/definitions/g3-us/7.json',prior);
 const def=JSON.parse(prior);def.outputs=['spec/us/US-001.md'];put(root,file,canonical(def));
 const unchanged=fs.readFileSync(path.join(root,'review/definitions/g1-intake/1.json')),version1=fs.readFileSync(path.join(root,file));
 const r=call(root,['--upgrade'],source.entry);assert.equal(r.status,0,r.stdout);
 assert.equal(loadConfig(root).gates.stage_definitions.us.version,'8');
 assert.deepEqual(fs.readFileSync(path.join(root,file)),version1);assert.deepEqual(fs.readFileSync(path.join(root,'review/definitions/g3-us/7.json')),prior);assert.deepEqual(fs.readFileSync(path.join(root,'review/definitions/g1-intake/1.json')),unchanged);
 const before=tree(root);assert.equal(call(root,['--upgrade'],source.entry).status,0);assert.deepEqual(tree(root),before);
});

test('staging and replacement rename errors roll back before returning an error',async t=>{
 const root=fresh(t);put(root,'tools/agents/agent-cli.mjs','stale');
 const {planUpgrade,applyUpgrade}=await import('../kit-upgrade.mjs');const before=tree(root),plan=planUpgrade(kit,root);
 const originalWrite=fs.writeFileSync,originalRename=fs.renameSync;
 try {
  fs.writeFileSync=(file,...args)=>{if(String(file).includes('/.kit-upgrade-'))throw Error('injected staging failure');return originalWrite(file,...args);};
  assert.throws(()=>applyUpgrade(root,plan),/injected staging failure/);assert.deepEqual(tree(root),before);
 }finally{fs.writeFileSync=originalWrite;}
 let fired=false;
 try {
  fs.renameSync=(from,to)=>{if(!fired&&String(from).includes('/new-')) {fired=true;throw Error('injected rename failure');}return originalRename(from,to);};
  assert.throws(()=>applyUpgrade(root,plan),/injected rename failure/);assert.equal(fired,true);assert.deepEqual(tree(root),before);
 }finally{fs.renameSync=originalRename;}
});

test('init-selected commands remain project-owned when the kit default also changes',t=>{
 const root=fresh(t),source=nextKit(t);config(root,c=>{c.agents.reviewer.command='node owner-review.mjs';});config(source.root,c=>{c.agents.reviewer.command='node new-default-review.mjs';});
 const before=tree(root),r=call(root,['--upgrade','--dry-run'],source.entry);assert.equal(r.status,0,r.stdout);assert.match(r.stdout,/agents.reviewer.command: preserve-owner-selection; kept project "node owner-review.mjs"; new kit default "node new-default-review.mjs"/);assert.deepEqual(tree(root),before);
 assert.equal(call(root,['--upgrade'],source.entry).status,0);assert.equal(loadConfig(root).agents.reviewer.command,'node owner-review.mjs');
});

test('merged defaults must pass the same local-path checks as a loaded project config',t=>{
 const root=fresh(t),source=nextKit(t);config(source.root,c=>{c.gates.graph='../outside.json';});
 const before=tree(root),r=call(root,['--upgrade'],source.entry);assert.equal(r.status,3,r.stdout);assert.match(r.stdout,/Invalid project-relative path/);assert.deepEqual(tree(root),before);
});

test('force reuse cannot label preserved unknown kit bytes as a fresh installation',t=>{
 const root=fresh(t);fs.unlinkSync(path.join(root,'kit.lock.json'));put(root,'tools/agents/agent-cli.mjs','old preserved kit');const before=tree(root);
 const r=call(root,['--force','--name','Reuse','--lang','en']);assert.equal(r.status,0,r.stdout);assert.equal(fs.existsSync(path.join(root,'kit.lock.json')),false);assert.deepEqual(tree(root),before);
});

test('an error cleaning a partially removed journal still restores the original project',async t=>{
 const root=fresh(t);put(root,'tools/agents/agent-cli.mjs','old wrapper');fs.chmodSync(path.join(root,'tools/agents/agent-cli.mjs'),0o600);
 const {planUpgrade,applyUpgrade}=await import('../kit-upgrade.mjs');const plan=planUpgrade(kit,root),before=tree(root),remove=fs.rmSync;let fired=false;
 try {
  fs.rmSync=(directory,options)=>{const result=remove(directory,options);if(!fired&&path.basename(String(directory)).startsWith('.kit-upgrade-')) {fired=true;throw Error('injected journal cleanup failure');}return result;};
  assert.throws(()=>applyUpgrade(root,plan),/injected journal cleanup failure/);assert.equal(fired,true);assert.deepEqual(tree(root),before);
 }finally{fs.rmSync=remove;}
});

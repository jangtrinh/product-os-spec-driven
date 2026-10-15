import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {planUpgrade,applyUpgrade,kitStatus,withUpgradeLock} from '../kit-upgrade.mjs';
import {loadConfig} from '../../lib/config/config-loader.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {editYaml} from '../../lib/config/yaml-in-place.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';

const kit=fileURLToPath(new URL('../../../',import.meta.url));
function temp(t) {const root=fs.mkdtempSync(path.join(os.tmpdir(),'upgrade-integrity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function call(root,flags=['--upgrade'],source=kit) {return spawnSync(process.execPath,[path.join(source,'tools/run/init.mjs'),'--project',root,...flags],{encoding:'utf8',timeout:60000});}
function fresh(t,source=kit,flags=['--name','PRODUCT:OS Spec Driven','--lang','vi','--writer','manual','--reviewer','manual']) {const root=temp(t),r=call(root,flags,source);assert.equal(r.status,0,r.stdout+r.stderr);return root;}
function source(t) {const root=temp(t);fs.cpSync(kit,root,{recursive:true,filter:p=>!p.includes('/.git')&&!p.includes('/node_modules')});return root;}
function put(root,file,bytes) {fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);}
function editLock(root,change) {const lock=JSON.parse(fs.readFileSync(path.join(root,'kit.lock.json')));change(lock);put(root,'kit.lock.json',canonical(lock)+'\n');}
function config(root,change) {const c=loadConfig(root);change(c);put(root,'config/pipeline.yaml',editYaml(fs.readFileSync(path.join(root,'config/pipeline.yaml'),'utf8'),c));}
function tree(root) {const entries=[];function walk(rel='') {for(const e of fs.readdirSync(path.join(root,rel),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {const f=rel?`${rel}/${e.name}`:e.name,p=path.join(root,f),s=fs.lstatSync(p);entries.push([f,s.mode,e.isDirectory()?null:e.isSymbolicLink()?fs.readlinkSync(p):sha256(fs.readFileSync(p))]);if(e.isDirectory())walk(f);}}walk();return canonical(entries);}

for(const [shipped,owned] of [['tools/alias-probe.txt','tools/ALIAS-PROBE.txt'],['tools/café.txt','tools/cafe\u0301.txt'],['tools/alias-folder/file.txt','tools/ALIAS-FOLDER/file.txt']])test(`upgrade preserves unknown path alias ${owned}`,t=>{
 const root=fresh(t),next=source(t);put(next,shipped,'kit bytes');put(root,owned,'owner bytes');
 const before=tree(root),dry=call(root,['--upgrade','--dry-run'],next);assert.equal(dry.status,0,dry.stdout);assert.equal(tree(root),before);
 const plan=planUpgrade(next,root);assert.ok(plan.rows.some(r=>r.startsWith('keep '+shipped)));assert.ok(!plan.operations.some(o=>o.file===shipped));
 const r=call(root,['--upgrade'],next);assert.equal(r.status,0,r.stdout);assert.equal(fs.readFileSync(path.join(root,owned),'utf8'),'owner bytes');
 assert.equal(call(root,['--upgrade'],next).status,0);assert.equal(fs.readFileSync(path.join(root,owned),'utf8'),'owner bytes');
 assert.notEqual(kitStatus(root,next),'current');
});

test('an overlapping upgrade fails fast naming the active holder; outer bytes and rollback stay coherent',t=>{
 const root=fresh(t),a=source(t),b=source(t);put(a,'templates/us.md','KIT A');put(b,'tools/agents/agent-cli.mjs','KIT B');
 let second;applyUpgrade(root,planUpgrade(a,root),{afterMutation:(op,index)=>{if(index===0)second=call(root,['--upgrade'],b);}});
 assert.equal(second.status,3,second.stdout);assert.match(second.stdout,/holder.*pid.*start/i);
 assert.deepEqual(fs.readFileSync(path.join(root,'templates/us.md')),fs.readFileSync(path.join(a,'templates/us.md')));
 assert.deepEqual(fs.readFileSync(path.join(root,'tools/agents/agent-cli.mjs')),fs.readFileSync(path.join(a,'tools/agents/agent-cli.mjs')));
 const before=tree(root);assert.throws(()=>applyUpgrade(root,planUpgrade(b,root),{afterMutation:(op,index)=>{if(index===0){second=call(root,['--upgrade'],a);throw Error('injected outer failure');}}}),/injected outer failure/);
 assert.equal(second.status,3,second.stdout);assert.equal(tree(root),before);
});

test('an exited upgrade holder refuses without writes until the lock is manually deleted',t=>{
 const root=fresh(t),dead=spawnSync(process.execPath,['-e',''],{encoding:'utf8'});assert.equal(dead.status,0);
 const lock={pid:dead.pid,startTime:'exited holder',acquiredAt:'2026-01-01T00:00:00Z'};put(root,'.kit-upgrade.lock',canonical(lock)+'\n');
 const file=path.join(root,'.kit-upgrade.lock'),bytes=fs.readFileSync(file),before=tree(root),r=call(root);
 assert.equal(r.status,3,r.stdout);assert.equal(r.stdout.trim().split('\n').length,1);
 assert.ok(r.stdout.includes(`pid ${dead.pid}, start exited holder`));assert.match(r.stdout,/looks exited/i);
 assert.ok(r.stdout.includes(`confirm that process has exited, then delete ${fs.realpathSync(file)} and rerun`),r.stdout);
 assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(tree(root),before);
 fs.unlinkSync(file);put(root,'templates/us.md','old bytes');
 const upgraded=call(root);assert.equal(upgraded.status,0,upgraded.stdout);
 assert.deepEqual(fs.readFileSync(path.join(root,'templates/us.md')),fs.readFileSync(path.join(kit,'templates/us.md')));
 assert.ok(!fs.existsSync(file));
});

test('a live upgrade holder refuses naming its holder and manual step without writes',t=>{
 const root=fresh(t),start=spawnSync('ps',['-p',String(process.pid),'-o','lstart='],{encoding:'utf8'});assert.equal(start.status,0);
 const file=path.join(root,'.kit-upgrade.lock');put(root,'.kit-upgrade.lock',canonical({pid:process.pid,startTime:start.stdout.trim()})+'\n');
 const bytes=fs.readFileSync(file),before=tree(root),r=call(root);
 assert.equal(r.status,3,r.stdout);assert.equal(r.stdout.trim().split('\n').length,1);
 assert.ok(r.stdout.includes(`pid ${process.pid}, start ${start.stdout.trim()}`));assert.match(r.stdout,/looks live/i);
 assert.ok(r.stdout.includes(`confirm that process has exited, then delete ${fs.realpathSync(file)} and rerun`),r.stdout);
 assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(tree(root),before);
});

test('the removed stale-lock recovery flag is an unknown option without writes',t=>{
 const root=fresh(t),before=tree(root),r=call(root,['--upgrade','--break-stale-lock']);
 assert.equal(r.status,3,r.stdout);assert.match(r.stdout,/Unknown or missing option --break-stale-lock/);assert.equal(tree(root),before);
});

test('a plan cannot write after another transaction changes the tree',t=>{
 const root=fresh(t),next=source(t);put(next,'templates/us.md','next');const plan=planUpgrade(next,root);
 put(root,'review/log/owner.txt','new owner record');const before=tree(root);
 assert.throws(()=>applyUpgrade(root,plan),/stale.*project changed/i);assert.equal(tree(root),before);
});

test('a failed lock-record write removes its partial exclusive file before returning',t=>{
 const root=fresh(t),before=tree(root),write=fs.writeFileSync;let injected=false;
 try {
  fs.writeFileSync=(file,...args)=>{
   const isLock=typeof file==='number'||String(file).endsWith('.kit-upgrade.lock');
   if(isLock&&!injected) {injected=true;write(file,'partial holder',args[1]);throw Object.assign(Error('injected lock ENOSPC'),{code:'ENOSPC'});}
   return write(file,...args);
  };
  assert.throws(()=>withUpgradeLock(root,()=>assert.fail('must not plan')),/injected lock ENOSPC/);
 }finally{fs.writeFileSync=write;}
 assert.equal(injected,true);assert.equal(tree(root),before);
});

test('empty and forged lock inventories cannot certify current or remove owner files',t=>{
 const root=fresh(t);editLock(root,l=>l.files={});put(root,'tools/agents/agent-cli.mjs','stale bytes');assert.match(kitStatus(root),/drift|unknown/);
 assert.equal(call(root).status,0);put(root,'tools/private-project.mjs','owner bytes');editLock(root,l=>l.files['tools/private-project.mjs']=sha256('owner bytes'));
 assert.match(kitStatus(root),/drift|unknown/);const r=call(root);assert.equal(r.status,0,r.stdout);
 assert.ok(!r.stdout.includes('remove tools/private-project.mjs'));assert.equal(fs.readFileSync(path.join(root,'tools/private-project.mjs'),'utf8'),'owner bytes');
});

test('a recomputed checksum cannot add an unshipped file to the installation manifest',t=>{
 const root=fresh(t);put(root,'tools/private-project.mjs','owner bytes');editLock(root,l=>{
  l.files['tools/private-project.mjs']=sha256('owner bytes');
  l.inventoryHash=sha256(canonical({kitVersion:l.kitVersion,kitCommit:l.kitCommit,files:l.files,shippedFiles:l.shippedFiles,configDefaults:l.configDefaults,ownerSelections:l.ownerSelections}));
 });assert.match(kitStatus(root),/drift|unknown/);assert.equal(call(root).status,0);assert.equal(fs.readFileSync(path.join(root,'tools/private-project.mjs'),'utf8'),'owner bytes');
});

test('a never-selected default changed on both sides refuses dry-run naming the key without writes',t=>{
 const root=fresh(t),next=source(t);config(root,c=>c.limits.max_fix_rounds=4);config(next,c=>c.limits.max_fix_rounds=5);
 const before=tree(root),r=call(root,['--upgrade','--dry-run'],next);assert.equal(r.status,3,r.stdout);assert.match(r.stdout,/conflict.*limits.max_fix_rounds/i);assert.equal(tree(root),before);
});

test('current requires every current shipped file even if its entry is missing from the lock',t=>{
 const root=fresh(t);editLock(root,l=>delete l.files['templates/us.md']);fs.unlinkSync(path.join(root,'templates/us.md'));
 assert.match(kitStatus(root),/drift|unknown/);assert.equal(call(root).status,0);assert.equal(kitStatus(root),'current');
 put(root,'kit.lock.json','{');assert.match(kitStatus(root),/unknown/);const before=tree(root);assert.equal(call(root).status,3);assert.equal(tree(root),before);
});

for(const flags of [['--writer','manual','--reviewer','manual'],['--agent','manual']])test(`init choices equal defaults stay owned with ${flags[0]}`,t=>{
 const root=fresh(t,kit,['--name','PRODUCT:OS Spec Driven','--lang','vi',...flags]),next=source(t);
 config(next,c=>{c.project.name='New kit default';c.project.doc_language='en';c.agents.writer.command='node new-default-writer.mjs';c.agents.reviewer.command='node new-default-reviewer.mjs';c.limits.max_fix_rounds=5;});
 const before=loadConfig(root),r=call(root,['--upgrade'],next);assert.equal(r.status,0,r.stdout);const after=loadConfig(root);
 assert.equal(after.project.name,before.project.name);assert.equal(after.project.doc_language,before.project.doc_language);assert.deepEqual(after.agents,before.agents);assert.equal(after.limits.max_fix_rounds,5);
 const lock=JSON.parse(fs.readFileSync(path.join(root,'kit.lock.json')));assert.deepEqual(lock.ownerSelections,['project.name','project.doc_language','agents.writer.command','agents.reviewer.command']);
});

test('older capable kit refuses newer installation and edited newer version without any write',t=>{
 const kitVersion=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../package.json',import.meta.url)))).version;
 const next=source(t);put(next,'tools/version-probe.txt','newer');const pkg=JSON.parse(fs.readFileSync(path.join(next,'tools/package.json')));pkg.version='3.0.0';put(next,'tools/package.json',canonical(pkg));
 const root=fresh(t,next),before=tree(root);let r=call(root);assert.equal(r.status,3,r.stdout);assert.match(r.stdout,new RegExp(`downgrade.*recorded 3\\.0\\.0.*source ${kitVersion.replaceAll('.','\\.')}`,'i'));assert.equal(tree(root),before);
 const edited=fresh(t);editLock(edited,l=>l.kitVersion='99.0.0');const editedBefore=tree(edited);r=call(edited);assert.equal(r.status,3,r.stdout);assert.match(r.stdout,new RegExp(`downgrade.*99\\.0\\.0.*${kitVersion.replaceAll('.','\\.')}`));assert.equal(tree(edited),editedBefore);
});

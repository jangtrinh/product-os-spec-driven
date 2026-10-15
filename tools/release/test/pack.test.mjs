import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const source=fileURLToPath(new URL('../../../',import.meta.url));
const require=createRequire(import.meta.url);
const docs=['README.md','CHANGELOG.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','LICENSE','llms.txt','PRIVACY.md','SECURITY.md','docs/cookbook.md','docs/po-quickstart.md','docs/known-limits.md','docs/architecture.md','docs/context-guide.md'];
const kitPaths=['SPEC.md','CHANGELOG.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','LICENSE','llms.txt','PRIVACY.md','SECURITY.md','commands/','format/','templates/','rules/','prompts/','tools/','config/','skills/','scripts/','.claude-plugin/','.codex-plugin/','.factory-plugin/','evals/'];
let temp,repo;
const call=(cmd,args,cwd=repo,env=process.env)=>spawnSync(cmd,args,{cwd,env,encoding:'utf8',maxBuffer:100*1024*1024,timeout:180000});
function ok(result) {assert.equal(result.status,0,result.stdout+result.stderr+String(result.error??''));return result;}
function put(file,text) {fs.mkdirSync(path.dirname(path.join(repo,file)),{recursive:true});fs.writeFileSync(path.join(repo,file),text);}
function commit() {ok(call('git',['add','-A']));ok(call('git',['-c','user.name=Release Test','-c','user.email=release@example.test','commit','-qm','test: release inputs']));return ok(call('git',['rev-parse','HEAD'])).stdout.trim();}
function pack(name) {
 const out=path.join(temp,name);const result=ok(call(process.execPath,[path.join(repo,'tools/release/pack.mjs'),'--out',out]));
 const archive=fs.readdirSync(out).find(file=>file.endsWith('.tar.gz'));assert.ok(archive,result.stdout);
 return {out,archive:path.join(out,archive),result};
}
function extract(bundle,name) {const root=path.join(temp,name);fs.mkdirSync(root);ok(call('tar',['-xzf',bundle.archive,'-C',root]));assert.equal(fs.existsSync(path.join(root,'.git')),false);return root;}
function init(kit,project,...flags) {return call(process.execPath,[path.join(kit,'tools/run/init.mjs'),'--project',project,...flags],kit);}
function tree(root) {
 const result={};
 function walk(dir='') {for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) {
  const file=dir?`${dir}/${entry.name}`:entry.name;
  if(entry.isDirectory())walk(file);else result[file]=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 }}walk();return result;
}
before(()=>{
 temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'kit-release-')));repo=path.join(temp,'repo');fs.mkdirSync(repo);
 for(const file of [...kitPaths,'fixtures/'])fs.cpSync(path.join(source,file),path.join(repo,file),{recursive:true,filter:file=>!file.split(path.sep).some(part=>['node_modules','.git'].includes(part))});
 for(const file of docs)put(file,`# Release test stub: ${file}\n`);
 for(const file of ['.brv/private.txt','AGENTS.md','plans/private.txt','reference/private.txt','examples/private.txt','context/private.txt','evals/results/private.txt','format/evidence/private.txt','tools/lint/evidence/private.txt','tools/migrate/evidence/private.txt','tools/node_modules/private.txt'])put(file,'excluded\n');
 ok(call('git',['init','-q']));commit();put('tools/untracked.txt','must never ship\n');
});
after(()=>fs.rmSync(temp,{recursive:true,force:true}));

test('pack ships committed kit paths and docs with metadata, checksum and runtime fixtures under 50 MB',()=>{
 const bundle=pack('first'),listing=ok(call('tar',['-tzf',bundle.archive])).stdout.split('\n').map(file=>file.replace(/^\.\//,''));
 assert.ok(fs.statSync(bundle.archive).size<50*1024*1024);
 for(const prefix of [...kitPaths,...docs,'kit-release.json','fixtures/runner/census-graph.mjs'])assert.ok(listing.some(file=>file===prefix||file.startsWith(prefix)),prefix);
 assert.equal(listing.some(file=>/^(\.brv|plans|reference|examples|context|\.git)\//.test(file)||file==='AGENTS.md'||file.includes('/node_modules/')||/^(format|tools\/lint|tools\/migrate)\/evidence\//.test(file)||file.startsWith('evals/results/')||file==='tools/untracked.txt'),false);
 for(const file of ['LICENSE','SECURITY.md','PRIVACY.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','CHANGELOG.md','llms.txt','docs/cookbook.md','commands/doctor.md','prompts/doctor.md','scripts/self_check.py','.codex-plugin/plugin.json','.factory-plugin/plugin.json','.factory-plugin/marketplace.json'])assert.ok(listing.includes(file),file);
 const checksum=createHash('sha256').update(fs.readFileSync(bundle.archive)).digest('hex');
 assert.equal(fs.readFileSync(path.join(bundle.out,'SHA256SUMS'),'utf8'),`${checksum}  ${path.basename(bundle.archive)}\n`);
 const kit=extract(bundle,'first-kit'),metadata=JSON.parse(fs.readFileSync(path.join(kit,'kit-release.json')));
 assert.equal(metadata.version,JSON.parse(fs.readFileSync(path.join(repo,'tools/package.json'))).version);
 assert.equal(metadata.commit,ok(call('git',['rev-parse','HEAD'])).stdout.trim());assert.ok(Number.isFinite(Date.parse(metadata.builtAt)));
 assert.equal(path.basename(bundle.archive),`spec-driven-kit-${metadata.version}-${metadata.commit.slice(0,7)}.tar.gz`);
 const project=path.join(temp,'first-project');ok(init(kit,project,'--name','t','--lang','vi','--writer','codex','--reviewer','grok'));
 const lock=JSON.parse(fs.readFileSync(path.join(project,'kit.lock.json')));assert.equal(lock.kitVersion,metadata.version);assert.equal(lock.kitCommit,metadata.commit);
 const bin=path.join(temp,'bin');fs.mkdirSync(bin);for(const cli of ['codex','grok']) {fs.writeFileSync(path.join(bin,cli),'#!/bin/sh\nexit 99\n',{mode:0o755});}
 const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,SPEC_AJV_MODULE:process.env.SPEC_AJV_MODULE??require.resolve('ajv/dist/2020')};
 const doctor=path.join(kit,'tools/run/doctor.mjs');ok(call(process.execPath,[doctor],kit,env));
 const status=ok(call(process.execPath,[doctor,'--project',project],kit,env));assert.match(status.stdout,/PASS kit: current/);
 const selfTest=ok(call(process.execPath,[path.join(kit,'tools/lint/lint.mjs'),'--self-test'],kit));assert.match(selfTest.stdout,/lint self-test OK/);
 const lint=call(process.execPath,[path.join(kit,'tools/lint/lint.mjs'),path.join(project,'spec'),'--json'],kit);assert.equal(lint.status,2,lint.stdout+lint.stderr);assert.ok(JSON.parse(lint.stdout).problems.some(problem=>problem.code==='E-INPUT'));
 ok(call(process.execPath,['--input-type=module','-e',"await import('./tools/evals/run-case.mjs')"],kit));
});

test('release packers never ship development records or private roots',()=>{
 const forbidden=/^(?:\.brv(?:\/|$)|AGENTS\.md$|reference(?:\/|$)|plans(?:\/|$)|evals\/results\/|(?:format|tools\/lint|tools\/migrate)\/evidence\/)/;
 // A project's review/evidence/ path is kit content (stage-replay payloads), not a dev record.
 const projectEvidence='fixtures/runner/stage-replay/payloads/tdd/review/evidence/tdd.json';
 const release=pack('forbidden-release');
 const releaseListing=ok(call('tar',['-tzf',release.archive])).stdout.split('\n').map(file=>file.replace(/^\.\//,''));
 assert.equal(releaseListing.some(file=>forbidden.test(file)),false);
 assert.ok(releaseListing.includes(projectEvidence),projectEvidence);
 const plugin=path.join(temp,'forbidden-plugin');
 ok(call(process.execPath,[path.join(repo,'scripts/pack-plugin.mjs'),'--out',plugin]));
 const pluginFiles=Object.keys(tree(plugin));
 assert.equal(pluginFiles.some(file=>forbidden.test(file)),false);
 assert.ok(pluginFiles.includes(projectEvidence),projectEvidence);
});

test('older extracted bundle upgrades to a newer version without git, dry run preserves every byte',()=>{
 const oldKit=extract(pack('old'),'old-kit'),project=path.join(temp,'upgrade-project');ok(init(oldKit,project,'--name','t','--lang','vi','--writer','codex','--reviewer','grok'));
 const pkg=JSON.parse(fs.readFileSync(path.join(repo,'tools/package.json')));const next=pkg.version.split('.').map(Number);next[2]++;pkg.version=next.join('.');put('tools/package.json',JSON.stringify(pkg));
 put('templates/us.md',fs.readFileSync(path.join(repo,'templates/us.md'),'utf8')+'\n');const commitId=commit();
 const kit=extract(pack('new'),'new-kit'),before=tree(project);
 const dry=ok(init(kit,project,'--upgrade','--dry-run'));assert.match(dry.stdout,/Dry run/);assert.deepEqual(tree(project),before);
 ok(init(kit,project,'--upgrade'));const lock=JSON.parse(fs.readFileSync(path.join(project,'kit.lock.json')));assert.equal(lock.kitVersion,pkg.version);assert.equal(lock.kitCommit,commitId);
 assert.equal(fs.readFileSync(path.join(project,'templates/us.md'),'utf8'),fs.readFileSync(path.join(kit,'templates/us.md'),'utf8'));
 const reverse=init(oldKit,project,'--upgrade');assert.equal(reverse.status,3);assert.match(reverse.stdout,/downgrade/);
});

test('tracked edits, staged changes and deletion refuse with exit 3 before any output is written',()=>{
 const file='templates/us.md',bytes=fs.readFileSync(path.join(repo,file));
 for(const kind of ['edit','stage','delete']) {
  if(kind==='delete')fs.unlinkSync(path.join(repo,file));else put(file,'dirty\n');
  if(kind==='stage')ok(call('git',['add',file]));
  const out=path.join(temp,`dirty-${kind}`),result=call(process.execPath,[path.join(repo,'tools/release/pack.mjs'),'--out',out]);
  assert.equal(result.status,3,result.stdout+result.stderr);assert.match(result.stdout+result.stderr,/tracked|dirty/i);assert.equal(fs.existsSync(out),false);
  ok(call('git',['reset','--quiet','HEAD','--',file]));fs.writeFileSync(path.join(repo,file),bytes);
 }
});

test('missing optional docs warn and a clean committed kit still packs',()=>{
 for(const file of docs)fs.unlinkSync(path.join(repo,file));commit();
 const bundle=pack('missing-docs');for(const file of docs)assert.ok((bundle.result.stdout+bundle.result.stderr).includes(file));
 const listing=ok(call('tar',['-tzf',bundle.archive])).stdout;assert.match(listing,/kit-release.json/);
});

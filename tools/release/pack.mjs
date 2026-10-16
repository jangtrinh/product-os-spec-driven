#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {kitIdentity} from '../lib/kit-version.mjs';

const kit=fileURLToPath(new URL('../../',import.meta.url));
const docs=['README.md','docs/po-guide.md','CHANGELOG.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','LICENSE','llms.txt','PRIVACY.md','SECURITY.md','docs/cookbook.md','docs/feedback.md','docs/po-quickstart.md','docs/known-limits.md','docs/architecture.md','docs/context-guide.md'];
const kitPaths=['README.md','SPEC.md','CHANGELOG.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','LICENSE','llms.txt','PRIVACY.md','SECURITY.md','commands/','docs/','config/','format/','prompts/','rules/','templates/','tools/','skills/','scripts/','.claude-plugin/','.codex-plugin/','.factory-plugin/','fixtures/','evals/'];
const requiredPaths=['SPEC.md','config/','format/','prompts/','rules/','templates/','tools/','skills/','scripts/','.claude-plugin/','fixtures/','evals/'];
// Dev-run records never ship; a project's own review/evidence/ path is kit content and stays.
const devRecords=['evals/results/','evals/promoted/','format/evidence/','tools/lint/evidence/','tools/migrate/evidence/'];
const excluded=file=>file==='AGENTS.md'||devRecords.some(prefix=>file.startsWith(prefix))||file.split('/').some(part=>['node_modules','.git','.brv'].includes(part));
const allowed=file=>kitPaths.some(prefix=>prefix.endsWith('/')?file.startsWith(prefix):file===prefix);
function command(name,args,options={}) {
 const result=spawnSync(name,args,{cwd:kit,encoding:'utf8',maxBuffer:32*1024*1024,...options});
 if(result.error||result.status!==0)throw new Error(`${name} failed: ${result.error?.message??result.stderr?.trim()??result.status}`);
 return result.stdout;
}
export function pack(argv=process.argv.slice(2),print=console.log,warn=console.error) {
 let staging;
 try {
  if(argv.length===1&&argv[0]==='--help') {print('pack --out <dir>: committed kit-only tar.gz plus SHA256SUMS; tracked changes refuse with exit 3. Requires git and tar.');return 0;}
  if(argv.length!==2||argv[0]!=='--out'||!argv[1]?.trim()||argv[1].startsWith('--'))throw new Error('Use pack --out <dir>');
  if(!fs.existsSync(path.join(kit,'.git')))throw new Error('Packing requires a Git kit checkout');
  const dirty=spawnSync('git',['diff','--quiet','HEAD','--'],{cwd:kit});
  if(dirty.status!==0)throw new Error('Refusing pack: tracked files differ from HEAD; commit or restore changes first');
  const {version,commit}=kitIdentity(kit);
  if(!commit)throw new Error('Packing requires a committed Git kit checkout');
  const committed=command('git',['ls-tree','-r','--name-only','-z',commit]).split('\0').filter(Boolean);
  const files=committed.filter(file=>!excluded(file)&&allowed(file));
  for(const file of docs)if(!files.includes(file))warn(`WARN missing release doc: ${file}`);
  for(const prefix of requiredPaths)if(!files.some(file=>prefix.endsWith('/')?file.startsWith(prefix):file===prefix))throw new Error(`Missing kit content: ${prefix}`);
  staging=fs.mkdtempSync(path.join(os.tmpdir(),'kit-pack-'));
  const tree=path.join(staging,'tree');fs.mkdirSync(tree);
  const snapshot=path.join(staging,'snapshot.tar');
  command('git',['archive','--format=tar',`--output=${snapshot}`,commit,'--',...files]);
  command('tar',['-xf',snapshot,'-C',tree]);
  fs.writeFileSync(path.join(tree,'kit-release.json'),JSON.stringify({version,commit,builtAt:new Date().toISOString()},null,2)+'\n');
  const name=`spec-driven-kit-${version}-${commit.slice(0,7)}.tar.gz`,archive=path.join(staging,name);
  command('tar',['-czf',archive,'-C',tree,'.']);
  const digest=createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  const out=path.resolve(argv[1]);fs.mkdirSync(out,{recursive:true});
  fs.copyFileSync(archive,path.join(out,name));fs.writeFileSync(path.join(out,'SHA256SUMS'),`${digest}  ${name}\n`);
  print(`${path.join(out,name)} (${fs.statSync(archive).size} bytes)`);print(path.join(out,'SHA256SUMS'));return 0;
 }catch(error) {warn(error.message);return 3;}
 finally {if(staging)fs.rmSync(staging,{recursive:true,force:true});}
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fs.realpathSync(fileURLToPath(import.meta.url)))process.exitCode=pack();

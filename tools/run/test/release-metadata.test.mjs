import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {kitContentPaths} from '../../lib/kit-content-paths.mjs';

const kit=fileURLToPath(new URL('../../../',import.meta.url));
test('init outside git records the release commit rather than an enclosing repository',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'release-metadata-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const source=path.join(temp,'kit'),project=path.join(temp,'project');fs.mkdirSync(source);
 const archive=spawnSync('git',['archive','HEAD','SPEC.md','format','templates','rules','prompts','tools','config/pipeline.yaml','evals'],{cwd:kit,maxBuffer:100*1024*1024});
 assert.equal(archive.status,0);
 assert.equal(spawnSync('tar',['-x','-C',source],{input:archive.stdout}).status,0);
 for(const file of kitContentPaths)fs.cpSync(path.join(kit,file),path.join(source,file),{recursive:true,filter:file=>!file.split(path.sep).includes('node_modules')});
 const metadata={version:JSON.parse(fs.readFileSync(path.join(source,'tools/package.json'))).version,commit:'a'.repeat(40),builtAt:new Date().toISOString()};
 fs.writeFileSync(path.join(source,'kit-release.json'),JSON.stringify(metadata));
 const git=(...args)=>spawnSync('git',args,{cwd:temp,encoding:'utf8'});
 assert.equal(git('init','-q').status,0);
 assert.equal(git('-c','user.name=Release Test','-c','user.email=release@example.test','commit','--allow-empty','-qm','test: enclosing repository').status,0);
 const result=spawnSync(process.execPath,[path.join(source,'tools/run/init.mjs'),'--project',project,'--name','t','--lang','vi','--writer','codex','--reviewer','grok'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
 const lock=JSON.parse(fs.readFileSync(path.join(project,'kit.lock.json')));
 assert.equal(lock.kitVersion,metadata.version);assert.equal(lock.kitCommit,metadata.commit);
});

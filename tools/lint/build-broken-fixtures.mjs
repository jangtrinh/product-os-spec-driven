#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../lib/digests.mjs';
import { CONTROLS,EXAMPLE,plant } from './self-test.mjs';
const out=fileURLToPath(new URL('../../fixtures/v2/broken/',import.meta.url));
fs.mkdirSync(out,{recursive:true});
function files(root,rel='') {return fs.readdirSync(path.join(root,rel),{withFileTypes:true}).flatMap(e=>{const p=rel?rel+'/'+e.name:e.name;return e.isDirectory()?files(root,p):[p];});}
const base=files(EXAMPLE),read=(root,file)=>fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file)):null;
const entries=[];
for(const [index,[code,mutate,severity='error']] of CONTROLS.entries()) {
  const seeded=plant(mutate);
  try {
    const changes=[];
    for(const file of [...new Set([...base,...files(seeded.root)])].sort()) {
      if(file.startsWith('tests/schemas/') || fs.existsSync(path.join(seeded.root,file)) && fs.lstatSync(path.join(seeded.root,file)).isSymbolicLink())continue;
      const before=read(EXAMPLE,file),after=read(seeded.root,file);
      if((before?.equals(after || Buffer.alloc(0))) || !before && !after)continue;
      changes.push({path:file,before:before?hash(before):null,after:after?after.toString('base64'):null});
    }
    const escape=path.join(seeded.root,'tests/escape.txt');
    const fault=code==='E-SCHEMA'?'missing-schema':code==='E-RULE'?'thrown-rule':fs.existsSync(escape) && fs.lstatSync(escape).isSymbolicLink()?'symlink-escape':null;
    const name=`${String(index+1).padStart(3,'0')}-${code.toLowerCase()}.json`;
    fs.writeFileSync(path.join(out,name),JSON.stringify({code,severity,fault,...seeded.options.stage?{checkpoint:seeded.options.stage}:{},changes},null,2)+'\n');entries.push(name);
  }finally{seeded.cleanup();}
}
fs.writeFileSync(path.join(out,'cli-option.json'),JSON.stringify({code:'E-OPTION',args:['--lenient','--json'],exit:2},null,2)+'\n');
fs.writeFileSync(path.join(out,'index.json'),JSON.stringify({version:1,entries,cli:'cli-option.json'},null,2)+'\n');
const keep=new Set([...entries,'cli-option.json','index.json']);
for(const name of fs.readdirSync(out))if(!keep.has(name)){const old=JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));if(!old.code || !Array.isArray(old.changes))throw new Error(`unowned broken fixture: ${name}`);fs.rmSync(path.join(out,name));}
console.log(`wrote ${entries.length+1} broken fixture controls`);

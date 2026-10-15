import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash } from '../lib/digests.mjs';
const directory=fileURLToPath(new URL('../../fixtures/v2/broken/',import.meta.url));
export function recordedControl(index,t) {
  const list=JSON.parse(fs.readFileSync(path.join(directory,'index.json'),'utf8'));
  const record=JSON.parse(fs.readFileSync(path.join(directory,list.entries[index]),'utf8'));
  for(const c of record.changes) {
    const file=path.join(t.root,c.path),bytes=fs.existsSync(file)?fs.readFileSync(file):null;
    if((bytes?hash(bytes):null)!==c.before)throw new Error(`broken fixture is stale: ${c.path}`);
    if(c.after===null)t.remove(c.path);else {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(c.after,'base64'));}
  }
  if(record.fault==='missing-schema') {const folder=path.join(t.root,'tests/schemas');fs.cpSync(fileURLToPath(new URL('../../format/schema/',import.meta.url)),folder,{recursive:true});fs.rmSync(path.join(folder,'manifest.schema.json'));t.options.schemaDir=folder;}
  if(record.fault==='thrown-rule')t.options.rules={planted:()=>{throw new Error('seeded exception');}};
  if(record.fault==='symlink-escape'){fs.mkdirSync(path.join(t.root,'tests'),{recursive:true});fs.symlinkSync('/etc/hosts',path.join(t.root,'tests/escape.txt'));}
  if(record.checkpoint)t.options.stage=record.checkpoint;
  return record;
}
export function cliControl(){return JSON.parse(fs.readFileSync(path.join(directory,'cli-option.json'),'utf8'));}

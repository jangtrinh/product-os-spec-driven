import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const json=value=>JSON.stringify(value,null,2)+'\n';
export function inventory(root){
 const files=[];
 function walk(rel=''){for(const name of fs.readdirSync(path.join(root,rel)).sort()){
  if(['.git','node_modules'].includes(name))throw Error(`unsupported input directory ${name}`);
  const file=rel?`${rel}/${name}`:name,stat=fs.lstatSync(path.join(root,file));
  if(stat.isSymbolicLink())throw Error(`input symlinks are refused: ${file}`);
  if(stat.isDirectory())walk(file);else if(stat.isFile())files.push({file,bytes:fs.readFileSync(path.join(root,file))});else throw Error(`unsupported input file: ${file}`);
 }}walk();return files;
}
export const treeHash=files=>sha256(files.map(x=>`${x.file}\0${x.bytes.length}\0${sha256(x.bytes)}\n`).join(''));
export function boundary(source,output){
 const input=fs.realpathSync(source),out=path.resolve(output);
 let parent=out;while(!fs.existsSync(parent))parent=path.dirname(parent);
 const real=path.join(fs.realpathSync(parent),path.relative(parent,out));
 if(real===input || real.startsWith(input+path.sep) || input.startsWith(real+path.sep))throw Error('input and output trees must not overlap');
 if(fs.existsSync(out)&&(fs.lstatSync(out).isSymbolicLink() || !fs.statSync(out).isDirectory() || fs.readdirSync(out).length))throw Error('output must be absent or an empty real directory');
 return {input,out};
}
export function write(root,rel,bytes){const target=path.join(root,rel);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
export const snapshotPath=rel=>`provenance/input-snapshot/${rel}${/\.(md|html|json|css|ts|js|mjs)$/i.test(rel)?'.txt':'.bin'}`;

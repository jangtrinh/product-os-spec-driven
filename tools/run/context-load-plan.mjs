import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TextDecoder} from 'node:util';
import {RunnerError, isOsJunk, isPreparedContextText, TEXT_EXTENSIONS} from '../lib/config/path-selection.mjs';
import {pathCollisionKey} from '../lib/path-collision-key.mjs';
import {loadConfig} from '../lib/config/config-loader.mjs';
import {hasInstalledKitLock} from './kit-upgrade.mjs';
export const CONTEXT_CAPS=Object.freeze({file:65536,total:262144});
export {TEXT_EXTENSIONS};
const kit=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
const fold=file=>pathCollisionKey(file);
const inside=(parent,file)=>{const a=fold(parent),b=fold(file);return b===a||b.startsWith(a+path.sep);};
// A project that carries its own runner copy (`init` writes kit.lock.json) is the legitimate target of that copy.
// The source kit has no install lock, and a stub lock does not pass the upgrade's own lock validation.
// A real lock copied onto the source kit still matches its files, so the root must also hold the registries `init` created.
function initializedProject(root) {
 try{const config=loadConfig(root);return fs.existsSync(path.join(root,config.gates.graph))&&fs.existsSync(path.join(root,config.gates.definitions_dir));}catch{return false;}
}
function installedKitIsProject(root) {
 return fold(kit)===fold(root)&&hasInstalledKitLock(root)&&initializedProject(root);
}
export function noSymlinks(file) {
 const resolved=path.resolve(file);let current=path.parse(resolved).root;
 for(const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
  current=path.join(current,part);const stat=fs.lstatSync(current,{throwIfNoEntry:false});
  if(stat?.isSymbolicLink())throw new RunnerError(`Refusing symlink: ${current}; provide real exported files.`);
 }
 return resolved;
}
function advice(file) {
 return /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(file)?'describe the screen in a .md file — the writer prompt is text-only.':'export as .md / .html / .json UTF-8 text outside the kit; the PO prepares it.';
}
function utf8Refusal(file,bytes,refusals) {
 try {const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))refusals.push(`${file}: binary/control bytes; ${advice(file)}`);}
 catch {refusals.push(`${file}: invalid UTF-8; ${advice(file)}`);}
}
export function contextLoadPlan(project,kind,from) {
 const root=noSymlinks(project);if(!fs.statSync(root).isDirectory())throw new RunnerError('Project must be an existing real directory');
 if(inside(kit,root)&&!installedKitIsProject(root))throw new RunnerError('Project is inside the kit');
 const specRoot=fs.existsSync(path.join(root,'config/pipeline.yaml'))?loadConfig(root).project.spec_root:'spec';
 const target=path.join(root,'context',kind);const files=[],refusals=[],entries=new Map(),aliases=new Map();let total=0,stop=false;
 const reject=action=>{try{action();}catch(e){if(e instanceof RunnerError||e.code==='ENOENT'||e.code==='ENOTDIR')refusals.push(e.message);else throw e;}};
 const ownedRoots=[specRoot,'input','config'].map(name=>path.join(root,name));
 function metadataBlocked(file,size) {
  let blocked=false;
  if(isOsJunk(file)||!TEXT_EXTENSIONS.includes(path.extname(file).toLowerCase())){refusals.push(`${file}: unsupported format; ${advice(file)}`);blocked=true;}
  if(size>CONTEXT_CAPS.file){refusals.push(`${file}: ${size} bytes exceeds per-file cap ${CONTEXT_CAPS.file}; trim or split prepared excerpts.`);blocked=true;}
  return blocked;
 }
 function capBlocked(size) {
  if(total+size<=CONTEXT_CAPS.total)return false;
  refusals.push(`Total ${total+size} bytes exceeds kind cap ${CONTEXT_CAPS.total} (including existing files); trim prepared context.`);
  stop=true;return true;
 }
 function remember(key,relative,bytes) {
  entries.set(key,{relative,bytes});aliases.set(key,relative);total+=bytes.length;
 }
 function walk(file,visit,relative='') {
  if(stop)return;
  noSymlinks(file);const stat=fs.lstatSync(file);
  if(stat.isDirectory())for(const name of fs.readdirSync(file).sort()) {
   if(stop)break;
   if(name==='.git'||name==='node_modules')continue;
   reject(()=>walk(path.join(file,name),visit,relative?`${relative}/${name}`:name));
  } else if(stat.isFile())visit(file,relative||path.basename(file),stat.size);
  else refusals.push(`${file}: not a regular file; ${advice(file)}`);
 }
 reject(()=>{noSymlinks(target);if(fs.existsSync(target))walk(target,(file,relative,size)=>{
  if(stop||!isPreparedContextText(relative))return;
  if(size>CONTEXT_CAPS.file){refusals.push(`${file}: ${size} bytes exceeds per-file cap ${CONTEXT_CAPS.file}; trim or split prepared excerpts.`);return;}
  if(capBlocked(size))return;
  const bytes=fs.readFileSync(file);utf8Refusal(file,bytes,refusals);remember(pathCollisionKey(relative),relative,bytes);
 });});
 for(const source of from)reject(()=>{
  if(stop)return;
  const file=noSymlinks(source);
  if(inside(kit,file)||inside(file,kit))throw new RunnerError(`Refusing path inside the kit: ${file}`);
  for(const owned of ownedRoots)if(inside(owned,file))throw new RunnerError(`Refusing project spec/input/config source: ${file}`);
  if(inside(file,target)||inside(target,file))throw new RunnerError(`Source overlaps context destination: ${file}`);
  walk(file,(sourcePath,relative,size)=>{
   if(stop)return;
   if(relative.includes('\\')||relative.split('/').includes('..')||relative.split('/').some(part=>/^[a-z][a-z0-9+.-]*:/i.test(part)))throw new RunnerError(`Unsupported relative name: ${relative}`);
   const destination=`context/${kind}/${relative}`,absolute=path.join(root,destination);noSymlinks(absolute);
   let ancestor=path.dirname(absolute);while(ancestor!==root){if(fs.existsSync(ancestor)&&!fs.statSync(ancestor).isDirectory())refusals.push(`${destination}: destination ancestor is not a directory`);ancestor=path.dirname(ancestor);}
   if(fs.existsSync(absolute)&&!fs.statSync(absolute).isFile())refusals.push(`${destination}: destination is not a regular file`);
   if(metadataBlocked(sourcePath,size))return;
   const key=pathCollisionKey(relative),prior=entries.get(key);
   if(prior&&prior.bytes.length!==size){refusals.push(`${destination}: conflict — existing or selected file has different bytes; choose a new name outside the project.`);files.push({source:sourcePath,destination,bytes:size,action:'identical'});return;}
   if(!prior&&capBlocked(size))return;
   const bytes=fs.readFileSync(sourcePath);utf8Refusal(sourcePath,bytes,refusals);
   if(aliases.has(key)&&aliases.get(key)!==relative)refusals.push(`${destination}: path alias conflict with ${aliases.get(key)}`);
   if(prior&&!prior.bytes.equals(bytes))refusals.push(`${destination}: conflict — existing or selected file has different bytes; choose a new name outside the project.`);
   files.push({source:sourcePath,destination,bytes:bytes.length,action:prior?'identical':'copy'});
   if(!prior)remember(key,relative,bytes);
  });
 });
 for (const [key,entry] of entries) {
  const parts=key.split('/');
  for (let i=1;i<parts.length;i++) {const prior=entries.get(parts.slice(0,i).join('/'));if(prior)refusals.push(`${entry.relative}: file/directory conflict with ${prior.relative}`);}
 }
 if(!stop&&total>CONTEXT_CAPS.total)refusals.push(`Total ${total} bytes exceeds kind cap ${CONTEXT_CAPS.total} (including existing files); trim prepared context.`);
 return {root,kind,files,total_bytes:total,caps:CONTEXT_CAPS,refusals,entries};
}

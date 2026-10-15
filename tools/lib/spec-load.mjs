import fs from 'node:fs';
import path from 'node:path';
import { splitFrontMatter } from './front-matter.mjs';
import { parseJson } from './json-strict.mjs';
import { localPath } from './local-path.mjs';
export const IMAGE_EXT=/\.(png|jpe?g|gif|svg|webp)$/i;
export const posix=p=>p.split(path.sep).join('/');
export function loadSpec(root) {
  const abs=path.resolve(root);
  const out={root:abs,manifest:null,manifestError:null,inputError:null,docs:[],images:[],htmlBoards:[],files:[],epicMap:null,epicMapError:null,epicMapPath:null};
  try { if(!fs.statSync(abs).isDirectory()) throw new Error('input is not a directory'); fs.accessSync(abs,fs.constants.R_OK); }
  catch(e) { out.inputError=e.message;return out; }
  try { out.manifest=parseJson(fs.readFileSync(localPath(abs,'spec.manifest.json'),'utf8')); if(!out.manifest || typeof out.manifest !== 'object' || Array.isArray(out.manifest)) throw new Error('manifest must be an object'); }
  catch(e) { out.manifest=null;out.manifestError=e.message; }
  // F8 precedes discovery and every schema or document check.
  if(out.manifest?.format==='1') return out;
  const visits=new Set();
  function walk(rel='') {
    const directory=rel ? localPath(abs,rel) : abs;
    const real=fs.realpathSync(directory);
    if(visits.has(real)) throw new Error(`directory symlink cycle or alias: ${rel}`);
    visits.add(real);
    for(const name of fs.readdirSync(directory).sort()) {
      if(name==='node_modules' || name==='.git') continue;
      const r=rel ? `${rel}/${name}` : name, file=localPath(abs,r), stat=fs.statSync(file);
      if(stat.isDirectory()) {walk(r);continue;}
      if(!stat.isFile()) throw new Error(`unsupported file: ${r}`);
      fs.accessSync(file,fs.constants.R_OK);
      out.files.push(r);
      const tr=out.manifest?.tests_root;
      if(typeof tr==='string' && (r===tr || r.startsWith(tr+'/'))) continue;
      if(r.endsWith('.md')) {const raw=fs.readFileSync(file,'utf8');out.docs.push({rel:r,abs:file,raw,...splitFrontMatter(raw),folder:r.includes('/') ? r.split('/')[0] : '',stem:path.basename(r,'.md')});}
      else if(IMAGE_EXT.test(r)) out.images.push(r);
      else if(/(^|\/)wireframes\/html\/[^/]+\.html$/.test(r)) out.htmlBoards.push(r);
    }
    visits.delete(real);
  }
  try {walk();} catch(e) {out.inputError=e.message;}
  if(out.files.includes('readable/epic-map.json')) {
    out.epicMapPath='readable/epic-map.json';
    try {out.epicMap=parseJson(fs.readFileSync(localPath(abs,out.epicMapPath),'utf8'));}catch(e){out.epicMapError=e.message;}
  }
  return out;
}

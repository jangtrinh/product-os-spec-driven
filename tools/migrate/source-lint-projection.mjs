import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintSpec } from '../lint/index.mjs';
import { inventory,treeHash } from './tree-files.mjs';
import { loadDocuments,emitDocument,sourceLineMap } from './document-transform.mjs';
import { buildCrosswalk,rewriteLegacy,rewriteRecordIds } from './id-crosswalk.mjs';
import { transformScenarios } from './scenario-transform.mjs';
// Reproduce v2 rules from source bytes, never from output or supplied diagnostics.
// Only representation changes needed to inspect v1 scenarios/aliases are allowed.
// Table cells, headers, metadata and evidence paths retain their source meaning.
export function sourceLintProjection(source){
 const files=inventory(source),sourceHash=treeHash(files),root=fs.mkdtempSync(path.join(os.tmpdir(),'source-lint-'));
 try{
  for(const f of files){const file=path.join(root,f.file);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,f.bytes);}
  const manifestFile=path.join(root,'spec.manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));manifest.format='2';fs.writeFileSync(manifestFile,JSON.stringify(manifest));
  const docs=loadDocuments(files),report={blockers:[],fields:[],renames:[],absent:[],added_scenarios:[]},crosswalk=buildCrosswalk(docs,report,[],files),documents={};
  for(const d of docs){
   if(!d.data)continue;
   d.data=rewriteRecordIds(d.data,d.rel,crosswalk,report,'$',d);d.body=rewriteLegacy(d.body,d,crosswalk);
   const body=d.body;transformScenarios(d,report);d.body=body;
   const converted=emitDocument(d);fs.writeFileSync(path.join(root,d.rel),converted);
   documents[d.rel]={raw:d.raw,converted,map:sourceLineMap(d)};
  }
  for(const f of files.filter(f=>f.file.endsWith('.json')))documents[f.file]={raw:f.bytes.toString('utf8'),converted:fs.readFileSync(path.join(root,f.file),'utf8'),map:[1]};
  const result=lintSpec(root);
  if(treeHash(inventory(source))!==sourceHash)throw Error('source changed during lint reproduction');
  if(result.problems.errors.some(p=>p.code.startsWith('E-')))throw Error('source lint reproduction failed: '+JSON.stringify(result.problems.errors.filter(p=>p.code.startsWith('E-'))));
  return {source_sha256:sourceHash,normalization:'manifest-format-2; source-derived scenario objects and canonical aliases; source body cells unchanged',problems:result.problems.list,documents};
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}

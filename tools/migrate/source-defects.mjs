#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { splitFrontMatter } from '../lib/front-matter.mjs';
import { expandScenarios } from '../lib/structure.mjs';
import { sourceLintProjection } from './source-lint-projection.mjs';
import { lintSpec } from '../lint/index.mjs';
import { diagnosticScope } from './diagnostic-occurrences.mjs';
import { diagnosticLines } from './diagnostic-locations.mjs';
export function traceDefects(source,out,baselineFile){
 const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
 const report=read(path.join(out,'migration-report.json')),lint={problems:lintSpec(out).problems.list},baseline=sourceLintProjection(source),defects=[];
 if(baseline.source_sha256!==report.source_sha256)throw Error('source hash differs from migration attribution');
 const mapFile=path.join(out,'provenance/source-line-map.json'),maps=fs.existsSync(mapFile)?read(mapFile).documents:{},cache=new Map();
 const document=rel=>{
  if(!cache.has(rel)){const raw=fs.existsSync(path.join(source,rel))?fs.readFileSync(path.join(source,rel),'utf8'):'',current=fs.readFileSync(path.join(out,rel),'utf8');cache.set(rel,{raw,lines:raw.split('\n'),original:splitFrontMatter(raw),converted:splitFrontMatter(current),map:maps[rel]});}
  return cache.get(rel);
 };
 function locator(file,candidates){
  const unique=[...new Set(candidates)].sort((a,b)=>a-b),snapshot=report.path_map.find(x=>x.input===file)?.snapshot;
  if(unique.length===1)return {attribution:'EXACT',source:{file,line:unique[0]},snapshot:{file:snapshot,line:unique[0]},source_text:document(file).lines[unique[0]-1]};
  return {attribution:unique.length?'AMBIGUOUS':'UNRESOLVED',source:{file,candidates:unique.map(line=>({file,line}))},snapshot:{file:snapshot,candidates:unique.map(line=>({file:snapshot,line}))},source_text:unique.map(line=>({line,text:document(file).lines[line-1]}))};
 }
 function locationsFor(p,index,problems,d){
  if(p.file==='spec.manifest.json')return [1];
  if(['D-FRONTMATTER-SCHEMA','S-SCN-SCHEMA','S-SCN-AC'].includes(p.code)){
   const n=/scenarios\[(\d+)\]/.exec(p.message)?.[1];
   const scope=diagnosticScope(p,index,problems,d);
   const id=n===undefined?scope||/^(SCN-[A-Z0-9]+-\d+)/.exec(p.message)?.[1]:d.converted.data?.scenarios?.[Number(n)]?.id;
   if(id){const found=d.lines.flatMap((line,i)=>expandScenarios(line).includes(id)?[i+1]:[]);if(found.length)return found;}
  }
  return diagnosticLines(p,d);
 }
 const sourceCache=new Map(),usedCounterparts=new Set();
 const sourceDocument=rel=>{
  if(sourceCache.has(rel))return sourceCache.get(rel);
  const d=baseline.documents[rel];if(!d)return null;
  const doc={raw:d.raw,lines:d.raw.split('\n'),original:splitFrontMatter(d.raw),converted:splitFrontMatter(d.converted),map:d.map};sourceCache.set(rel,doc);return doc;
 };
 for(const [index,p]of lint.problems.entries())if(p.severity==='error'){
  const d=document(p.file),locations=locationsFor(p,index,lint.problems,d),sourceDoc=sourceDocument(p.file);
  const scope=diagnosticScope(p,index,lint.problems,d);
  const counterparts=baseline.problems.flatMap((b,i)=>{
   if(b.severity!=='error'||b.file!==p.file||b.code!==p.code||b.message!==p.message||!sourceDoc||diagnosticScope(b,i,baseline.problems,sourceDoc)!==scope)return [];
   return [{index:i,problem:b,source_lines:locationsFor(b,i,baseline.problems,sourceDoc)}];
  });
  const reproduced=[...new Set(counterparts.flatMap(b=>b.source_lines))].sort((a,b)=>a-b),located=locator(p.file,locations);
  const occurrence=counterparts.find(b=>!usedCounterparts.has(b.index)&&locations.length>0&&locations.every(line=>b.source_lines.includes(line)));
  const classified=Boolean(occurrence);if(occurrence)usedCounterparts.add(occurrence.index);
  defects.push({code:p.code,output:{file:p.file,line:p.line},...located,classification:classified?'pre-existing-source-invariant':!counterparts.length||!sourceDoc||locations.length?'CONVERTER-INDUCED':'UNRESOLVED-ATTRIBUTION',message:p.message,proof:{baseline:'fresh source lint reproduction',supplied_baseline:baselineFile||null,source_sha256:baseline.source_sha256,normalization:baseline.normalization,occurrence_scope:scope,matched_source_diagnostic:occurrence?.index??null,code:p.code,counterpart_lines:reproduced,reproduced_at_attributed_locations:classified}});
 }
 // Output absence cannot erase a reproduced source defect. Keep unmatched
 // source occurrences without interpreting their absence as semantic repair.
 for(const [index,p]of baseline.problems.entries())if(p.severity==='error'&&!usedCounterparts.has(index)){
  const d=sourceDocument(p.file);if(!d)throw Error('source diagnostic has no source document: '+p.file);
  const locations=locationsFor(p,index,baseline.problems,d),located=locator(p.file,locations);
  defects.push({code:p.code,...located,classification:'pre-existing-source-invariant',disposition:'absent-from-output',message:p.message,proof:{baseline:'fresh source lint reproduction',source_sha256:baseline.source_sha256,normalization:baseline.normalization,source_diagnostic:index,occurrence_scope:diagnosticScope(p,index,baseline.problems,d)}});
 }
 for(const b of report.blockers){
  const file=b.file||b.source?.file.replace(/^provenance\/input-snapshot\//,'').replace(/\.(txt|bin)$/,''),d=document(file);
  const candidates=b.source?[b.source.line]:b.line?[b.line]:b.scenario?d.lines.flatMap((line,i)=>expandScenarios(line).includes(b.scenario.split('.').at(-1))?[i+1]:[]):b.field?d.lines.flatMap((line,i)=>line.startsWith(b.field+':')?[i+1]:[]):[];
  const located=locator(file,candidates);
  defects.push({code:b.code,...located,classification:located.attribution==='UNRESOLVED'?'UNRESOLVED-ATTRIBUTION':'source-migration-blocker',message:b.reason,scenario:b.scenario,row:b.row,candidate_ac:b.candidate_ac,candidate_owners:b.candidate_owners});
 }
 const unknown=defects.filter(d=>['CONVERTER-INDUCED','UNRESOLVED-ATTRIBUTION'].includes(d.classification));
 const sourceDefects=defects.filter(d=>d.classification==='pre-existing-source-invariant').length;
 return {source_sha256:report.source_sha256,lint_errors:lint.problems.filter(p=>p.severity==='error').length,source_defect_errors:sourceDefects,removed_source_defect_errors:defects.filter(d=>d.disposition==='absent-from-output').length,output_source_defect_errors:sourceDefects-defects.filter(d=>d.disposition==='absent-from-output').length,converter_induced_errors:defects.filter(d=>d.classification==='CONVERTER-INDUCED').length,migration_blockers:report.blockers.length,converter_induced_or_unresolved_errors:unknown.length,attribution_counts:defects.reduce((a,d)=>(a[d.attribution]=(a[d.attribution]||0)+1,a),{}),classification_boundary:'Unchanged lint freshly rerun over source-only normalized projection; every output occurrence must reproduce the same file/code/message at its source locations; source-only defects remain visible; supplied baseline and output receipts are not trusted',defects};
}
if(process.argv[1]===new URL(import.meta.url).pathname){try{const result=traceDefects(...process.argv.slice(2));console.log(JSON.stringify(result,null,2));process.exitCode=result.converter_induced_or_unresolved_errors?1:0;}catch(e){console.error(e.message);process.exitCode=2;}}

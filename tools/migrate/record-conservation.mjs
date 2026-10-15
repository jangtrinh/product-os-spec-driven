import fs from 'node:fs';
import path from 'node:path';
const token=/(?<![\p{L}\p{N}])(?:SCN-PUB-\d{2}-\d{2}|SCR-PUB-\d{2}|EMAIL-\d{2}|CTRL-\d{2}|PD-\d+)(?![\p{L}\p{N}])/giu;
export function verifyRecords(files,out,crosswalk,report){
 const failures=[],lookup=new Map(crosswalk.rows.map(r=>[r.legacy_id,r.canonical_id]));
 const replace=s=>s.replace(token,t=>lookup.get(t.toUpperCase())||t);
 for(const f of files.filter(f=>/\.json$/i.test(f.file)&&f.file!=='spec.manifest.json')){
  const original=JSON.parse(f.bytes.toString('utf8')),current=JSON.parse(fs.readFileSync(path.join(out,f.file),'utf8'));
  const fail=field=>failures.push(`record conservation mismatch: ${f.file} ${field}`);
  function walk(before,after,field='$',parent){
   if(Array.isArray(before)){if(!Array.isArray(after)||after.length!==before.length){fail(field);return;}before.forEach((v,i)=>walk(v,after[i],`${field}[${i}]`,before));return;}
   if(before&&typeof before==='object'){
    if(!after||Array.isArray(after)||typeof after!=='object'){fail(field);return;}
    const keys=Object.keys(before).map(replace);
    if(new Set(keys).size!==keys.length||Object.keys(after).length!==keys.length){fail(field);return;}
    for(const [key,value]of Object.entries(before)){
     const target=replace(key);if(!Object.hasOwn(after,target)){fail(field+'.'+target);continue;}
     walk(value,after[target],field+'.'+target,before);
    }return;
   }
   let expected=typeof before==='string'?replace(before):before;
   if(field.endsWith('.freshness')&&before==='CURRENT')expected='STALE';
   if(field.endsWith('.page')&&typeof before==='string')expected=report.renames.find(r=>r.file===f.file&&r.kind==='history-page-reference'&&r.before===before)?.after.toLowerCase()||expected;
   if(field.endsWith('.after')&&parent?.id&&report.fields.some(r=>r.file===f.file&&r.field===`entries.${parent.id}.after`&&r.action==='mechanical-current-block-rewrite')){
    const change=report.fields.find(r=>r.file===f.file&&r.field===`entries.${parent.id}.after`&&r.action==='mechanical-current-block-rewrite');
    const sourceFile=files.find(x=>x.file===change.source_document),output=fs.readFileSync(path.join(out,change.source_document),'utf8');
    const sourceLines=sourceFile.bytes.toString('utf8').split('\n'),outLines=output.split('\n');
    const maps=JSON.parse(fs.readFileSync(path.join(out,'provenance/source-line-map.json'),'utf8')).documents[change.source_document];
    const values=new Map();maps.forEach((line,i)=>{if(line){const text=sourceLines[line-1],set=values.get(text)||new Set();set.add(outLines[i]);values.set(text,set);}});
    expected=replace(before).split('\n').map(line=>{const matches=values.get(line);return matches?.size===1?[...matches][0]:line;}).join('\n');
   }
   if(after!==expected)fail(field);
  }
  walk(original,current);
 }return failures;
}

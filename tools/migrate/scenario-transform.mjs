import { parseAcTable, expandScenarios } from '../lib/structure.mjs';
import { parseTables } from '../lib/md.mjs';
import { outsideLines } from '../lib/markdown-outside.mjs';
export function transformScenarios(doc,report){
 if(doc.data?.type!=='us')return;
 const original=doc.data.scenarios||[],ac=parseAcTable(doc),associations=new Map();
 const add=(id,ids)=>{const set=associations.get(id)||new Set();ids.forEach(x=>set.add(x));associations.set(id,set);};
 for(const row of ac.rows)addAll(row.scn,[row.id]);
 function addAll(ids,acs){for(const id of ids)add(id,acs);}
 for(const table of parseTables(doc.body).filter(t=>t.header[0]==='Scenario')){
  const col=table.header.findIndex(x=>/^AC$/i.test(x));
  if(col>=0)for(const row of table.rows)addAll(expandScenarios(row[0]),(row[col]||'').match(/AC-\d+/g)||[]);
 }
 const declared=new Map(original.map(s=>[typeof s==='string'?s:s.id,s]));
 // Body labels identify existing scenarios; allocation only supplies identity/verification defaults.
 for(const line of outsideLines(doc.body))for(const id of expandScenarios(line))if(!declared.has(id))declared.set(id,id);
 const result=[];
 for(const [id,s] of declared){
  if(typeof s==='object'){result.push(s);continue;}
  const ids=[...associations.get(id)||[]];
  if(!ids.length || ids.some(x=>!ac.rows.some(a=>a.id===x))){report.blockers.push({code:'SCENARIO-UNMAPPED',file:doc.rel,scenario:`${doc.data.id}.${id}`,candidate_ac:ids,reason:'No complete explicit association to existing local AC; source mapping required'});result.push({id,ac:ids,method:'unassigned',status:'blocked'});}
  else result.push({id,ac:ids,method:'unassigned',status:'planned'});
  report.fields.push({file:doc.rel,field:`scenarios.${id}`,action:'defaulted',value:{method:'unassigned',status:ids.length?'planned':'blocked',test:'absent'}});
 }
 const covered=new Set(result.flatMap(s=>s.ac||[]));
 let next=Math.max(0,...result.map(s=>Number(/-(\d+)$/.exec(s.id)?.[1]||0)));
 const label=doc.data.id.replace(/^US-/,'').replace(/^NF-/,'NF');
 for(const row of ac.rows)if(!covered.has(row.id)){
  let id;do{id=`SCN-${label}-${String(++next).padStart(2,'0')}`;}while(declared.has(id));
  result.push({id,ac:[row.id],method:'unassigned',status:'planned'});
  report.added_scenarios.push({file:doc.rel,line:row.line,id:`${doc.data.id}.${id}`,ac:row.id});
 }
 doc.data.scenarios=result;
 for(const field of ['state','roles','scope','ds','source','selector','evidence'])report.absent.push({file:doc.rel,field,reason:'No structured v2 declaration; source body and assets preserved without inferred values'});
 const lines=doc.body.split('\n');
 for(const table of parseTables(doc.body).filter(t=>t.header[0]==='Scenario')){
  const col=table.header.findIndex(h=>/^Method\s*[·/]\s*evidence$/i.test(h));
  if(col<0)continue;
  const head=[...table.header];head[col]='Method / evidence';lines[table.line]='| '+head.join(' | ')+' |';
  for(const [i,row] of table.rows.entries()){
   report.fields.push({file:doc.rel,line:doc.bodyLine+table.rowLines[i],field:'historical-method-evidence',action:'retained-as-unverified',value:row[col]});
   const copy=[...row];copy[col]=`unassigned; historical source (unverified): ${copy[col]}`;lines[table.rowLines[i]]='| '+copy.map(c=>c.replace(/\|/g,'\\|')).join(' | ')+' |';
  }
 }doc.body=lines.join('\n');
}

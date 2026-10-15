import oracle from '../../format/source-provenance-contract.cjs';
import { parseTables } from '../lib/md.mjs';
import { expandScenarios,parseAcTable } from '../lib/structure.mjs';
import { snapshotPath } from './tree-files.mjs';
import { legacyPattern,identitySurfaces } from './identity-surfaces.mjs';
export { legacyPattern } from './identity-surfaces.mjs';
const family=id=>id.startsWith('SCN-')?['scn-pub','scenario','scenario-next']:id.startsWith('SCR-')?['scr-pub','screen-state','screen-next']:id.startsWith('EMAIL-')?['email','ac','ac-next']:id.startsWith('CTRL-')?['ctrl','ac','ac-next']:['pd-feedback','artifact','feedback-next'];
export function rejectUnknownLegacySpellings(files,report){
 const candidate=/\b(?:SCN-PUB-\d+-\d+|SCR-PUB-\d+|EMAIL-\d+|CTRL-\d+|PD-\d+)\b/gi;
 const closed=/^(?:SCN-PUB-\d{2}-\d{2}|SCR-PUB-\d{2}|EMAIL-\d{2}|CTRL-\d{2}|PD-\d+)$/i;
 for(const f of files.filter(x=>/\.(md|html|json|css|ts|js|mjs)$/i.test(x.file)))for(const [i,line]of f.bytes.toString('utf8').split('\n').entries())for(const m of line.matchAll(candidate))if(!closed.test(m[0]))report.blockers.push({code:'UNKNOWN-LEGACY-ID',file:f.file,line:i+1,source:{file:snapshotPath(f.file),line:i+1},reason:'Known legacy family has an unsupported numeric spelling; no prefix repair or canonical identity guessed'});
}
export function buildCrosswalk(docs,report,mappings=[],files=[]){
 const candidates=new Map(),reserved=new Set(),owners=new Map();
 const surfaces=[...docs,...files.filter(f=>/\.(html|json|css|ts|js|mjs)$/i.test(f.file)).map(f=>({rel:f.file,raw:f.bytes.toString('utf8')}))];
 for(const doc of surfaces){
  const reservationText=identitySurfaces(doc.raw,doc.rel).map(s=>s.text).join('\n');
  if(doc.data?.type==='us'){
   reserved.add(`us:${doc.data.id}`);
   for(const row of parseAcTable(doc).rows)reserved.add(`ac:${doc.data.id}.${row.id}`);
   for(const id of new Set([...(doc.data.scenarios||[]).map(s=>typeof s==='string'?s:s.id),...expandScenarios(doc.body.replace(legacyPattern,' '))]))if(/^SCN-[A-Z0-9]+-\d+$/.test(id))reserved.add(`scenario:${doc.data.id}.${id}`);
   for(const row of parseAcTable(doc).rows)for(const token of (doc.raw.split('\n')[row.line-1]||'').match(legacyPattern)||[])if(token.startsWith('SCN-PUB-')){const set=owners.get(token.toUpperCase())||new Set();set.add(doc.data.id);owners.set(token.toUpperCase(),set);}
  }
  for(const id of [...reservationText.matchAll(/(?<![\p{L}\p{N}])(?:S\d{2}(?:-[a-z])?|FB-\d+)(?![\p{L}\p{N}])/gu)].map(m=>m[0]))reserved.add(id);
  for(const match of reservationText.matchAll(/(?<![\p{L}\p{N}])((?:US-(?:P?\d+)|NF-\d+))\.(AC-\d+|SCN-[A-Z0-9]+-\d+)(?![\p{L}\p{N}])/gu))reserved.add(`${match[2].startsWith('AC-')?'ac':'scenario'}:${match[0]}`);
  for(const [i,line] of doc.raw.split('\n').entries())for(const match of line.matchAll(legacyPattern)){
   const id=match[0].toUpperCase(),definitions=candidates.get(id)||[];
   // A row's identity, an owning story's AC scenario, or explicit Screen declaration outranks mentions.
   const priority=/^\|\s*(?:SCN-PUB-|SCR-PUB-|EMAIL-|CTRL-|PD-)/.test(line)?0:doc.data?.type==='us'&&(/^\|\s*AC-/.test(line)||/^Screen SCR-PUB-/.test(line))?0:1;
   definitions.push({doc,line:i+1,priority});candidates.set(id,definitions);
  }
 }
 const rawRows=[];
 for(const [id,occurrences] of candidates){
  occurrences.sort((a,b)=>a.priority-b.priority||Buffer.compare(Buffer.from(a.doc.rel),Buffer.from(b.doc.rel))||a.line-b.line);
  const def=occurrences[0],[f,kind,rule]=family(id),row={legacy_id:id,family:f,canonical_kind:kind,source:{file:snapshotPath(def.doc.rel),line:def.line},assignment_rule:rule};
  if(kind==='scenario'){
   const set=owners.get(id)||new Set();if(set.size===1)row.owner=[...set][0];
  }else if(kind==='ac'){
   const table=parseTables(def.doc.raw).find(t=>t.rowLines.includes(def.line-1));
   const explicit=/\b(?:US-(?:P?\d+)|NF-\d+)\b/.exec(table?.heading||'');
   // Ownership is supplied only by the explicit table heading, never from row context/references.
   if(explicit&&reserved.has(`us:${explicit[0]}`))row.owner=explicit[0];
  }
  rawRows.push(row);
 }
 const ordered=oracle.orderedRows(rawRows).map((r,i)=>({...r,id:`CW-${String(i+1).padStart(3,'0')}`}));
 for(const mapping of mappings){
  const row=ordered.find(x=>x.id===mapping.row);
  if(!row||!['scenario','ac'].includes(row.canonical_kind))throw Error('owner mapping row is absent or does not accept an owner');
  if(mapping.source.file!==row.source.file||mapping.source.line!==row.source.line)throw Error('owner mapping source locator differs from its row');
  if(!reserved.has(`us:${mapping.owner}`))throw Error('owner mapping owner is not a declared story in this input');
  if(row.owner&&row.owner!==mapping.owner)throw Error('owner mapping contradicts explicit source ownership');
  row.owner=mapping.owner;report.fields.push({field:'owner-mapping',row:row.id,action:'owner-supplied',value:mapping});
 }
 const valid=ordered.filter(row=>{
  if(['scenario','ac'].includes(row.canonical_kind)&&!row.owner){report.blockers.push({code:'CROSSWALK-OWNER',row:row.id,source:row.source,candidate_owners:[...new Set((docs.find(d=>snapshotPath(d.rel)===row.source.file)?.raw.split('\n')[row.source.line-1]||'').match(/\b(?:US-(?:P?\d+)|NF-\d+)\b/g)||[])],reason:'No single source-backed owner for identity allocation; retain input and refuse successful export'});return false;}return true;
 });
 const allocation=oracle.allocate(valid,[...reserved]);
 const rows=valid.map(r=>({...r,canonical_id:allocation.get(r.id)}));
 const errors=oracle.crosswalkErrors({version:1,rows},[...reserved]);
 errors.forEach(reason=>report.blockers.push({code:'CROSSWALK-CONTRACT',reason}));
 return {version:1,rows,reserved:[...reserved].sort(),unresolved:ordered.filter(r=>!valid.includes(r)).map(r=>({id:r.id,source:r.source})),sourceRows:ordered};
}
export function rewriteLegacy(text,doc,crosswalk){
 const lookup=new Map(crosswalk.rows.map(r=>[r.legacy_id,r]));
 return text.replace(legacyPattern,token=>{
  const row=lookup.get(token.toUpperCase());if(!row)return token;
  return row.canonical_kind==='scenario'&&doc?.data?.type==='us'&&row.owner===doc.data.id?row.canonical_id.slice(row.owner.length+1):row.canonical_id;
 });
}
export function rewriteRecordIds(value,file,crosswalk,report,field='$',doc=null){
 if(typeof value==='string'){
  const rewritten=rewriteLegacy(value,doc,crosswalk);
  if(rewritten!==value){const rows=[...new Set(value.match(legacyPattern)||[])].map(id=>crosswalk.rows.find(r=>r.legacy_id===id.toUpperCase())?.id).filter(Boolean);report.renames.push({file,field,kind:'crosswalk-record-reference',crosswalk_rows:rows,after:rewritten});}
  return rewritten;
 }
 if(Array.isArray(value))return value.map((v,i)=>rewriteRecordIds(v,file,crosswalk,report,`${field}[${i}]`,doc));
 if(!value||typeof value!=='object')return value;
 const result={};for(const [key,item]of Object.entries(value)){
  const k=rewriteRecordIds(key,file,crosswalk,report,field+'.<key>',doc);
  if(Object.hasOwn(result,k))throw Error(`rewritten JSON key collision in ${file} at ${field}: ${k}; no successful export`);
  Object.defineProperty(result,k,{value:rewriteRecordIds(item,file,crosswalk,report,field+'.'+k,doc),enumerable:true,writable:true,configurable:true});
 }return result;
}

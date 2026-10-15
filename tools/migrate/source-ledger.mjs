import oracle from '../../format/source-provenance-contract.cjs';
import { parseAcTable,parseReqs,parseDecisions } from '../lib/structure.mjs';
import { sourceItemText } from './source-item-text.mjs';
import { snapshotPath } from './tree-files.mjs';
export function makeLedger(sourceDocs,typedDocs,crosswalk,files=[]){
 const sourceItems=[],keys=new Set();
 const add=(id,doc,line,legacyId)=>{if(keys.has(id))throw Error(`duplicate source identity ${id}`);keys.add(id);sourceItems.push({id,file:snapshotPath(doc.rel),line,text:sourceItemText(doc.raw,id,line,legacyId)});};
 for(const doc of sourceDocs){
  const d={...doc,fm:doc.data||{}};
  if(doc.data?.type==='us')for(const ac of parseAcTable(d).rows)add(`${doc.data.id}.${ac.id}`,doc,ac.line);
  // Original source AC ids live in their separate source-item namespace.
  for(const [i,line] of doc.raw.split('\n').entries()){const m=/^- (AC-\d+\.\d+):/.exec(line);if(m)add(m[1],doc,i+1);}
 }
 for(const row of crosswalk.sourceRows){const doc=sourceDocs.find(d=>snapshotPath(d.rel)===row.source.file)||files.map(f=>({rel:f.file,raw:f.bytes.toString('utf8')})).find(d=>snapshotPath(d.rel)===row.source.file);add(row.id,doc,row.source.line,row.legacy_id);}
 const typed=new Map();
 const put=(kind,id)=>typed.set(`${kind}:${id}`,{kind,id:`${kind}:${id}`});
 for(const doc of typedDocs){const d={...doc,fm:doc.data||{}};
  if(doc.data?.type==='us'){put('us',doc.data.id);for(const ac of parseAcTable(d).rows)put('ac',`${doc.data.id}.${ac.id}`);for(const s of doc.data.scenarios||[])put('scenario',`${doc.data.id}.${s.id}`);}
  if(doc.data?.type==='prd')for(const r of parseReqs(d))put('req',r.id);
  if(doc.data?.ledger)for(const r of parseDecisions(d))put('decision',r.id);
 }
 const demoItems=typedDocs.filter(d=>d.rel.includes('current-demo/us/')||/US-1(?:1[6-9]|2[0-3])\.md$/.test(d.rel)).flatMap(d=>(d.data?.scenarios||[]).map(s=>`scenario:${d.data.id}.${s.id}`));
 // No mapping status is inferred from identity or copied wording: all semantic mappings require review.
 const items=sourceItems.map(s=>({id:s.id,source:{file:s.file,line:s.line},text_sha256:oracle.digest(s.text),status:'no-demo',mappings:[],reason:'Source preserved; no reviewed semantic mapping or eligible current demonstration evidence supplied',...(crosswalk.sourceRows.some(r=>r.id===s.id)?{crosswalk_row:s.id}:{})}));
 const ledger={version:1,normalization:'nfc-lf-trim-trailing-v1',crosswalk:'id-crosswalk.json',items,summary:{source_preservation:{total:items.length,preserved:items.length},typed_coverage:{total:typed.size,mapped:0},demo_coverage:{total:demoItems.length,passed:0}}};
 const context={sourceItems,typedItems:[...typed.values()],demoItems,passedDemoItems:[]};
 return {ledger,context,errors:oracle.ledgerErrors(ledger,{version:1,rows:crosswalk.rows},context)};
}

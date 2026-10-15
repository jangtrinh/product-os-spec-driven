#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import oracle from '../../format/source-provenance-contract.cjs';
import { inventory,treeHash } from './tree-files.mjs';
import { loadSpec } from '../lib/spec-load.mjs';
import { buildModel } from '../lib/doc-model.mjs';
import { verifyRecords } from './record-conservation.mjs';
import { traceDefects } from './source-defects.mjs';
import { identitySurfaces,executableLegacyIdentities } from './identity-surfaces.mjs';
import { splitRow } from '../lib/md.mjs';
import { parseAcTable } from '../lib/structure.mjs';
export function verify(source,out){
 const read=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
 const report=read('migration-report.json'),files=inventory(source),model=buildModel(loadSpec(out)),failures=[],pendingJoins=[],pendingAliases=[],unexpectedAliases=[];
 if(treeHash(files)!==report.source_sha256)failures.push('source tree hash differs');
 for(const item of report.path_map){const f=files.find(x=>x.file===item.input);if(!f||!fs.readFileSync(path.join(out,item.snapshot)).equals(f.bytes))failures.push('snapshot mismatch: '+item.input);}
 for(const f of files.filter(x=>!x.file.endsWith('.md')&&!x.file.endsWith('.json')))if(!fs.readFileSync(path.join(out,f.file)).equals(f.bytes))failures.push('copied asset bytes changed: '+f.file);
 if(files.length!==report.path_map.length||new Set(report.path_map.map(x=>x.input)).size!==files.length)failures.push('incomplete or duplicate snapshot paths');
 const actual={stories:model.stories.length,acceptance_criteria:model.stories.reduce((n,s)=>n+s.ac.rows.length,0),requirements:model.reqs.length,decisions:model.decisions.length};
 for(const [key,value]of Object.entries(actual))if(value!==report.counts.in[key]||value!==report.counts.out[key])failures.push('count mismatch: '+key);
 if(fs.existsSync(path.join(out,'provenance/id-crosswalk.json'))){
  const require=createRequire(import.meta.url),Ajv=require(process.env.SPEC_AJV_MODULE||'ajv/dist/2020');
  const ajv=new (Ajv.default||Ajv)({strict:false,allErrors:true});
  const crosswalk=read('provenance/id-crosswalk.json'),ledger=read('provenance/source-ledger.json'),allocation=read('provenance/id-allocation-inventory.json'),context=read('provenance/source-ledger-inventory.json');
  for(const [name,value]of [['id-crosswalk',crosswalk],['source-ledger',ledger]]){
   const schema=JSON.parse(fs.readFileSync(new URL(`../../format/schema/${name}.schema.json`,import.meta.url),'utf8'));
   const check=ajv.compile(schema);if(!check(value))failures.push(name+' schema: '+JSON.stringify(check.errors));
  }
  for(const row of crosswalk.rows){const lines=fs.readFileSync(path.join(out,row.source.file),'utf8').split('\n');if(!lines[row.source.line-1]?.includes(row.legacy_id))failures.push('crosswalk source token mismatch: '+row.id);}
  context.sourceItems=context.sourceItems.map(item=>{
   const line=fs.readFileSync(path.join(out,item.file),'utf8').split('\n')[item.line-1];
   if(line===undefined){failures.push('source item locator absent: '+item.id);return {...item,text:''};}
   const bullet=/^- (AC-\d+\.\d+): ?(.*)$/.exec(line);
   const alias=crosswalk.rows.find(r=>r.id===item.id)?.legacy_id||(/^CW-/.test(item.id)?line.match(/(?:SCN-PUB-\d{2}-\d{2}|SCR-PUB-\d{2}|EMAIL-\d{2}|CTRL-\d{2}|PD-\d+)/i)?.[0]:null);
   let text;
   if(bullet){if(bullet[1]!==item.id)failures.push('source bullet identity mismatch: '+item.id);text=bullet[2];}
   else if(/^\s*\|/.test(line))text=splitRow(line).slice(1).join('\n');
   else text=line;
   if(alias)text=text.replace(/(?<![\p{L}\p{N}])(?:SCN-PUB-\d{2}-\d{2}|SCR-PUB-\d{2}|EMAIL-\d{2}|CTRL-\d{2}|PD-\d+)(?![\p{L}\p{N}])/giu,t=>t.toUpperCase()===alias.toUpperCase()?'':t);
   return {...item,text};
  });
  const inventoryIds=new Set();
  for(const f of files.filter(x=>x.file.endsWith('.md'))){const raw=f.bytes.toString('utf8');const doc=loadSpecSource(raw);
   if(doc.data?.type==='us')for(const row of parseAcTable(doc).rows)inventoryIds.add(doc.data.id+'.'+row.id);
   for(const match of raw.matchAll(/^- (AC-\d+\.\d+):/gm))inventoryIds.add(match[1]);
  }
  for(const row of [...crosswalk.rows,...allocation.unresolved])inventoryIds.add(row.id);
  if(context.sourceItems.length!==inventoryIds.size||context.sourceItems.some(x=>!inventoryIds.has(x.id)))failures.push('source inventory differs from original AC rows/crosswalk items');
  const declared=new Set();for(const s of model.stories){declared.add('us:'+s.doc.id);for(const ac of s.ac.rows)declared.add('ac:'+s.doc.id+'.'+ac.id);for(const scn of s.doc.fm.scenarios||[])declared.add('scenario:'+s.doc.id+'.'+scn.id);}
  for(const r of model.reqs)declared.add('req:'+r.id);for(const d of model.decisions)declared.add('decision:'+d.id);
  if(context.typedItems.length!==declared.size||context.typedItems.some(x=>!declared.has(x.id)))failures.push('typed inventory differs from output declarations');
  for(const row of allocation.unresolved)if(ledger.items.some(i=>i.crosswalk_row===row.id))pendingJoins.push(row.id);
  failures.push(...oracle.crosswalkErrors(crosswalk,allocation.reserved),...oracle.ledgerErrors(ledger,crosswalk,context));
 }
 const crosswalk=fs.existsSync(path.join(out,'provenance/id-crosswalk.json'))?read('provenance/id-crosswalk.json'):{rows:[]};
 const allocation=fs.existsSync(path.join(out,'provenance/id-allocation-inventory.json'))?read('provenance/id-allocation-inventory.json'):{unresolved:[]};
 const token=/(?<![\p{L}\p{N}])(?:SCN-PUB-\d{2}-\d{2}|SCR-PUB-\d{2}|EMAIL-\d{2}|CTRL-\d{2}|PD-\d+)(?![\p{L}\p{N}])/giu;
 const pendingIds=new Set(allocation.unresolved.map(r=>{const line=fs.readFileSync(path.join(out,r.source.file),'utf8').split('\n')[r.source.line-1];return line.match(token)?.[0]?.toUpperCase();}));
 // Reports and frozen snapshots are audit surfaces; all other exported text
 // must be checked even when the crosswalk was omitted.
 const auditFiles=new Set(['migration-report.json','migration-report.md','provenance/id-crosswalk.json']);
 for(const rel of model.spec.files.filter(f=>/\.(?:html|[cm]?js|jsx|tsx?)$/i.test(f)&&!f.startsWith('provenance/input-snapshot/')))for(const hit of executableLegacyIdentities(fs.readFileSync(path.join(out,rel),'utf8'),rel)){
  unexpectedAliases.push({file:rel,line:hit.line});failures.push(`EXECUTABLE-LEGACY-ID: executable legacy identity outside crosswalk: ${rel}:${hit.line}`);
 }
 for(const rel of model.spec.files.filter(f=>/\.(md|json|html|css|ts|js|mjs)$/i.test(f)&&!f.startsWith('provenance/input-snapshot/')&&!auditFiles.has(f)))for(const surface of identitySurfaces(fs.readFileSync(path.join(out,rel),'utf8'),rel))for(const match of surface.text.matchAll(token)){
  const spill={file:rel,line:surface.line};if(pendingIds.has(match[0].toUpperCase()))pendingAliases.push(spill);else{unexpectedAliases.push(spill);failures.push('unexpected legacy identity outside crosswalk: '+rel+':'+surface.line);}
 }
 const sourceAliases=new Set(files.flatMap(f=>/\.(md|json|html|css|ts|js|mjs)$/i.test(f.file)?identitySurfaces(f.bytes.toString('utf8'),f.file).flatMap(s=>[...s.text.matchAll(token)].map(m=>m[0].toUpperCase())):[]));
 for(const id of sourceAliases)if(!crosswalk.rows.some(r=>r.legacy_id===id)&&!pendingIds.has(id))failures.push('missing crosswalk identity: '+id);
 failures.push(...verifyRecords(files,out,crosswalk,report));
 const attribution=traceDefects(source,out);
 for(const d of attribution.defects.filter(d=>['CONVERTER-INDUCED','UNRESOLVED-ATTRIBUTION'].includes(d.classification)))failures.push(`${d.classification} lint diagnostic: ${d.code} ${d.output?.file||d.source.file}:${d.output?.line||'?'} ${d.message}`);
 return {ok:!failures.length,source_defect_errors:attribution.source_defect_errors,removed_source_defect_errors:attribution.removed_source_defect_errors,output_source_defect_errors:attribution.output_source_defect_errors,converter_induced_errors:attribution.converter_induced_errors,converter_induced_or_unresolved_errors:attribution.converter_induced_or_unresolved_errors,pending_crosswalk_joins:pendingJoins,pending_legacy_aliases:pendingAliases,unexpected_legacy_aliases:unexpectedAliases,source_sha256:report.source_sha256,source_files:files.length,snapshots_verified:report.path_map.length,unmodified_assets_verified:files.filter(x=>!x.file.endsWith('.md')&&!x.file.endsWith('.json')).length,counts:actual,upstream_source_ac:files.filter(f=>f.file.endsWith('.md')).reduce((n,f)=>n+(f.bytes.toString('utf8').match(/^- AC-\d+\.\d+:/gm)||[]).length,0),failures};
}
import { splitFrontMatter as loadSpecSource } from '../lib/front-matter.mjs';
if(process.argv[1]===new URL(import.meta.url).pathname){try{const result=verify(process.argv[2],process.argv[3]);console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;}catch(e){console.error(e.message);process.exitCode=2;}}

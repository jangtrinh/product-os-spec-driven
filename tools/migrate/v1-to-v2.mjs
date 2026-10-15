#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseTables } from '../lib/md.mjs';
import { refuseEncodedIdentities } from './identity-surfaces.mjs';
import { lintSpec } from '../lint/index.mjs';
import { inventory,treeHash,boundary,write,json,snapshotPath } from './tree-files.mjs';
import { loadDocuments,normalizeDocuments,emitDocument,sourceLineMap } from './document-transform.mjs';
import { transformScenarios } from './scenario-transform.mjs';
import { buildCrosswalk,rewriteLegacy,rejectUnknownLegacySpellings,rewriteRecordIds } from './id-crosswalk.mjs';
import { updateHistoryAfter } from './history-after.mjs';
import { staleHistoricalRecords } from './historical-records.mjs';
import { loadOwnerMappings } from './owner-mapping.mjs';
import { makeLedger } from './source-ledger.mjs';
import { counts,reportMarkdown } from './migration-report.mjs';
const glossary=date=>`---\nid: migration-glossary\ntype: glossary\ntitle: Source glossary absence\nupdated: ${date}\n---\n## Terms\n\n| Term | Anchor | Definition | Source |\n|---|---|---|---|\n\nNo terms declared in the v1 glossary contract; source prose retained without inferred definitions.\n\n## Ban list\n\n| Banned | Replacement | Reason |\n|---|---|---|\n\nNo bans declared.\n`;
export function migrate(source,output,ownerMap){
 const {input,out}=boundary(source,output),files=inventory(input),sourceHash=treeHash(files);
 let manifest=JSON.parse(files.find(x=>x.file==='spec.manifest.json')?.bytes.toString('utf8')||'null');
 if(manifest?.format!=='1')throw Error('migration requires a format 1 manifest');
 const generated=['provenance/source-line-map.json','migration-report.json','migration-report.md','provenance/id-crosswalk.json','provenance/source-ledger.json','provenance/id-allocation-inventory.json','provenance/source-ledger-inventory.json','provenance/lint-result.json','provenance/owner-mapping-required.json'];
 if(files.some(f=>generated.includes(f.file)||f.file.startsWith('provenance/input-snapshot/')))throw Error('source collides with a generated migration artifact; no files written');
 refuseEncodedIdentities(files);
 const originals=loadDocuments(files),docs=structuredClone(originals);
 const report={version:1,source_format:'1',source_sha256:sourceHash,source_files:files.length,source_bytes:files.reduce((s,x)=>s+x.bytes.length,0),input_unchanged:false,success:false,counts:{in:counts(originals)},renames:[],fields:[],absent:[],added_scenarios:[],unverified_inputs:[],blockers:[],ui_contract_missing_screens:[],path_map:files.map(x=>({input:x.file,snapshot:snapshotPath(x.file),output:x.file})),lint:{errors:0,warnings:{}},render:{status:'NOT_RUN',reason:'Reader v2 is not included in the migration baseline; run after reader integration',commands:['node tools/reader/render.mjs <migrated-spec> --out <render-output> --offline --artifact','node tools/reader/verify.mjs <render-output> --proof <proof-output>']}};
 rejectUnknownLegacySpellings(files,report);
 const renamed=normalizeDocuments(docs,report);
 const crosswalk=buildCrosswalk(originals,report,loadOwnerMappings(ownerMap,sourceHash),files);
 for(const d of docs)if(d.data){
  d.data=rewriteRecordIds(d.data,d.rel,crosswalk,report,'$',d);d.body=rewriteLegacy(d.body,d,crosswalk);
  transformScenarios(d,report);
 }
 manifest.format='2';
 if(manifest.gate_model){report.fields.push({file:'spec.manifest.json',field:'gate_model',action:'archived-in-snapshot',reason:'Historical gate model requires new v2 pins and independent receipts; original retained in immutable input snapshot'});delete manifest.gate_model;}
 if(!manifest.tests_root){manifest.tests_root='tests';report.fields.push({file:'spec.manifest.json',field:'tests_root',action:'defaulted',value:'tests'});}
 if(!manifest.glossary){manifest.glossary={document:'glossary.md'};report.fields.push({file:'spec.manifest.json',field:'glossary.document',action:'defaulted',value:'glossary.md'});}
 const hasUI=docs.some(d=>d.data?.type==='ui-contract');
 if(!hasUI){manifest.ui_contract='legacy-absent';manifest.migrated_from='v1';manifest.migration_report='migration-report.json';}
 const screens=new Set(docs.flatMap(d=>d.data?.screens||[]));
 for(const d of docs.filter(d=>d.data?.type==='ux'&&d.data.inventory))for(const t of parseTables(d.body))for(const row of t.rows)if(/^S\d{2}(?:-[a-z])?$/.test(row[0]))screens.add(row[0]);
 report.ui_contract_missing_screens=[...screens].sort();
 for(const f of files.filter(f=>/\.(html|css|ts|js|mjs)$/i.test(f.file)))for(const [i,line]of f.bytes.toString('utf8').split('\n').entries()){
  const aliases=[...line.matchAll(/(?<![\p{L}\p{N}])(?:SCN-PUB-\d{2}-\d{2}|SCR-PUB-\d{2}|EMAIL-\d{2}|CTRL-\d{2}|PD-\d+)(?![\p{L}\p{N}])/giu)].map(m=>m[0]);
  if(aliases.length)report.blockers.push({code:'UNREWRITTEN-ASSET-ID',file:f.file,source:{file:snapshotPath(f.file),line:i+1},aliases,reason:'Immutable asset contains legacy identities; raw bytes retained and successful export refused'});
 }
 for(const item of manifest.reading_order||[])item.pages=item.pages.map(id=>renamed.get(id.toLowerCase())||id);
 manifest=rewriteRecordIds(manifest,'spec.manifest.json',crosswalk,report);
 // Sources are copied in full before any transformation; the snapshot uses non-reader text suffixes.
 const records=new Map();
 for(const f of files.filter(f=>/\.json$/i.test(f.file)&&f.file!=='spec.manifest.json')){
  const original=JSON.parse(f.bytes.toString('utf8'));
  const current=rewriteRecordIds(staleHistoricalRecords(original,f.file,report),f.file,crosswalk,report);
  if(f.file===manifest.changes?.blocks)updateHistoryAfter(current,originals,docs,renamed,f.file,report);
  records.set(f.file,{original,current});
 }
 fs.mkdirSync(out,{recursive:true});
 for(const f of files){
  write(out,f.file,f.bytes);write(out,snapshotPath(f.file),f.bytes);
  if(/\.json$/i.test(f.file)&&f.file!=='spec.manifest.json'){
   const {original,current:stale}=records.get(f.file);
   if(JSON.stringify(original)!==JSON.stringify(stale))write(out,f.file,json(stale));
   report.unverified_inputs.push({file:f.file,reason:'Retained legacy structured payload; imported historical gates/receipts are audit only and never eligible CURRENT approvals'});
   if(/(?:canvas|inventory)\.json$/.test(f.file))report.blockers.push({code:'UNVERIFIED-INVENTORY',file:f.file,reason:'Legacy canvas/inventory has no declared v2 schema/source join; retained without guessed states or deduplication'});
  }
 }

 for(const d of docs)if(d.data)write(out,d.rel,emitDocument(d));
 write(out,'provenance/source-line-map.json',json({version:1,documents:Object.fromEntries(docs.filter(d=>d.data).map(d=>[d.rel,sourceLineMap(d)]))}));
 if(!files.some(f=>f.file==='glossary.md')&&manifest.glossary.document==='glossary.md')write(out,'glossary.md',glossary(manifest.date||docs.find(d=>d.data?.updated)?.data.updated||'1970-01-01'));
 write(out,'spec.manifest.json',json(manifest));
 if(crosswalk.rows.length){
  write(out,'provenance/id-crosswalk.json',json({version:1,rows:crosswalk.rows}));
  write(out,'provenance/owner-mapping-required.json',json({version:1,source_sha256:sourceHash,mappings:report.blockers.filter(b=>b.code==='CROSSWALK-OWNER'),contract:'tools/migrate/owner-mapping.schema.json',example:'tools/migrate/owner-mapping.example.json'}));
  write(out,'provenance/id-allocation-inventory.json',json({reserved:crosswalk.reserved,unresolved:crosswalk.unresolved}));
  const {ledger,context,errors}=makeLedger(originals,docs,crosswalk,files);
  write(out,'provenance/source-ledger.json',json(ledger));write(out,'provenance/source-ledger-inventory.json',json({...context,sourceItems:context.sourceItems.map(({text,...item})=>item)}));
  const pending=crosswalk.unresolved.filter(r=>ledger.items.some(i=>i.crosswalk_row===r.id));
  for(const row of pending)report.blockers.push({code:'SOURCE-LEDGER-CROSSWALK',row:row.id,source:row.source,reason:'C9 join unresolved because source ownership has no canonical allocation; ledger item stays preserved and export stays blocked'});
  errors.filter(reason=>reason!=='X-SOURCE crosswalk join'||!pending.length).forEach(reason=>report.blockers.push({code:'SOURCE-LEDGER',reason}));
  report.source_ledger={...ledger.summary,upstream_ac_preserved:ledger.items.filter(s=>/^AC-\d+\.\d+$/.test(s.id)).length};
 }else report.source_ledger={status:'NOT_APPLICABLE',reason:'No recognized legacy crosswalk items; the ledger contract requires a nonempty crosswalk'};
 for(const f of files.filter(f=>/\.(md|html|json|css|ts)$/i.test(f.file)))for(const [i,line]of f.bytes.toString('utf8').split('\n').entries())if(/file:\/\/|\/Users\//.test(line))report.absent.push({file:f.file,line:i+1,field:'portable-external-evidence',source:{file:snapshotPath(f.file),line:i+1},reason:'Machine-local external path preserved in frozen input; no outside-source reads or invented replacement'});
 report.counts.out=counts(docs);
 report.generated_documents=[{file:'migration-report.md',type:'note'},...(!files.some(f=>f.file==='glossary.md')&&manifest.glossary.document==='glossary.md'?[{file:'glossary.md',type:'glossary'}]:[])];
 report.input_unchanged=treeHash(inventory(input))===sourceHash;
 if(!report.input_unchanged)report.blockers.push({code:'INPUT-CHANGED',reason:'Input bytes changed during migration; discard output and recopy quiescent input'});
 const date=manifest.date||docs.find(d=>d.data?.updated)?.data.updated||'1970-01-01';
 write(out,'migration-report.json',json(report));write(out,'migration-report.md',reportMarkdown(report,date));
 const result=lintSpec(out),problems=result.problems.list;
 report.lint={exit:result.exitCode,errors:result.problems.errors.length,warnings:result.problems.warnings.reduce((s,p)=>(s[p.code]=(s[p.code]||0)+1,s),{}),stats:result.stats};
 report.success=!report.blockers.length&&result.exitCode===0;
 write(out,'migration-report.json',json(report));write(out,'migration-report.md',reportMarkdown(report,date));
 write(out,'provenance/lint-result.json',json({exit:result.exitCode,problems,stats:result.stats}));
 return {exit:report.success?0:1,report};
}
export function main(args=process.argv.slice(2)){
 try{if(![3,5].includes(args.length)||args[1]!=='--out'||!args[0]||!args[2]||args.length===5&&(args[3]!=='--owner-map'||!args[4]))throw Error('usage: node tools/migrate/v1-to-v2.mjs <v1-spec> --out <dir> [--owner-map <json>]');
 const {exit,report}=migrate(args[0],args[2],args[4]);console.log(`${report.success?'PASS':'BLOCKED'}: ${report.counts.out.stories} stories; ${report.counts.out.acceptance_criteria} AC; ${report.lint.errors} lint errors; ${report.blockers.length} migration blockers; input unchanged=${report.input_unchanged}`);return exit;
 }catch(e){console.error(`Migration refused: ${e.message}`);return 2;}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)process.exitCode=main();

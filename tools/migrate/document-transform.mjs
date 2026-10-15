import { splitFrontMatter } from '../lib/front-matter.mjs';
import { parseTables } from '../lib/md.mjs';
import { RESERVED_IDS } from '../lib/defaults.mjs';
import { snapshotPath } from './tree-files.mjs';
import { normalizeDeclaredColumns } from './declared-table-columns.mjs';
export function loadDocuments(files){return files.filter(x=>x.file.endsWith('.md')).map(x=>{
 const raw=x.bytes.toString('utf8'),doc={rel:x.file,raw,...splitFrontMatter(raw)};
 doc.sourceLines=doc.body.split('\n').map((_,i)=>doc.bodyLine+i);return doc;
});}
export function sourceLineMap(doc){
 const lines=[1,...Object.keys(doc.data).map(k=>{const i=doc.raw.split('\n').findIndex(l=>l.startsWith(k+':'));return i<0?null:i+1;}),null,...doc.sourceLines];
 if(lines.length!==emitDocument(doc).split('\n').length)throw Error(`source line map length differs: ${doc.rel}`);
 return lines;
}
export function emitDocument(doc){return '---\n'+Object.entries(doc.data).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n---\n'+doc.body;}
export function normalizeHeaders(doc,report){
 const lines=doc.body.split('\n');
 for(const table of parseTables(doc.body)){
  let header;
  const declaredId=table.header.findIndex(h=>/^(?:ID|#|Mã)$/i.test(h));
  const identityColumn=declaredId<0?0:declaredId;
  if(table.rows.some(r=>/^A\d+-\d+$/.test(r[identityColumn])))normalizeDeclaredColumns(table,'amendment',doc,report,lines);
  else if(table.rows.some(r=>/^REQ-\d+$/.test(r[identityColumn])))normalizeDeclaredColumns(table,'requirement',doc,report,lines);
  else if(table.rows.some(r=>/^D\d+$/.test(r[identityColumn]))&&doc.data?.ledger)normalizeDeclaredColumns(table,'decision',doc,report,lines);
  else if(/^4[.\-:\s]/.test(table.heading)&&table.rows.some(r=>/^AC-\d+$/.test(r[0]))){
   const labels={'điều kiện':'Given','khi':'When','kết quả':'Then','given/when':'Given / When','method · evidence':'Method / evidence'};
   header=table.header.map(h=>labels[h.toLowerCase()]||h);
  }
  if(table.header[0]==='Scenario' && doc.data?.type!=='us'){
   const owner=/\b(?:US-(?:P?\d+)|NF-\d+)\b/.exec(table.heading)?.[0];
   if(owner)for(const [i,row] of table.rows.entries())if(/^SCN-[A-Z0-9]+-\d+$/.test(row[0])){
    const qualified=[...row];qualified[0]=`${owner}.${row[0]}`;lines[table.rowLines[i]]='| '+qualified.map(c=>c.replace(/\|/g,'\\|')).join(' | ')+' |';
    report.renames.push({file:doc.rel,line:doc.bodyLine+table.rowLines[i],kind:'scenario-context',before:row[0],after:qualified[0],authority:table.heading});
   }
  }
  if(header&&JSON.stringify(header)!==JSON.stringify(table.header)){
   report.renames.push({file:doc.rel,line:doc.bodyLine+table.line,kind:'structural-header',before:table.header,after:header});
   lines[table.line]='| '+header.join(' | ')+' |';
  }
 }doc.body=lines.join('\n');
}
export function normalizeDocuments(docs,report){
 const occupied=new Set(docs.map(d=>d.data?.id?.toLowerCase()).filter(Boolean)),renamed=new Map();
 for(const d of docs){
  if(d.error||!d.data){report.blockers.push({code:'FRONT-MATTER',file:d.rel,line:d.error?.line||1,reason:d.error?.message||'Source front matter absent'});continue;}
  if(RESERVED_IDS.includes(d.data.id?.toLowerCase())){
   let id=d.data.id+'-source',n=2;while(occupied.has(id.toLowerCase()))id=d.data.id+'-source-'+n++;
   renamed.set(d.data.id.toLowerCase(),id);occupied.add(id.toLowerCase());report.renames.push({file:d.rel,line:2,kind:'reserved-page-id',before:d.data.id,after:id});d.data.id=id;
  }
  normalizeHeaders(d,report);
  if(d.data.type==='contract'){
   for(const key of ['version','owner','product','source'])if(Object.hasOwn(d.data,key)){
    const value=d.data[key];d.sourceLines=[null,null,null,null,...d.sourceLines];
    d.body=`\n| Legacy metadata | Value |\n|---|---|\n| ${key} | ${JSON.stringify(value).replace(/\|/g,'\\|')} |\n`+d.body;
    report.fields.push({file:d.rel,field:key,action:'moved-to-body',value});delete d.data[key];
   }
  }
  for(const key of ['status','owner_role','group','audience'])if(typeof d.data[key]==='string'&&d.data[key].length>(key==='audience'?80:60))report.blockers.push({code:'FIELD-LENGTH',file:d.rel,field:key,reason:'Source value exceeds v2 limit; retained without truncation'});
 }
 return renamed;
}
export function sourcePointer(doc,line){return {file:snapshotPath(doc.rel),line};}

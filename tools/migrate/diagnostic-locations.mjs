import { parseTables,headings } from '../lib/md.mjs';
import { realDate } from '../lib/schema-lite.mjs';
import { parseAmendments } from '../lib/structure.mjs';
export function diagnosticLines(problem,doc){
 const {converted,original,lines,map}=doc,body=converted.body.split('\n'),tables=parseTables(converted.body);
 const mapped=output=>map?.[output-1]??(converted.body.split('\n').length===original.body.split('\n').length&&output>=converted.bodyLine?original.bodyLine+output-converted.bodyLine:null);
 const bodyLines=indices=>indices.map(i=>mapped(converted.bodyLine+i)).filter(Number.isInteger);
 const headerField=key=>lines.flatMap((line,i)=>line.startsWith(key+':')?[i+1]:[]);
 if(problem.code==='S-SCREEN')return headerField('screens');
 if(problem.code==='S-CHANGELOG'){
  const log=tables.find(t=>/^Version$/i.test(t.header[0]));
  if(!log){const candidates=tables.filter(t=>/change log|changelog|lịch sử|nhật ký/i.test(t.heading));return bodyLines(candidates.length?candidates.map(t=>t.line):headings(converted.body).filter(h=>/change log|changelog|lịch sử|nhật ký/i.test(h.text)).map(h=>h.line));}
  if(!log.header.some(h=>/date|ngày/i.test(h))||!log.header.some(h=>/why|change|thay đổi/i.test(h))||!log.header.some(h=>/approv|decision|quyết định/i.test(h)))return bodyLines([log.line]);
  const changes=parseAmendments({...converted,fm:converted.data}).changes;
  return bodyLines(log.rowLines.filter((_,i)=>!changes[i]||!realDate(changes[i].date)||!changes[i].version||!changes[i].why||!changes[i].approved));
 }
 if(problem.code==='S-PRD-REQ'){
  const req=tables.filter(t=>/^ID$/i.test(t.header[0])&&t.rows.some(r=>/^REQ-\d+$/.test(r[0])));
  return bodyLines(req.flatMap(t=>{
   if(t.header.length<3||!/requirement|yêu cầu/i.test(t.header[1])||!/source|nguồn/i.test(t.header[2]))return [t.line];
   return t.rowLines.filter((_,i)=>t.rows[i].slice(0,3).some(c=>!c));
  }));
 }
 if(problem.code==='S-US-INDEX'&&problem.message.startsWith('index story set'))return bodyLines(tables.flatMap(t=>t.rowLines.filter((_,i)=>/(?:US-(?:P?\d+)|NF-\d+)/.test(t.rows[i][0]))));
 if(problem.code==='S-AMENDMENT-ROWS'&&problem.message.startsWith('affected reference does not resolve: ')){
  const ref=problem.message.slice('affected reference does not resolve: '.length),amend=parseAmendments({...converted,fm:converted.data});
  // The lint parser's row anchor can differ from the physical Markdown row.
  const rows=amend.items.flatMap(a=>a.rows).filter(r=>r.line===problem.line&&(r.cells?.[2]||'').split(/[,;]\s*/).includes(ref));
  if(rows.length)return bodyLines(tables.flatMap(t=>t.rowLines.filter((_,i)=>rows.some(r=>r.id===t.rows[i][0]&&(t.rows[i][2]||'').split(/[,;]\s*/).includes(ref)))));
  return bodyLines(tables.flatMap(t=>t.rowLines.filter((_,i)=>/^A\d+-\d+$/.test(t.rows[i][0])&&(t.rows[i][2]||'').split(/[,;]\s*/).includes(ref))));
 }
 const field=/front matter field ([a-z_]+)|missing ([a-z_]+)|field "([a-z_]+)"/.exec(problem.message);
 if(field){const found=headerField(field[1]||field[2]||field[3]);if(found.length)return found;}
 const line=mapped(problem.line);return Number.isInteger(line)?[line]:[];
}

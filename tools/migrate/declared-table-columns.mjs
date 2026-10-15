import { splitRow } from '../lib/md.mjs';
const id=/^(?:ID|Id|#|Mã)$/i;
const layouts={
 requirement:{required:[['ID',id],['Requirement',/^(?:Requirement|Product requirement|Yêu cầu)$/i],['Source',/^(?:Source|Nguồn)$/i]],extra:/^(?:US|Observable result|Kết quả quan sát được|Affected ids)$/i},
 amendment:{required:[['#',id],['Change (already applied to body)',/^Change(?: \(.*\))?$/i],['Affected ids',/^(?:Affected ids|Local ids|FC-004 ids|Affects \/ supersedes FC-004 ids)$/i],['Source',/^(?:Source|Nguồn)$/i]],extra:/^(?:BRD ids|Upstream ids|Owner round)$/i},
 decision:{required:[['Id',id],['Decision',/^(?:Decision|Quyết định)$/i],['Detail',/^(?:Detail|Source and detail|Chi tiết)$/i]],extra:/^(?:Destination|Date|Ngày)$/i}
};
// A declared label is the only authority for a column's meaning. Unknown cells
// stay under their original label, even when required columns move around them.
export function normalizeDeclaredColumns(table,kind,doc,report,lines){
 const layout=layouts[kind],matches=layout.required.map(([,pattern])=>table.header.flatMap((h,i)=>pattern.test(h)?[i]:[]));
 const recognized=new Set(matches.flat());
 for(const [i,column]of table.header.entries())if(!recognized.has(i)&&!layout.extra.test(column))report.blockers.push({code:'SOURCE-TABLE-COLUMN',file:doc.rel,line:doc.bodyLine+table.line,column,reason:`Unexpected ${kind} column ${JSON.stringify(column)} retained under its declared name`});
 if(matches.some(m=>m.length!==1)||table.rows.some(r=>r.length!==table.header.length)||splitRow(lines[table.line+1]).length!==table.header.length){
  report.blockers.push({code:'SOURCE-TABLE-SHAPE',file:doc.rel,line:doc.bodyLine+table.line,reason:`Missing/duplicate declared ${kind} columns or unequal row widths; table retained without positional inference`});return;
 }
 const order=[...matches.map(m=>m[0]),...table.header.map((_,i)=>i).filter(i=>!recognized.has(i))];
 const header=order.map((j,i)=>i<layout.required.length?layout.required[i][0]:table.header[j]);
 const emit=row=>'| '+row.map(c=>c.replace(/\|/g,'\\|')).join(' | ')+' |';
 if(order.some((v,i)=>v!==i)){
  const separator=splitRow(lines[table.line+1]);lines[table.line+1]=emit(order.map(j=>separator[j]));
  for(const [i,row]of table.rows.entries()){
   const reordered=order.map(j=>row[j]);lines[table.rowLines[i]]=emit(reordered);
   report.renames.push({file:doc.rel,line:doc.bodyLine+table.rowLines[i],kind:'structural-column-order',before:row,after:reordered});
  }
 }
 if(JSON.stringify(header)!==JSON.stringify(table.header)){
  report.renames.push({file:doc.rel,line:doc.bodyLine+table.line,kind:'structural-header',before:table.header,after:header});lines[table.line]=emit(header);
 }
}

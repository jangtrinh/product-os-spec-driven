export function updateHistoryAfter(history,originals,converted,renamed,file,report){
 if(!Array.isArray(history.entries))return history;
 for(const entry of history.entries){
  const source=originals.find(d=>d.data?.id?.toLowerCase()===entry.page);
  const target=source&&converted.find(d=>d.rel===source.rel);
  if(!source||!target||typeof entry.after!=='string')continue;
  const old=source.body.split('\n'),current=target.body.split('\n');
  if(old.length!==current.length){report.blockers.push({code:'HISTORY-AFTER-MAPPING',file,record:entry.id,reason:'Body line count changed; source-backed block mapping required'});continue;}
  const transform=new Map();
  old.forEach((line,i)=>{const set=transform.get(line)||new Set();set.add(current[i]);transform.set(line,set);});
  const after=entry.after.split('\n').map(line=>{const matches=transform.get(line);return matches?.size===1?[...matches][0]:line;}).join('\n');
  if(after!==entry.after){
   report.fields.push({file,field:`entries.${entry.id}.after`,action:'mechanical-current-block-rewrite',source_document:source.rel,reason:'After text follows the same identity/header/method transformation as current Markdown; original before/after bytes retained in snapshot'});
   entry.after=after;
  }
  if(renamed.has(entry.page)){const next=renamed.get(entry.page);report.renames.push({file,kind:'history-page-reference',before:entry.page,after:next});entry.page=next.toLowerCase();}
 }return history;
}

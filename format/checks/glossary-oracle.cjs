// Strict extension-cell parser used only by developer verification.
function strictJSON(text){
 const value=JSON.parse(text),tokens=text.match(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g);
 let n=0;
 function walk(){
  const token=tokens[n++];
  if(token==='['){if(tokens[n]===']'){n++;return;}do{walk();}while(tokens[n++]===',');}
  else if(token==='{'){
   const seen=new Set();if(tokens[n]==='}'){n++;return;}
   do{const key=JSON.parse(tokens[n++]);if(seen.has(key))throw Error('Duplicate JSON key');seen.add(key);n++;walk();}while(tokens[n++]===',');
  }
 }
 walk();return value;
}
function cells(line){
 let result=[],cell='';
 for(let i=0;i<line.length;i++){
  const c=line[i];
  if(c==='\\'){const next=line[++i];if(!['|','\\'].includes(next))throw Error('Unknown table escape');cell+=next;}
  else if(c==='|'){result.push(cell.trim());cell='';}else cell+=c;
 }
 result.push(cell.trim());if(result[0]==='')result.shift();if(result.at(-1)==='')result.pop();return result;
}
function normalize(line,kind,context){
 const names=kind==='term'?['term','anchor','definition','source','locale','source_key','retained_terms','exceptions']:['banned','replacement','reason','locale','source_key','retained_terms','exceptions'];
 const values=cells(line);if(values.length!==names.length)throw Error('Wrong column count');
 const row=Object.fromEntries(names.map((key,i)=>[key,values[i]]));
 row.locale=row.locale==='—'?context.language||'vi':row.locale;
 if(!context.locales.includes(row.locale))throw Error('Unknown locale');
 if(row.source_key==='—')delete row.source_key;
 row.retained_terms=strictJSON(row.retained_terms);row.exceptions=strictJSON(row.exceptions);
 return row;
}
function sourceErrors(row,context){
 const errors=[];
 if(row.source&&!context.sources.includes(row.source))errors.push('unknown source');
 if(Array.isArray(row.exceptions))for(const x of row.exceptions)if(!context.sources.includes(x.source))errors.push('unknown exception source');
 if(row.source_key&&!(context.catalogs[row.locale]||[]).includes(row.source_key))errors.push('unknown source key');
 return errors;
}
module.exports={normalize,sourceErrors,strictJSON};

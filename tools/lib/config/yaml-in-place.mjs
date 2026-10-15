import {parseYaml} from './yaml-parser.mjs';
import {canonical} from './strict-json.mjs';
import {RunnerError} from './path-selection.mjs';
const map=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const equal=(a,b)=>canonical(a)===canonical(b);
function refuse(keys,value,reason) {
 const key=keys.join('.')||'(root)';
 throw new RunnerError(`Cannot safely edit config key ${key}: ${reason}; manually edit config/pipeline.yaml: set ${key} to ${value===undefined?'absent (remove the key)':canonical(value)}, then rerun upgrade`);
}
// Locate punctuation only outside quotes and flow collections. The parser remains
// the sole authority for values; this scanner only finds byte ranges to edit.
function punctuation(text,wanted) {
 let quote='',depth=0;
 for(let i=0;i<text.length;i++) {
  const c=text[i];
  if(quote) {if(c==='\\'&&quote==='"')i++;else if(c===quote){if(quote==="'"&&text[i+1]==="'")i++;else quote='';}}
  else if(c==='"'||c==="'")quote=c;
  else if(c==='['||c==='{')depth++;
  else if(c===']'||c==='}')depth--;
  else if(!depth&&c===wanted&&(wanted!=='#'||i===0||/\s/.test(text[i-1])))return i;
 }
 return -1;
}
function index(source) {
 const rows=[];let offset=0;
 for(const line of source.match(/[^\n]*\n|[^\n]+$/g)??[]) {
  const raw=line.replace(/\r?\n$/,''),comment=punctuation(raw,'#'),content=(comment<0?raw:raw.slice(0,comment)).trimEnd();
  if(content.trim()&&content.trim()!=='---')rows.push({offset,end:offset+line.length,raw,content,indent:content.length-content.trimStart().length});
  offset+=line.length;
 }
 const result=new Map(),stack=[];
 for(let i=0;i<rows.length;i++) {
  const row=rows[i];while(stack.length&&stack.at(-1).indent>=row.indent)stack.pop();
  const text=row.content.trimStart(),colon=punctuation(text,':');
  if(text.startsWith('-')||colon<0||stack.some(p=>!p.block)) {stack.push({...row,block:false});continue;}
  const spelling=text.slice(0,colon),key=Object.keys(parseYaml(`${spelling}: null`))[0],keys=[...stack.map(p=>p.key),key];
  const start=row.indent+colon+1,tail=row.content.slice(start),valueStart=start+(tail.length-tail.trimStart().length);
  let last=i;while(last+1<rows.length&&rows[last+1].indent>row.indent)last++;
  const node={...row,key,keys,valueStart,valueEnd:row.content.length,block:!tail.trim(),insert:rows[last].end,childIndent:rows[i+1]?.indent>row.indent?rows[i+1].indent:row.indent+2};
  result.set(JSON.stringify(keys),node);stack.push(node);
 }
 return result;
}
function scalar(value,old='') {
 if(typeof value==='string')return old.startsWith("'")&&!value.includes('\n')?`'${value.replaceAll("'","''")}'`:JSON.stringify(value);
 return canonical(value);
}
function blockEntry(key,value,indent,eol,keys) {
 const prefix=' '.repeat(indent),name=/^[A-Za-z_][\w-]*$/.test(key)?key:JSON.stringify(key);
 if(map(value)&&Object.keys(value).length)return `${prefix}${name}:${eol}`+Object.entries(value).map(([k,v])=>blockEntry(k,v,indent+2,eol,[...keys,k])).join('');
 if(Array.isArray(value)&&value.length) {
  if(value.some(v=>Array.isArray(v)))refuse(keys,value,'new nested sequence requires a manual block edit');
  return `${prefix}${name}:${eol}`+value.map(v=>`${prefix}  - ${scalar(v)}${eol}`).join('');
 }
 return `${prefix}${name}: ${scalar(value)}${eol}`;
}
export function editYaml(source,target,label='config/pipeline.yaml') {
 const original=parseYaml(source,label),changes=[];
 function diff(a,b,keys=[]) {
  if(equal(a,b))return;
  if(map(a)&&map(b)){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],[...keys,key]);}
  else changes.push({keys,value:b});
 }
 diff(original,target);
 for(const {keys,value} of changes) {
  if(!keys.length||value===undefined)refuse(keys,value,'root replacement or deletion is unsupported');
  const nodes=index(source),node=nodes.get(JSON.stringify(keys)),eol=source.includes('\r\n')?'\r\n':'\n';
  if(node) {
   const prior=keys.reduce((v,k)=>v?.[k],original);
   if(Array.isArray(prior)&&Array.isArray(value)&&value.every(v=>!map(v)&&!Array.isArray(v))) {
    if(node.block) {
     const span=source.slice(node.offset,node.insert),lines=span.match(/[^\n]*\n|[^\n]+$/g)??[];
     // Keep owner comments, including inline sequence comments, while replacing only values.
     const comments=lines.slice(1).flatMap(line=>{const raw=line.replace(/\r?\n$/,''),at=punctuation(raw,'#');return at<0?[]:[' '.repeat(node.childIndent)+raw.slice(at)+eol];}).join('');
     source=source.slice(0,node.offset)+blockEntry(keys.at(-1),value,node.indent,eol,keys)+comments+source.slice(node.insert);
    }else {
     const start=node.offset+node.valueStart,end=node.offset+node.valueEnd;
     source=source.slice(0,start)+canonical(value)+source.slice(end);
    }
    continue;
   }
   if(node.block||map(value)||Array.isArray(value)||/^[|>]/.test(node.content.slice(node.valueStart)))refuse(keys,value,'value is not an editable scalar line');
   const start=node.offset+node.valueStart,end=node.offset+node.valueEnd;
   source=source.slice(0,start)+scalar(value,source.slice(start,end))+source.slice(end);
  }else {
   const parsed=parseYaml(source,label);
   if(keys.reduce((v,k)=>v?.[k],parsed)!==undefined)refuse(keys,value,'key is not an editable block entry');
   const parentKeys=keys.slice(0,-1),parent=nodes.get(JSON.stringify(parentKeys));
   if(parentKeys.length&&(!parent||!parent.block))refuse(keys,value,'parent is not a block mapping');
   const parentValue=parentKeys.reduce((v,k)=>v?.[k],parsed);
   if(!map(parentValue))refuse(keys,value,'parent is not a mapping');
   const at=parent?parent.insert:source.length,indent=parent?parent.childIndent:0;
   const entry=(at&&!source.slice(0,at).endsWith('\n')?eol:'')+blockEntry(keys.at(-1),value,indent,eol,keys);
   source=source.slice(0,at)+entry+source.slice(at);
  }
 }
 if(!equal(parseYaml(source,label),target))refuse(changes[0]?.keys??[],changes[0]?.value,'edited text does not match the requested configuration');
 return source;
}

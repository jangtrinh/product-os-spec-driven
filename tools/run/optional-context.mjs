import {selectFiles, matchesSelection, isOsJunk, isPreparedContextText, preparedContextIgnoreReason} from '../lib/config/path-selection.mjs';
export const optionalFiles=(root,stage)=>[...new Set((stage.optional_context ?? []).flatMap(pattern=>selectFiles(root,pattern,{optional:true,preparedText:true})))].sort();
const contextFolder=pattern=>pattern.replace(/\/\*\*\/?$/,'').replace(/\/\*$/,'').replace(/\/$/,'')||pattern;
function droppedFiles(root,pattern){return selectFiles(root,pattern,{optional:true}).filter(file=>!isPreparedContextText(file));}
export function ignoredContext(root,config) {
 const groups=new Map(),seenPatterns=new Set();
 for(const stage of Object.keys(config.stages))for(const pattern of config.stages[stage].optional_context??[]) {
  if(seenPatterns.has(pattern))continue;seenPatterns.add(pattern);
  const folder=contextFolder(pattern),group=groups.get(folder)??{folder,files:[],os_junk:0,seen:new Set()};groups.set(folder,group);
  for(const file of droppedFiles(root,pattern)) {
   if(group.seen.has(file))continue;group.seen.add(file);
   if(isOsJunk(file))group.os_junk+=1;else group.files.push({file,reason:preparedContextIgnoreReason(file)});
  }
 }
 return [...groups.values()].filter(group=>group.files.length||group.os_junk).map(({folder,files,os_junk})=>({folder,files:files.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0),os_junk}));
}
export function stageIgnoredContext(root,stage) {
 const seen=new Set(),files=[];
 for(const pattern of stage.optional_context??[])for(const file of droppedFiles(root,pattern)) {
  if(seen.has(file)||isOsJunk(file))continue;seen.add(file);files.push({file,reason:preparedContextIgnoreReason(file)});
 }
 return files.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
}
// Pure changes to external optional inputs affect their actual readers. Output,
// required-source and mixed changes still use the graph/conservative fallback.
export function onlyOptionalInputChanges(config,gates,stale) {
 return stale.every(({stage,changed})=>changed.every(file=>
  (config.stages[stage].optional_context ?? []).some(pattern=>matchesSelection(pattern,file)) &&
  !config.stages[stage].context.some(pattern=>matchesSelection(pattern,file)) &&
  [...gates.values()].every(gate=>!Object.hasOwn(gate.data.outputs,file))));
}

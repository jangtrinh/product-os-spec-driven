export const SCREEN_STATES = Object.freeze(['normal','empty','error','loading']);
const screenId=/^SCR-\d{3,}$/;
const cells=line=>line.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());
const ids=text=>text.match(/(?:US-(?:P\d+|\d+)|NF-\d+)(?:\.AC-\d+)?/g)??[];
// A small, explicit interchange grammar shared by lint and the prototype checks.
export function parseWireframes(text) {
 const screens=[],flows=[],states=[];let table='',current=null;
 for(const line of text.split('\n')) {
  const heading=/^## (Screens|Flows|Wireframes)\s*$/.exec(line);
  if(heading){table=heading[1];current=null;continue;}
  const state=/^### (SCR-\d{3,})--(normal|empty|error|loading)\s*$/.exec(line);
  if(state){current={screen:state[1],state:state[2],body:''};states.push(current);continue;}
  if(current){current.body+=line+'\n';continue;}
  if(!line.trim().startsWith('|'))continue;
  const row=cells(line);
  if(table==='Screens'&&screenId.test(row[0]))screens.push({id:row[0],title:row[1]??'',us:ids(row[2]??''),ac:ids(row[3]??'')});
  if(table==='Flows'&&/^(US-(?:P\d+|\d+)|NF-\d+)$/.test(row[0])) {
   const path=row[1]??'',steps=path.match(/SCR-\d{3,}/g)??[];
   const valid=/^SCR-\d{3,}(?:\s+--[^\n]+?-->\s+SCR-\d{3,})*$/.test(path)&&[...path.matchAll(/--(.*?)-->/g)].every(m=>m[1].trim().length>0);
   flows.push({us:row[0],path,steps,valid});
  }
 }
 return {screens,flows,states:states.map(row=>{
  const fences=[...row.body.matchAll(/```(?:text|ascii)?[^\S\n]*\n([\s\S]*?)\n```/g)];
  const na=/^N\/A:[^\S\n]*\S[^\n]*$/.test(row.body.trim());
  const invalidNa=/^N\/A:/m.test(row.body)&&!na;
  const ascii=fences.some(m=>/[+|]/.test(m[1]));
  return {...row,na,invalidNa,ascii};
 })};
}

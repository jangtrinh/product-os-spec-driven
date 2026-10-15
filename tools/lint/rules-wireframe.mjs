import fs from 'node:fs';
import {localPath} from '../lib/local-path.mjs';
import {parseWireframes,SCREEN_STATES} from '../lib/wireframe-model.mjs';

export function wireframeRules(model,P) {
 const file='wireframe/wireframes.md';
 if(!['wireframe','prototype'].includes(model.options?.stage)&&!model.spec.files.includes(file))return;
 const add=(code,message)=>P.add(code,file,1,message,'restore Screens, Flows and four ASCII states using templates/wireframe.md; copy source US/AC ids');
 let text;try{text=fs.readFileSync(localPath(model.spec.root,file),'utf8');}catch{add('W-INPUT',`missing ${file}`);return;}
 const wf=parseWireframes(text);model.wireframe=wf;
 const source=new Map(model.stories.map(s=>[s.doc.id,new Set(s.ac.rows.map(a=>`${s.doc.id}.${a.id}`))]));
 const index=model.docs.find(d=>d.rel==='us/INDEX.md');
 const indexed=new Set(index?.raw.match(/\b(?:US-(?:P\d+|\d+)|NF-\d+)\b/g)??[]);
 if(!index||!indexed.size)add('W-FLOW','US index is missing or has no story ids');
 const screens=new Map();
 if(!wf.screens.length)add('W-SCREEN','screen list is empty');
 for(const screen of wf.screens){
  if(screens.has(screen.id))add('W-SCREEN',`duplicate screen ${screen.id}`);screens.set(screen.id,screen);
  if(!screen.title||!screen.us.length||!screen.ac.length)add('W-TRACE',`${screen.id} needs title, US and AC ids`);
  for(const us of screen.us)if(!source.has(us))add('W-TRACE',`${screen.id} unknown US ${us}`);
  for(const ac of screen.ac){const us=ac.split('.')[0];if(!screen.us.includes(us)||!source.get(us)?.has(ac))add('W-TRACE',`${screen.id} unknown owning AC ${ac}`);}
 }
 const states=new Map();
 for(const row of wf.states){const key=`${row.screen}--${row.state}`;if(states.has(key)||!screens.has(row.screen))add('W-STATE',`duplicate or undeclared state ${key}`);states.set(key,row);if(row.invalidNa||!row.na&&!row.ascii)add('W-STATE',`${key} needs a boxed ASCII fence or exclusively N/A: reason`);}
 for(const id of screens.keys())for(const state of SCREEN_STATES)if(!states.has(`${id}--${state}`))add('W-STATE',`${id} missing ${state}`);
 for(const us of indexed)if(!source.has(us)||wf.flows.filter(f=>f.us===us).length!==1)add('W-FLOW',`${us} needs exactly one source-backed flow`);
 for(const flow of wf.flows){
  if(!indexed.has(flow.us)||!flow.valid||!flow.steps.length)add('W-FLOW',`${flow.us} invalid flow or missing transition action`);
  for(const id of flow.steps)if(!screens.get(id)?.us.includes(flow.us)||states.get(`${id}--normal`)?.na||!states.has(`${id}--normal`))add('W-FLOW',`${flow.us} has unknown or unavailable screen ${id}`);
 }
 // References anywhere in the artifact must resolve, including state captions and OPEN text.
 for(const id of text.match(/\b(?:US-(?:P\d+|\d+)|NF-\d+)(?:\.AC-\d+)?\b/g)??[]) {
  const [us,ac]=id.split('.');if(!source.has(us)||ac&&!source.get(us).has(id))add('W-TRACE',`unknown reference ${id}`);
 }
 const acIds=new Set(model.stories.flatMap(s=>s.ac.rows.map(a=>a.id)));
 for(const ac of text.match(/\bAC-\d+\b/g)??[])if(!acIds.has(ac))add('W-TRACE',`unknown AC reference ${ac}`);
}

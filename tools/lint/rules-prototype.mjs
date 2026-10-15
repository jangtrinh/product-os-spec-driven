import fs from 'node:fs';
import {localPath} from '../lib/local-path.mjs';
import {parsePrototype} from '../lib/prototype-model.mjs';
export function prototypeRules(model,P) {
 const file='prototype/index.html';
 if(model.options?.stage!=='prototype'&&!model.spec.files.includes(file))return;
 const add=(code,message)=>P.add(code,file,1,message,'restore offline sections, visible source ids and anchor navigation from start using templates/prototype.md');
 let raw;try{raw=fs.readFileSync(localPath(model.spec.root,file),'utf8');}catch{add('P-INPUT',`missing ${file}`);return;}
 const p=parsePrototype(raw),ids=new Set(p.ids),wf=model.wireframe;
 for(const error of p.elementErrors)P.add('P-ELEMENT',file,error.line,error.message,'use only the allowed element names and readonly/disabled control forms in templates/prototype.md');
 if(/https?:\/\/|\/\//i.test(p.html)||p.scripts||p.resources.length||/@import\b|(?:image|(?:-webkit-)?image-set)\s*\(/i.test(p.html))add('P-OFFLINE','external resource, script or non-anchor navigation; prototype must be self-contained');
 if(p.styleCount!==1)add('P-OFFLINE','prototype needs exactly one inline style element');
 if(ids.size!==p.ids.length)add('P-STATE','duplicate HTML id');
 for(const href of p.links)if(!href.startsWith('#')||!ids.has(href.slice(1)))add('P-ANCHOR',`unresolved anchor ${href}`);
 if(!p.sections.has('start'))add('P-FLOW','missing start section');
 if(!wf)return;
 const expected=new Set(wf.states.filter(s=>!s.na).map(s=>`${s.screen}--${s.state}`));
 for(const id of expected){
  const section=p.sections.get(id);if(!section){add('P-STATE',`missing section ${id}`);continue;}
  if(!section.frames)add('P-SCREEN',`${id} needs a screen frame element with class screen`);
  const screen=wf.screens.find(s=>id.startsWith(s.id+'--'));
  const tokens=new Set(section.text.match(/\b(?:US-(?:P\d+|\d+)|NF-\d+)(?:\.AC-\d+)?\b/g)??[]);
  // Qualified AC tokens also carry their US, but every section must show both explicitly.
  for(const ref of [...screen.us,...screen.ac])if(!tokens.has(ref))add('P-TRACE',`${id} does not show ${ref}`);
 }
 for(const id of p.sections.keys())if(/^SCR-/.test(id)&&!expected.has(id))add('P-STATE',`undeclared or N/A section ${id}`);
 const reachable=(from,to)=>{
  const seen=new Set(),queue=[from];while(queue.length){const next=queue.shift();if(next===to)return true;if(seen.has(next))continue;seen.add(next);for(const href of p.sections.get(next)?.links??[])if(href.startsWith('#'))queue.push(href.slice(1));}return false;
 };
 for(const flow of wf.flows){
  const route=['start',...flow.steps.map(id=>`${id}--normal`)];
  for(let i=1;i<route.length;i++)if(!reachable(route[i-1],route[i]))add('P-FLOW',`${flow.us} has no anchor path ${route[i-1]} to ${route[i]}`);
 }
 for(const id of expected)if(!reachable('start',id))add('P-FLOW',`state ${id} is unreachable from start`);
}

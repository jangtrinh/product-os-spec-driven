import { scenarioDetails } from './rules-scenario-details.mjs';
import fs from 'node:fs';
import { loadSchema } from '../lib/manifest.mjs';
import { validate } from '../lib/schema-lite.mjs';
import { localPath } from '../lib/local-path.mjs';
import { expandScenarios } from '../lib/structure.mjs';
import { outsideLines } from '../lib/markdown-outside.mjs';
import { parseTables } from '../lib/md.mjs';
import { openItems } from '../lib/markdown-prose.mjs';
export function scenarioRules(model,P) {
  const schema=loadSchema('front-matter.schema.json');model.unassigned=0;model.open={total:0,blocking:0,byUs:{}};
  for(const {doc:d,ac} of model.stories) {
    const add=(code,msg,line=2)=>P.add(code,d.rel,line,msg,'correct the scenario association in this US and its test or detail row');
    const scenarios=Array.isArray(d.fm.scenarios)?d.fm.scenarios:[],seen=new Set(),knownAc=new Set(ac.rows.map(r=>r.id));
    const covered=new Set();
    for(const s of scenarios) {
      for(const v of validate(s,schema.$defs.scenario,'',[],schema)) add('S-SCN-SCHEMA',`${v.path} ${v.message}`);
      if(!s || typeof s!=='object') continue;
      if(seen.has(s.id)) add('S-SCN-DUP',`duplicate scenario ${d.id}.${s.id}`);seen.add(s.id);
      if(!Array.isArray(s.ac) || !s.ac.length || new Set(s.ac).size!==s.ac.length || s.ac.some(a=>!knownAc.has(a))) add('S-SCN-AC',`${s.id} must cite unique local AC rows`);
      for(const a of Array.isArray(s.ac)?s.ac:[]) covered.add(a);
      if(['unassigned','not-built'].includes(s.method) && !['planned','blocked'].includes(s.status)) add('S-SCN-STATUS',`${s.id} ${s.method} cannot be ${s.status}`);
      if(s.method==='unassigned') {model.unassigned++;P.warn('W-SCN-UNASSIGNED',d.rel,2,`${d.id}.${s.id} has no reviewed verification method`,'assign a source-backed verification method before G3');}
      if(s.method==='auto') {
        try {
          const match=/^([^#]+)#([^#\r\n]+)$/.exec(s.test || '');
          if(!match || !match[2].trim() || /[*?]/.test(s.test)) throw new Error('test must be one relative-file#exact-name with no wildcard');
          const base=localPath(model.spec.root,model.manifest.tests_root),file=localPath(base,match[1]);
          const content=fs.readFileSync(file,'utf8');
          const literal=v=>new RegExp('(?<![\\p{L}\\p{N}_-])'+v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}_-])','u').test(content);
          if(!literal(s.id) || !literal(match[2])) throw new Error('test text lacks exact scenario id or exact name');
        }catch(e){add('S-SCN-TEST',`${s.id}: ${e.message}`);}
      }
    }
    for(const row of ac.rows) {
      if(!covered.has(row.id)) add('S-AC-SCENARIO',`${row.id} has no scenario`,row.line);
      for(const id of row.scn) if(!scenarios.some(s=>s?.id===id && s.ac?.includes(row.id))) add('S-US-SCENARIO',`${row.id} cites ${id} without that association`,row.line);
    }
    for(const [i,line] of outsideLines(d.body).entries()) for(const id of expandScenarios(line)) if(!scenarios.some(s=>s?.id===id)) add('S-US-SCENARIO',`${id} body reference has no owning front-matter scenario`,d.bodyLine+i);
    const items=openItems(d),blocking=items.filter(x=>x.blocking).length;
    model.open.byUs[d.id]={total:items.length,blocking,items};model.open.total+=items.length;model.open.blocking+=blocking;
    for(const item of items) {
      if(!item.text) P.add('O-OPEN-EMPTY',d.rel,item.line,'OPEN requires question text','write the unresolved question');
      if(item.blocking) P.add('O-OPEN-BLOCKING',d.rel,item.line,item.text || 'blocking OPEN','resolve the product question before G3');
    }
  }
  scenarioDetails(model,P);
}

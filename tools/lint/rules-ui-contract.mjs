import fs from 'node:fs';
import { parseTables } from '../lib/md.mjs';
import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
import { localPath } from '../lib/local-path.mjs';
import { parseJson } from '../lib/json-strict.mjs';
export const UI_HEADER=['Screen','Route','US','Element','Kind','SCN'];
export const UI_EXT=['Screen','State','Route','Roles','Scope','US','Element','Kind','Components','Patterns','Target','SCN'];
const list=v=>v==='—' || !v ? [] : v.split(',').map(x=>x.trim());
export function element(cell) {
  if(/^testid=/.test(cell)) return {test_id:cell.slice(7)};
  const m=/^role=([^;]+);\s*name=(.*)$/.exec(cell);
  return m ? {role:m[1].trim(),name:m[2].replace(/\\;/g,';')} : {};
}
export function uiRules(model,P) {
  const docs=model.ofType('ui-contract'),rows=[];
  const mode=model.manifest.ui_contract || 'optional';
  const add=(code,file,msg,line=1)=>P.add(code,file,line,msg,'correct the declared UI contract and source joins');
  const required=mode==='required' || model.options.designRequired;
  if(required && !docs.length) add('U-CONTRACT-REQUIRED','spec.manifest.json','UI contract is required at this checkpoint');
  const route=new Map(),selectors=new Set();
  for(const d of docs) {
    const tables=parseTables(d.body).filter(t=>t.header[0]==='Screen');
    if(!tables.length || tables.every(t=>!t.rows.length)) add('U-CONTRACT-SCHEMA',d.rel,'expected nonempty Screen | Route | US | Element | Kind | SCN table');
    for(const t of tables) {
      const extended=t.header.length===12;
      if(JSON.stringify(t.header)!==JSON.stringify(extended ? UI_EXT : UI_HEADER)) add('U-CONTRACT-SCHEMA',d.rel,'UI table header differs from fixed six/twelve-column grammar',d.bodyLine+t.line);
      if(model.options.designRequired && !extended) add('U-CONTRACT-DESIGN',d.rel,'enabled design requires all extension columns',d.bodyLine+t.line);
      for(const [i,c] of t.rows.entries()) {
        const r={screen:c[0],route:c[extended?2:1],us:list(c[extended?5:2]),element:element(c[extended?6:3] || ''),kind:c[extended?7:4],used_by:list(c[extended?11:5]),file:d.rel,line:d.bodyLine+t.rowLines[i]};
        if(extended) Object.assign(r,{state:c[1],roles:list(c[3]),scope:list(c[4]),components:list(c[8]),patterns:list(c[9]),target:c[10]});
        const value=Object.fromEntries(Object.entries(r).filter(([k])=>!['file','line'].includes(k)));
        for(const v of validate(value,loadSchema('ui-contract.schema.json'))) add('U-CONTRACT-SCHEMA',d.rel,`${v.path} ${v.message}`,r.line);
        if(c.length!==t.header.length) add(extended?'U-CONTRACT-DESIGN':'U-CONTRACT-SCHEMA',d.rel,'partial UI row',r.line);
        if(!((r.element.role?.trim() && r.element.name?.trim()) || r.element.test_id?.trim())) add('U-CONTRACT-SELECTOR',d.rel,'selector requires exact role/name or testid',r.line);
        if(route.has(r.screen) && route.get(r.screen)!==r.route) add('U-CONTRACT-SCREEN',d.rel,`${r.screen} route is inconsistent`,r.line);route.set(r.screen,r.route);
        const contexts=extended?r.roles.flatMap(role=>r.scope.map(scope=>[r.state,role,scope])):[[]];
        for(const context of contexts) {const key=JSON.stringify([r.screen,...context,r.element]);if(selectors.has(key)) add(extended?'U-CONTRACT-CONTEXT':'U-CONTRACT-SELECTOR',d.rel,'duplicate selector in screen/state/roles/scope',r.line);selectors.add(key);}
        for(const u of r.us) {const story=model.stories.find(s=>s.doc.id===u);if(!story || !story.doc.fm.screens?.includes(r.screen)) add('U-CONTRACT-US',d.rel,`${u} must exist and declare ${r.screen}`,r.line);}
        for(const s of r.used_by) if(!r.us.some(u=>model.stories.find(x=>x.doc.id===u)?.doc.fm.scenarios?.some(x=>x.id===s))) add('U-CONTRACT-SCN',d.rel,`${s} is absent from listed US`,r.line);
        rows.push(r);
      }
    }
  }
  model.uiRows=rows;
  const screens=new Set(model.stories.flatMap(s=>s.doc.fm.screens || []));
  for(const d of model.ofType('ux').filter(d=>d.fm.inventory)) for(const t of parseTables(d.body)) for(const c of t.rows) if(/^S\d{2}(-[a-z])?$/.test(c[0])) screens.add(c[0]);
  if(docs.length) {
    for(const s of screens) if(!rows.some(r=>r.screen===s)) add('U-CONTRACT-SCREEN',docs[0].rel,`declared screen ${s} has no row`);
    for(const {doc:d} of model.stories) for(const s of d.fm.scenarios || []) if(s.method==='auto') {
      if(d.fm.screens?.length && !rows.some(r=>r.us.includes(d.id) && r.used_by.includes(s.id))) add('U-CONTRACT-SCN',d.rel,`${d.id}.${s.id} has no UI selector`);
      if(!d.fm.screens?.length && !d.fm.no_ui) add('U-CONTRACT-SCN',d.rel,`${d.id}.${s.id} needs explicit no_ui reason`);
    }
  }
  if(mode==='legacy-absent') {
    try {
      if(docs.length || model.manifest.migrated_from!=='v1') throw new Error('legacy-absent requires v1 provenance and absent real contract');
      const r=parseJson(fs.readFileSync(localPath(model.spec.root,model.manifest.migration_report),'utf8'));
      if(!r || typeof r!=='object' || Array.isArray(r) || r.source_format!=='1' || !/^[a-f0-9]{64}$/.test(r.source_sha256)) throw new Error('invalid migration provenance');
      const s=r.ui_contract_missing_screens;
      if(!Array.isArray(s) || s.some(x=>!/^S\d{2}(-[a-z])?$/.test(x)) || new Set(s).size!==s.length || JSON.stringify([...s].sort())!==JSON.stringify([...screens].sort())) throw new Error('migration missing-screen inventory differs from declared screens');
      P.warn('W-UI-CONTRACT-LEGACY','spec.manifest.json',1,`legacy UI contract absent; ${screens.size} declared screens`,'author source-backed selectors and clear legacy-absent');
      if(model.options.designRequired) add('U-CONTRACT-REQUIRED','spec.manifest.json','new enabled design cannot use legacy-absent');
    }catch(e){add('M-MIGRATION','spec.manifest.json',e.message);}
  }
}

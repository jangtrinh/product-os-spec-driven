import fs from 'node:fs';
import { localPath } from '../lib/local-path.mjs';
import { parseJson } from '../lib/json-strict.mjs';
import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
import { sourceExists } from './rules-glossary.mjs';
import { hash } from '../lib/digests.mjs';
import { authorityRules } from './rules-authority.mjs';
import { inventoryRules } from './rules-inventory.mjs';
import { gateRules } from './rules-gate-model.mjs';
export function readPayload(model,P,file,schema,code) {
  try {
    const value=parseJson(fs.readFileSync(localPath(model.spec.root,file),'utf8'));
    for(const v of validate(value,loadSchema(`${schema}.schema.json`))) P.add(code,file,1,`${v.path} ${v.message}`,'correct the payload using the named v2 schema');
    return value;
  }catch(e){P.add(code,file || 'spec.manifest.json',1,e.message,'restore a readable local JSON payload');return null;}
}
export function designRules(model,P) {
  const add=(code,file,msg)=>P.add(code,file || 'spec.manifest.json',1,msg,'repair the declared design authority and its pinned source joins');
  for(const d of model.docs.filter(d=>['screen-inventory','change-set'].includes(d.type))) {
    const schema=d.type==='screen-inventory'?'screen-inventory':'change-set';
    const value=readPayload(model,P,d.fm.data,schema,'D-DATA');
    const sections=d.type==='screen-inventory'?['Screens and states','Flow and disclosure','Gaps and departures']:['Change and impact','Propagation and re-gates','Approval and receivers'];
    if(sections.some(s=>!d.body.split('\n').includes(`## ${s}`))) add('D-DATA',d.rel,'data document body lacks required sections');
    if(value && d.type==='screen-inventory') {model.inventory=value;model.inventoryDoc=d;}
  }
  const design=model.manifest.design;
  if(model.options.designRequired && !design) add('M-DESIGN','spec.manifest.json','enabled-design checkpoint requires profile/inventory');
  if(design) {
    model.profile=readPayload(model,P,design.profile,'design-profile','M-DESIGN');
    model.inventory=readPayload(model,P,design.inventory,'screen-inventory','DS-INVENTORY') || model.inventory;
    const profile=model.profile;
    if(profile) {
      const authority=new Set();let order=-1;
      const levels={identity:0,principle:1,ruling:1,contract:2,ds:3,copy:3,default:4};
      for(const a of profile.authority || []) {
        if(authority.has(a.id) || levels[a.kind]<order) add('DS-AUTHORITY',design.profile,'authority identity/order is ambiguous');authority.add(a.id);order=levels[a.kind];
        try{const file=localPath(model.spec.root,a.path);if(/^[a-f0-9]{64}$/.test(a.revision) && hash(fs.readFileSync(file))!==a.revision) throw new Error(`stale authority ${a.id}`);}catch(e){add('DS-AUTHORITY',design.profile,e.message);}
      }
      const tokens=profile.tokens;
      if(tokens) {
        if(tokens.generated?.includes(tokens.source) || JSON.stringify(tokens.generated)!==JSON.stringify([...(tokens.generated || [])].sort())) add('DS-TOKENS',design.profile,'token source must differ from sorted generated mirrors');
        for(const file of [tokens.source,...tokens.generated || []]) try{localPath(model.spec.root,file);}catch(e){add('DS-TOKENS',design.profile,e.message);}
      }
      for(const file of [...profile.inputs || [],profile.rubrics?.core,...profile.rubrics?.adapter || []]) if(file) try{localPath(model.spec.root,file);}catch(e){add('DS-AUTHORITY',design.profile,e.message);}
      model.copyCatalogs={};model.catalogs=[];
      for(const c of profile.catalogs || []) {
        try {
          const file=localPath(model.spec.root,c.path),bytes=fs.readFileSync(file),value=parseJson(bytes.toString());
          if(/^[a-f0-9]{64}$/.test(c.revision) && hash(bytes)!==c.revision) add(c.kind==='copy'?'DS-COPY':'DS-CATALOG',c.path,'catalog revision digest differs');
          if(c.kind==='copy') {
            for(const v of validate(value,loadSchema('copy-catalog.schema.json'))) add('DS-COPY',c.path,`${v.path} ${v.message}`);
            if(value.locale!==c.locale || !profile.locales?.includes(c.locale)) add('DS-COPY',c.path,'copy locale disagrees with profile');
            const entries=model.copyCatalogs[c.locale] ||= {};
            for(const [k,v] of Object.entries(value.entries || {})) {if(entries[k]!==undefined && entries[k]!==v) add('DS-COPY',c.path,`conflicting source key ${k}`);entries[k]=v;}
          } else {
            for(const v of validate(value,loadSchema('ds-catalog.schema.json'))) add('DS-CATALOG',c.path,`${v.path} ${v.message}`);
            if(value.kind!==c.kind || value.adapter!==c.id || new Set((value.items || []).map(x=>x.handle)).size!==(value.items || []).length) add('DS-CATALOG',c.path,'catalog kind/adapter/unique handles must match declaration');
            model.catalogs.push({declaration:c,value});
          }
        }catch(e){add(c.kind==='copy'?'DS-COPY':'DS-CATALOG',c.path,e.message);}
      }
      for(const e of model.glossaryEntries || []) {
        if(!profile.locales?.includes(e.locale) || e.source_key && model.copyCatalogs[e.locale]?.[e.source_key]===undefined) add('DS-COPY',e.doc.rel,`undeclared locale/source key ${e.locale}/${e.source_key || ''}`);
        for(const text of [e.term,e.definition,e.banned,e.replacement].filter(Boolean)) if(text.normalize('NFC')!==text) add('DS-COPY',e.doc.rel,'copy text must preserve NFC spelling');
      }
      for(const receipt of design.evidence || []) {const value=readPayload(model,P,receipt,'evidence-receipt','Q-RECEIPT');if(value?.execution?.result==='PASS' && value.domain==='visual' && (profile.capabilities || []).some(c=>c.status!=='available' && /browser|visual/.test(c.id))) add('DS-CAPABILITY',receipt,'visual PASS with missing/unverified browser capability');}
    }
    if(design.sources) {
      const sources=readPayload(model,P,design.sources,'design-sources','DS-SIDECAR');model.designSources=sources;
      for(const [file,sha] of Object.entries(sources?.inputs || {})) try{if(hash(fs.readFileSync(localPath(model.spec.root,file)))!==sha) add('DS-SIDECAR',design.sources,`source input digest changed: ${file}`);}catch(e){add('DS-SIDECAR',design.sources,e.message);}
      const ids=new Set();for(const e of sources?.entries || []) {
        if(ids.has(e.id) || e.freshness==='CURRENT' && e.status!=='active') add('DS-SIDECAR',design.sources,'duplicate id or inactive CURRENT source');ids.add(e.id);
        if(e.tool.toLowerCase()==='figma' && !e.locator?.node_id) add('DS-SIDECAR',design.sources,'Figma frame source needs node_id in generated sidecar');
        if(e.snapshot) try{localPath(model.spec.root,e.snapshot);}catch(err){add('DS-SIDECAR',design.sources,err.message);}
      }
    }
  }
  for(const d of model.docs.filter(d=>!['intake','review','build'].includes(d.type))) if(/https?:\/\/(?:www\.)?figma\.com\/(?:design|file)|\b(?:node_id|file_key)\s*[:|=]|canvas\s+(?:node|frame|component)\s+count\s*[:|=]/i.test(d.raw)) add('DS-CURATED',d.rel,'current locator/count inventory belongs only in generated sidecar');
  for(const board of model.boardFiles) {
    const base=board.file.replace(/\.(?:png|html)$/,'').replace('/png/','/').replace('/html/','/');
    if(!model.boardFiles.some(b=>b.kind!==board.kind && b.file.replace(/\.(?:png|html)$/,'').replace('/png/','/').replace('/html/','/')===base)) add('DS-BOARD',board.file,'HTML/PNG board basenames must match');
  }
  inventoryRules(model,P);gateRules(model,P);authorityRules(model,P);
}

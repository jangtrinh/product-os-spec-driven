import fs from 'node:fs';
import { localPath } from '../lib/local-path.mjs';
import { parseJson } from '../lib/json-strict.mjs';
import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
export function authorityRules(model,P) {
  const items=[],add=(file,message)=>P.add('DS-AUTHORITY',file,1,message,'resolve scoped ruling precedence against the binding source');
  for(const a of model.profile?.authority || []) if(a.kind==='ruling') {
    try {
      const payload=parseJson(fs.readFileSync(localPath(model.spec.root,a.path),'utf8'));
      for(const v of validate(payload,loadSchema('rulings-index.schema.json'))) add(a.path,`${v.path} ${v.message}`);
      for(const r of payload.items || []) {
        if(items.some(x=>x.id===r.id)) add(a.path,`duplicate ruling ${r.id}`);
        items.push({...r,file:a.path});
        const [rel,fragment]=r.text_ref.split('#');localPath(model.spec.root,rel);
        if(fragment && !model.docs.some(d=>d.rel===rel && d.body.includes(fragment))) add(a.path,`ruling text fragment unavailable: ${r.text_ref}`);
      }
    }catch(e){add(a.path,e.message);}
  }
  for(const r of items) {
    for(const id of r.supersedes || []) {
      const old=items.find(x=>x.id===id);
      if(!old || old.subject!==r.subject || old.scope!==r.scope || old.date>r.date) add(r.file,`superseded ruling does not resolve in scope/date: ${id}`);
      if(old?.non_waivable && model.records?.exceptions.some(e=>e.value.id===r.id || e.value.id===id)) add(r.file,'non-waivable ruling superseded by an exception');
    }
    for(const other of items) if(r.id<other.id && r.status==='active' && other.status==='active' && r.subject===other.subject && r.scope===other.scope && !r.supersedes?.includes(other.id) && !other.supersedes?.includes(r.id)) add(r.file,`unresolved active scoped rulings: ${r.id}, ${other.id}`);
  }
}

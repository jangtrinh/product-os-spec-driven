import { documentAnchors } from '../lib/document-anchors.mjs';
import fs from 'node:fs';
import { glossaryRow } from '../lib/glossary-table.mjs';
import { parseTables,headings } from '../lib/md.mjs';
import { slug } from '../lib/slug.mjs';
import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
import { parseJson } from '../lib/json-strict.mjs';
import { proseLines } from '../lib/markdown-prose.mjs';
import { resolveTarget } from '../lib/resolve.mjs';
import { localPath } from '../lib/local-path.mjs';
import path from 'node:path';
/* "<file> §<n>[, §<n>]": a frozen citation of an original source kept outside the bundle (format F4 "cited original source").
   The cited file must exist inside the project root (the parent of the spec root); an absent or escaping path is still unresolved. */
const CITATION=/^([A-Za-z0-9][\w./-]*)\s+§\s*\d[\d.]*(?:\s*,\s*§?\s*\d[\d.]*)*$/;
function citedFileExists(model,text) {
  const m=CITATION.exec(text);if(!m) return false;
  try{return fs.statSync(localPath(model.options?.projectRoot ?? path.dirname(model.spec.root),m[1])).isFile();}catch{return false;}
}
const TERM=['Term','Anchor','Definition','Source'],BAN=['Banned','Replacement','Reason'],EXT=['Locale','Source key','Retained terms','Exceptions'];
export const normalize=v=>v.normalize('NFC').toLowerCase().replace(/\s+/g,' ');
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function sourceExists(model,doc,text) {
  if(/^https?:\/\//.test(text)) return true;
  if(/^D\d+$/.test(text)) return model.decisions.some(d=>d.id===text);
  if(/^([\w-]+\.)?A-\d+$/.test(text)) return model.withAmend.some(x=>x.amend.items.some(a=>a.id===text || `${x.doc.id}.${a.id}`===text));
  if(citedFileExists(model,text)) return true;
  if(!/[/.#]/.test(text) && model.manifest.design?.profile)try{const profile=parseJson(fs.readFileSync(localPath(model.spec.root,model.manifest.design.profile),'utf8'));for(const a of profile.authority || [])if(a.kind==='ruling'){const index=parseJson(fs.readFileSync(localPath(model.spec.root,a.path),'utf8'));if(index.items?.some(r=>r.id===text))return true;}}catch{return false;}
  const target=/\]\(([^)]+)\)/.exec(text)?.[1] || text;
  const r=resolveTarget(doc.rel,target);
  if(r.kind==='outside' || r.kind==='external') return false;
  try{localPath(model.spec.root,r.rel);}catch{return false;}
  if(!r.frag) return true;
  const d=model.docs.find(d=>d.rel===r.rel);
  return !!d && documentAnchors(d,model.glossaryEntries || []).has(r.frag);
}
export function glossaryRules(model,P) {
  const selected=model.manifest.glossary || {},entries=[];model.glossaryEntries=entries;
  const defaultLocale=model.manifest.language?.match(/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*/)?.[0] || 'vi';
  const add=(code,d,msg,line=1)=>P.add(code,d?.rel || 'spec.manifest.json',line,msg,'repair the declared glossary using format/glossary-grammar.md');
  for(const [kind,file] of Object.entries(selected)) {
    const d=model.docs.find(d=>d.rel===file);
    if(!d || kind==='document' && d.type!=='glossary' || kind==='context' && (d.type!=='note' || d.rel!=='CONTEXT.md')) {add('G-GLOSSARY',d,`${kind} ${file} is missing or has wrong type/location`);continue;}
    if(kind==='context') {
      for(const [i,line] of d.body.split('\n').entries()) {
        const m=/^- \*\*([^*]+)\*\*:\s*(.*?)\s*_Source_:\s*(.*?)(?:\s*_Avoid_:\s*(.*))?$/.exec(line);
        if(/_Avoid_|_Source_/.test(line) && !m) {add('G-GLOSSARY',d,'invalid CONTEXT entry',d.bodyLine+i);continue;}
        if(!m) continue;
        entries.push({term:m[1].trim(),anchor:slug.slugify(m[1]),definition:m[2].trim(),source:m[3].trim().replace(/\.$/,''),locale:defaultLocale,retained_terms:[],exceptions:[],doc:d,line:d.bodyLine+i});
        if(m[4]) for(const item of m[4].replace(/\.$/,'').split(';')) {
          const pair=item.split('->');
          if(pair.length!==2 || pair.some(x=>!x.trim())) add('G-ENTRY',d,'every _Avoid_ phrase needs a replacement',d.bodyLine+i);
          else entries.push({banned:pair[0].trim(),replacement:pair[1].trim(),reason:`CONTEXT term ${m[1]}`,locale:defaultLocale,retained_terms:[],exceptions:[],doc:d,line:d.bodyLine+i});
        }
      }
    } else {
      const tables=parseTables(d.body);
      for(const [head,keys,section] of [[TERM,['term','anchor','definition','source'],'Terms'],[BAN,['banned','replacement','reason'],'Ban list']]) {
        const table=tables.find(t=>t.heading===section && JSON.stringify(t.header)===JSON.stringify(head)) || tables.find(t=>t.heading===section && JSON.stringify(t.header)===JSON.stringify([...head,...EXT]));
        if(!table) {add('G-GLOSSARY',d,`missing exact ## ${section} table`);continue;}
        if(!table.rows.length && !/no .*declared|not .*declared|no terms|no ban/i.test(d.body)) add('G-GLOSSARY',d,'empty glossary must state that source declared no terms/bans');
        for(const [i,parsed] of table.rows.entries()) {
          let row;try{row=glossaryRow(d.body.split('\n')[table.rowLines[i]]);}catch(e){add('G-ENTRY',d,e.message,d.bodyLine+table.rowLines[i]);continue;}
          const line=d.bodyLine+table.rowLines[i],e={locale:defaultLocale,retained_terms:[],exceptions:[],doc:d,line};
          if(row.length!==table.header.length) {add('G-ENTRY',d,'wrong glossary column count',line);continue;}
          keys.forEach((k,j)=>e[k]=row[j].trim());
          if(table.header.length>head.length) {
            const pos=head.length; e.locale=row[pos]==='—'?defaultLocale:row[pos];
            try{Intl.getCanonicalLocales(e.locale);}catch{add('DS-COPY',d,`unknown locale ${e.locale}`,line);}
            if(row[pos+1]!=='—') e.source_key=row[pos+1];
            try {e.retained_terms=parseJson(row[pos+2]);e.exceptions=parseJson(row[pos+3]);}catch(err){add('G-ENTRY',d,err.message,line);add('DS-COPY',d,'malformed locale exceptions/retained terms',line);}
          }
          entries.push(e);
        }
      }
    }
  }
  const seen=new Map(),anchors=new Set();
  for(const e of entries) {
    const value=Object.fromEntries(Object.entries(e).filter(([k])=>!['doc','line'].includes(k)));
    for(const v of validate(value,loadSchema('glossary.schema.json'))) add('G-ENTRY',e.doc,`${v.path} ${v.message}`,e.line);
    const key=[e.locale,e.term?'term':'ban',normalize(e.term || e.banned)].join(':');
    if(seen.has(key) || e.anchor && anchors.has(e.anchor)) add('G-DUP',e.doc,'duplicate preferred term/anchor/ban across sources',e.line);seen.set(key,e);if(e.anchor) anchors.add(e.anchor);
    if(e.source && !sourceExists(model,e.doc,e.source)) add('G-TERM-REF',e.doc,`unresolved term source ${e.source}`,e.line);
    for(const x of Array.isArray(e.exceptions)?e.exceptions:[]) if(!x || !x.reason || !x.source || !sourceExists(model,e.doc,x.source)) add('DS-COPY',e.doc,'exception requires real reason/source',e.line);
  }
  for(const d of model.docs.filter(d=>!['glossary'].includes(d.type) && !Object.values(selected).includes(d.rel))) {
    const prose=proseLines(d.body);
    for(const e of entries.filter(e=>e.banned && e.locale===defaultLocale)) {
      const pattern=new RegExp(`(?<![\\p{L}\\p{N}_])${escape(normalize(e.banned))}(?![\\p{L}\\p{N}_])`,'u');
      prose.forEach((line,i)=>{const text=normalize(line.replace(/(!?\[[^\]]*\])\([^)]*\)/g,'$1').replace(/<[^>]+>/g,''));if(pattern.test(text) && !(e.exceptions || []).some(x=>x.text===e.banned && sourceExists(model,e.doc,x.source) && (d.fm.trace?.decisions?.includes(x.source) || resolveTarget(e.doc.rel,x.source).rel===d.rel) && line.includes(x.text))) P.add('D-TERMS',d.rel,d.bodyLine+i,`banned wording ${e.banned}; source ${e.doc.rel}:${e.line}; replacement ${e.replacement}` ,`use ${e.replacement}`);});
    }
  }
}

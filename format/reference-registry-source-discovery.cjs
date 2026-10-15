'use strict';
const fs=require('node:fs'), path=require('node:path'), {createHash}=require('node:crypto');
const parse=require('./reference-registry-json.cjs');
const corpus=['../SPEC.md','SPEC-FORMAT-v2.md','design-model.md','glossary-grammar.md','packet-interchange.md'];
const hash=s=>createHash('sha256').update(s).digest('hex');
function discover(root, demand) {
  const sites=new Map(), declarations=[], declared=new Set();
  function add(key,value){demand(!sites.has(key),'duplicate normative declaration '+key);sites.set(key,value);}
  for(const file of corpus) {
    let text=fs.readFileSync(path.join(root,file),'utf8');
    if(file==='../SPEC.md')text=text.split('## 5. Vai trò và cấu hình\n')[1].split('\n## 6.')[0];
    let fence=null, block=[], heading='', occurrences=new Map();
    for(const line of text.split('\n')) {
      if(/^```/.test(line)) {
        if(!fence){fence=line.slice(3).trim();block=[];continue;}
        if(fence==='spec-grammar') {
          const rows=parse(block.join('\n'));
          demand(Array.isArray(rows),'invalid source grammar '+file);
          for(const row of rows) {
            demand(Object.keys(row).sort().join(',')==='doc_type,location','unknown source declaration key '+file);
            const identity=JSON.stringify([row.doc_type,row.location]);
            demand(!declared.has(identity),'duplicate source grammar '+identity);declared.add(identity);
            const key='grammar:'+file+':'+identity;
            add(key,{kind:'grammar',...row});declarations.push({key,file,...row});
          }
        }
        fence=null;continue;
      }
      if(fence==='spec-grammar'){block.push(line);continue;}
      if(/^#{1,6} /.test(line))heading=line;
      if(!line.trim())continue;
      // Every source statement is accounted for, even prose-only declarations.
      // A statement hash pins review, not semantics; new/changed prose fails closed.
      const digest=hash(line.trim()), occurrence=occurrences.get(digest)||0;
      occurrences.set(digest,occurrence+1);
      add('statement:'+file+':'+digest+':'+occurrence,{kind:'statement',heading});
      for(const [i,m] of [...line.matchAll(/`([^`]+)`/g)].entries()) {
        add('token:'+file+':'+digest+':'+occurrence+':'+i,{kind:'token',text:m[1]});
        if(m[1].includes(' | '))m[1].split(' | ').forEach((column,j)=>
          add('column:'+file+':'+digest+':'+occurrence+':'+i+':'+j,{kind:'column',text:column}));
      }
      if(fence==='yaml')for(const [i,m]of [...line.matchAll(/(?:^\s*(?:- )?|[{,]\s*)([a-zA-Z_][a-zA-Z0-9_.-]*):/g)].entries())
        add('field:'+file+':'+digest+':'+occurrence+':'+i,{kind:'field',text:m[1]});
      if(fence==='json')for(const [i,m]of [...line.matchAll(/"([^"\\]+)"\s*:/g)].entries())
        add('field:'+file+':'+digest+':'+occurrence+':'+i,{kind:'field',text:m[1]});
      if(/^\|.+\|$/.test(line) && !/^\|[-: |]+\|$/.test(line))
        line.split(/(?<!\\)\|/).slice(1,-1).forEach((cell,i)=>
          add('cell:'+file+':'+digest+':'+occurrence+':'+i,{kind:'column-or-field',text:cell.trim()}));
    }
    demand(!fence,'unterminated source fence '+file);
  }
  return {sites,declarations};
}
function audit(root,entries,demand) {
  const {sites,declarations}=discover(root,demand), classifications=new Map();
  const dir=path.join(root,'reference-registry-source-classifications');
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort())
    for(const [key,classification] of parse(fs.readFileSync(path.join(dir,file),'utf8'))) {
      demand(!classifications.has(key),'duplicate normative classification '+key);
      classifications.set(key,classification);
    }
  for(const [key,site]of sites) {
    const c=classifications.get(key);
    demand(c,'unclassified normative location '+key);
    if(!c)continue;
    demand(['prose-review-boundary','human-label','reference','non-reference'].includes(c.category),'unknown normative classification '+key);
    demand(Object.keys(c).every(k=>['category','entry'].includes(k)),'unknown classification key '+key);
    if(site.kind==='grammar') {
      demand(['reference','non-reference'].includes(c.category),'unclassified grammar semantics '+key);
      if(c.category==='reference') {
        const e=entries.get(c.entry);
        demand(e && e.doc_type===site.doc_type && JSON.stringify(e.location)===JSON.stringify(site.location),
          'source-derived binding mismatch '+(c.entry || key));
      }else demand(!c.entry,'non-reference registry binding '+key);
    }else demand(!c.entry,'prose is not an extraction declaration '+key);
  }
  for(const key of classifications.keys())demand(sites.has(key),'stale normative classification '+key);
  for(const e of entries.values())if(!e.schema) {
    const matches=declarations.filter(d=>d.doc_type===e.doc_type && JSON.stringify(d.location)===JSON.stringify(e.location));
    demand(matches.length===1, 'missing source-derived grammar '+e.id);
    if(matches.length===1) {
      const c=classifications.get(matches[0].key);
      demand(c?.category==='reference' && c.entry===e.id,
        'source classification contradicts registry binding '+e.id);
    }
  }
  return {sites,declarations};
}
module.exports={corpus,discover,audit};

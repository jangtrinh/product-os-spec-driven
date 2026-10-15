import path from 'node:path';
import { parseTables,headings,strip } from '../lib/md.mjs';
import { realDate } from '../lib/schema-lite.mjs';
import { parseAmendments } from '../lib/structure.mjs';
import { STAGES } from '../lib/config/config-loader.mjs';
import { stageOwningFolder } from './stage-output-owner.mjs';
export function additionalRules(model,P) {
  const add=(code,d,msg,line=d.bodyLine)=>P.add(code,d.rel,line,msg,'repair the owning document using format/SPEC-FORMAT-v2.md');
  for(const d of model.docs) {
    const types={'epic':['us'],priority:['us'],wave:['us'],screens:['us'],boards:['us'],scenarios:['us'],no_ui:['us'],inventory:['ux'],board_names:['wireframe-index'],ledger:['decisions'],topics:['decisions'],amendments:['contract'],primary:['prd','contract'],data:['screen-inventory','change-set']};
    for(const [k,allowed] of Object.entries(types)) if(Object.hasOwn(d.fm,k) && !allowed.includes(d.type)) add('D-FIELD-TYPE',d,`${k} is not allowed on ${d.type}`,2);
    const required={us:['epic','trace.req','scenarios'],'screen-inventory':['data'],'change-set':['data']};
    for(const k of required[d.type] || []) {const v=k.split('.').reduce((x,p)=>x?.[p],d.fm);if(v==null || v==='' || Array.isArray(v)&&!v.length) add('D-FIELD-REQUIRED',d,`missing ${k}`,2);}
    if(d.type==='ui-contract' && (d.folder!=='ux' && d.artifact?.id!=='ux')) add('D-PLACEMENT',d,'ui-contract must be in the UX artifact folder');
    if(d.type==='glossary' && d.folder && d.folder!=='decisions' && d.artifact?.id!=='decisions') add('D-PLACEMENT',d,'glossary must be at root or decisions artifact');
    if(d.type==='prd') {
      const tables=parseTables(d.body).filter(t=>/^ID$/i.test(t.header[0]) && t.rows.some(r=>/^REQ-\d+$/.test(r[0])));
      if(!tables.length || tables.some(t=>t.header.length<3 || !/requirement|yêu cầu/i.test(t.header[1]) || !/source|nguồn/i.test(t.header[2]) || t.rows.some(r=>r.slice(0,3).some(c=>!c)))) add('S-PRD-REQ',d,'REQ table needs ID, Requirement, Source and complete rows');
    }
    if(d.type==='us') {
      const hs=headings(d.body).filter(h=>h.level===2 && /^\d+[.\-:\s]/.test(h.text));
      const nums=hs.map(h=>Number(h.text.match(/^\d+/)[0]));
      if(JSON.stringify(nums)!=='[1,2,3,4,5,6]') add('S-US-SECTION',d,'story sections must occur exactly once in order 1..6');
      hs.forEach((h,i)=>{const block=d.body.split('\n').slice(h.line+1,hs[i+1]?.line).join('\n');if(!block.trim() || nums[i]===2 && !/```mermaid\s*\n(?:flowchart|graph)\s+[\s\S]*?```/.test(block)) add('S-US-SECTION',d,`section ${nums[i]} needs content${nums[i]===2?' and Flow Mermaid':''}`,d.bodyLine+h.line);});
      const story=model.stories.find(s=>s.doc===d),t=story?.ac;
      if(t?.found && !t.problem && !/^(id|ac)$/i.test(t.header[0])) add('S-US-AC-COLUMNS',d,'AC table must start with ID or AC',t.line);
      const acTable=parseTables(d.body).find(x=>/^4[.\-:\s]/.test(x.heading));
      for(const row of acTable?.rows || []) if(/^AC-/.test(row[0]) && (row.length!==acTable.header.length || row.some(x=>!x.trim()))) add('S-US-AC-ROW',d,'every AC cell must be nonempty');
    }
    for(const ref of d.fm.trace?.ac || []) if(!ref.includes('.') && !(d.type==='us' && model.stories.find(s=>s.doc===d)?.ac.rows.some(r=>r.id===ref))) add('S-TRACE-AC',d,`bare ${ref} has no owning story`);
    for(const ref of d.fm.trace?.amendments || []) if(ref.includes('.')) {
      const pos=ref.lastIndexOf('.'),owner=model.contractDocs.find(c=>c.id===ref.slice(0,pos));
      if(!owner || !parseAmendments(owner).items.some(a=>a.id===ref.slice(pos+1))) add('S-TRACE-AMENDMENT',d,`unknown qualified amendment ${ref}`);
    }
    for(const table of parseTables(d.body)) {
      for(const [i,header] of table.header.entries()) if(/^(person|by|approved by|owner email|author|approver)$/i.test(header)) for(const [j,row] of table.rows.entries()) if(row[i] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$|^(PO|QC|QA|Dev|Developer|Reviewer|Designer|Owner|Lead|Stakeholder|Everyone)$/i.test(strip(row[i]))) add('D-PERSON',d,`${header} must be an email or role`,d.bodyLine+table.rowLines[j]);
    }
  }
  for(const d of model.ofType('us-index')) {
    const tables=parseTables(d.body),rows=tables.flatMap(t=>t.rows.filter(r=>/(?:US-(?:P?\d+)|NF-\d+)/.test(r[0])).map(r=>({id:r[0].match(/(?:US-(?:P?\d+)|NF-\d+)/)[0],req:r.join(' ').match(/REQ-\d+/g)||[]})));
    const ids=rows.map(r=>r.id),want=model.stories.map(s=>s.doc.id);
    if(ids.length!==want.length || new Set(ids).size!==ids.length || want.some(id=>!ids.includes(id)) || rows.some(r=>JSON.stringify([...new Set(r.req)].sort())!==JSON.stringify([...(model.stories.find(s=>s.doc.id===r.id)?.doc.fm.trace?.req || [])].sort()))) add('S-US-INDEX',d,'index story set or REQ association differs from stories');
  }
  /* Stories are produced by the stage whose prompt declares spec/us/ output; before that stage runs, the PRD US column has nothing to be compared with. */
  const storiesOwner=stageOwningFolder('us'),storiesPending=!model.stories.length && model.options?.stage && storiesOwner && STAGES.indexOf(model.options.stage)<STAGES.indexOf(storiesOwner);
  for(const req of model.reqs) if(req.us && !storiesPending) {const actual=model.stories.filter(s=>s.doc.fm.trace?.req?.includes(req.id)).map(s=>s.doc.id).sort();if(JSON.stringify([...new Set(req.us)].sort())!==JSON.stringify(actual)) add('S-US-INDEX',req.doc,`${req.id} PRD US column disagrees with trace.req`,req.line);}
  for(const {doc:d,amend} of model.withAmend) {
    for(const a of amend.items) {
      if(!realDate(a.date) || !a.title || !a.round || !model.decisions.some(x=>x.id===a.decision)) add('S-AMENDMENT-HEADING',d,`${a.id} needs real date/source/title/decision`,a.line);
      const ids=new Set();for(const r of a.rows) {if(ids.has(r.id) || !r.change || !r.detail) add('S-AMENDMENT-ROWS',d,`${r.id} duplicate or incomplete`,r.line);ids.add(r.id);
        const refs=(r.cells?.[2] || '').split(/[,;]\s*/).filter(Boolean);
        const known=new Set([...model.docs.map(x=>x.id),...model.reqs.map(x=>x.id),...model.decisions.map(x=>x.id),...parseTables(d.body).flatMap(t=>t.rows.map(row=>strip(row[0]))),...model.docs.flatMap(x=>parseTables(x.body).flatMap(t=>t.rows.map(row=>x.id+'.'+strip(row[0]))))]);
        for(const ref of refs){const ac=/^((?:US-(?:P?\d+)|NF-\d+))\.(AC-\d+)$/.exec(ref);if(ac?!model.stories.some(s=>s.doc.id===ac[1] && s.ac.rows.some(a=>a.id===ac[2])):!known.has(ref))add('S-AMENDMENT-ROWS',d,`affected reference does not resolve: ${ref}`,r.line);}
      }
    }
    const log=parseTables(d.body).find(t=>/^Version$/i.test(t.header[0]));
    if(amend.items.length && (!log || !log.header.some(h=>/date|ngày/i.test(h)) || !log.header.some(h=>/why|change|thay đổi/i.test(h)) || !log.header.some(h=>/approv|decision|quyết định/i.test(h)) || !amend.changes.length || amend.changes.some(c=>!realDate(c.date)||!c.version||!c.why||!c.approved))) add('S-CHANGELOG',d,'amendments need complete change log with real dates');
    for(const a of d.fm.amendments || []) if(!amend.items.some(x=>x.id===a.id)) add('S-AMENDMENT-SUMMARY',d,`missing amendment ${a.id}`);
  }
  const screens=new Set(model.uiRows?.map(r=>r.screen) || []);
  for(const d of model.ofType('ux').filter(d=>d.fm.inventory)) for(const t of parseTables(d.body)) for(const r of t.rows) if(/^S\d{2}(-[a-z])?$/.test(r[0])) screens.add(r[0]);
  if(model.ofType('ux').some(d=>d.fm.inventory) || model.ofType('ui-contract').length) for(const {doc:d} of model.stories) for(const s of d.fm.screens || []) if(!screens.has(s) && !model.ofType('ui-contract').some(c=>parseTables(c.body).some(t=>t.rows.some(r=>r[0]===s)))) add('S-SCREEN',d,`screen ${s} has no inventory or contract`);
}

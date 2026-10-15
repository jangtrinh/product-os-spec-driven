import {definitionRevision,contentScope} from '../lib/definition-scope.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { canonical,digest,hash } from '../lib/digests.mjs';
import { targetArtifactsMatch } from './record-targets.mjs';
import { eligibleCurrentReceipts,reviewReceipts } from './current-receipts.mjs';
import { localPath } from '../lib/local-path.mjs';
export function membershipRules(model,P,file,membership,scope,pins,definition) {
  const add=(code,message)=>P.add(code,file,1,message,'regenerate membership and scope from the exact current artifact bytes');
  const members=membership?.members || [], selected=members.filter(m=>m.kind===scope?.kind && scope.ids?.includes(m.id)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  if(digest(membership)!==pins?.manifest) add('Q-HANDOFF-PINS','candidate manifest digest differs');
  if(selected.length!==scope?.ids?.length || (definition?definitionRevision({...definition,scope}):digest(selected))!==scope?.revision || new Set(members.map(m=>`${m.kind}:${m.id}`)).size!==members.length) add('Q-SCOPE','enumerated scope/revision differs from unique candidate membership');
  for(const m of members) {
    if(['ac','us'].includes(m.kind) && !targetArtifactsMatch(model,m.artifacts,m.kind,m.id))add('Q-SCOPE',`member lacks original target source bytes: ${m.id}`);
    if(m.revision!==digest(m.artifacts)) add('Q-SCOPE',`member revision differs: ${m.id}`);
    if(m.kind==='ac' && !model.stories.some(s=>s.ac.rows.some(a=>`${s.doc.id}.${a.id}`===m.id)) && !model.contractDocs.some(d=>m.id.startsWith(d.id+'.') && new RegExp('\\|\\s*'+m.id.slice(d.id.length+1)+'\\s*\\|').test(d.body))) add('Q-SCOPE',`unknown qualified AC: ${m.id}`);
    if(m.kind==='us' && !model.stories.some(s=>s.doc.id===m.id)) add('Q-SCOPE',`unknown US: ${m.id}`);
    for(const [rel,sha] of Object.entries(m.artifacts || {})) try {if(hash(fs.readFileSync(localPath(model.spec.root,rel)))!==sha) add('Q-FRESHNESS',`changed member bytes: ${rel}`);}catch(e){add('Q-FRESHNESS',e.message);}
  }
}
export function lineageRules(model,P,records,events) {
  const add=(code,file,message)=>P.add(code,file,1,message,'restore exact candidate membership and persisted round lineage');
  for(const {file,value:g} of records.gates) {
    const name=path.basename(file,'.json');
    const candidate=records.candidates.find(c=>path.basename(c.file,'.json')===g.candidate?.manifest);
    if(!candidate) add('Q-HANDOFF-PINS',file,'candidate manifest export is missing');
    else membershipRules(model,P,candidate.file,candidate.value,g.scope,g.candidate,g.definition);
    const ledger=records.rounds.find(r=>r.value.gate===name);
    if(!ledger) add('Q-ROUNDS',file,'persisted gate round ledger is missing');
    else {
      const {limits,cycles}=ledger.value;
      if(path.basename(ledger.file,'.json')!==name || limits?.max_fix_rounds!==g.rounds?.max_fix || limits?.max_review_rounds!==g.rounds?.max_review) add('Q-ROUNDS',ledger.file,'ledger identity/limits differ from gate');
      for(const [i,c] of (cycles || []).entries()) {
        if(c.cycle!==i+1 || c.eval_rounds>limits?.max_fix_rounds || c.review_rounds>limits?.max_review_rounds || i && (!c.continuation_ref || !c.authorized_by || cycles[i-1].ended!=='continued' || c.started_at<=cycles[i-1].started_at)) add('Q-ROUNDS',ledger.file,'round cap/contiguous cycle/continuation lineage invalid');
        if(i && !records.exceptions.some(e=>e.value.id===c.continuation_ref && e.value.kind==='continuation' && e.value.by===c.authorized_by && e.value.at<=c.started_at && e.value.expires>c.started_at)) add('Q-ROUNDS',ledger.file,'continuation authority does not resolve');
      }
      const last=cycles?.at(-1);
      if(last && (g.rounds?.cycle!==`cycle-${last.cycle}` || g.rounds.eval_fix!==last.eval_rounds || g.rounds.review!==last.review_rounds)) add('Q-ROUNDS',file,'gate counters differ from retained ledger');
      const evaluations=events.filter(e=>e.type==='eval' && (e.refs?.includes(name) || canonical(e.scope)===canonical(g.scope)));
      if(evaluations.length>(cycles || []).reduce((n,c)=>n+c.eval_rounds,0)) add('Q-ROUNDS',file,'evaluation history exceeds retained counters (reset)');
    }
    if(g.states?.human==='APPROVED' || g.states?.progress==='accepted') {
      if(!records.packets.some(p=>canonical(p.value.candidate)===canonical(g.candidate) && canonical(p.value.scope)===canonical(contentScope(g.scope,candidate?.value || {members:[]})))) add('Q-PACKET',file,'accepted gate lacks its pinned review packet');
      const members=candidate?.value.members || [];
      const targets=['ac','us'].includes(g.scope.kind)?g.scope.ids.map(id=>({kind:g.scope.kind,id})):members.filter(m=>['ac','us'].includes(m.kind));
      if(!targets.length)add('Q-REVIEW',file,'accepted gate lacks resolvable original review targets');
      const receipts=reviewReceipts(model);
      for(const {kind,id} of targets) {
        const member=members.find(m=>m.kind===kind && m.id===id);
        const eligible=member?eligibleCurrentReceipts(model,receipts,kind,id,g.candidate,member.artifacts,model.receiptValidity,{membership:candidate?.value,scope:contentScope(g.scope,candidate.value)}):[];
        if(!eligible.length || !eligible.some(r=>model.receipts.some(x=>x.value===r) && g.receipts?.includes(r.id)))add('Q-REVIEW',file,`${id}: accepted gate lacks independent eligible head current source-bound review`);
      }
    }
  }
}

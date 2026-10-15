import { effectiveFreshness } from './receipt-supersession.mjs';
import { reviewVersionsMatch } from './receipt-evidence-key.mjs';
import fs from 'node:fs';
import { localPath } from '../lib/local-path.mjs';
import { hash } from '../lib/digests.mjs';
import { reviewRules } from './rules-review.mjs';
import { targetExists,receiptSourceBound } from './record-targets.mjs';
export function receiptRules(model,P,file,r) {
  const before=P.errors.length;
  const add=(code,msg)=>P.add(code,file,1,msg,'repair the exact receipt pins, observation, and covered associations');
  const e=r.execution || {},cov=r.coverage || {};
  if(!reviewVersionsMatch(r))add('Q-RECEIPT','review evaluator/ruleset versions differ from the explicit domain pins');
  if(e.selected>e.total || e.result==='PASS' && (e.exit!==0 || !e.selected)) add('Q-RECEIPT','PASS requires real zero exit and nonempty bounded selection');
  if(r.freshness==='CURRENT' && (e.exit===null || !['PASS','FAIL'].includes(e.result))) add('Q-FRESHNESS','unexecuted observation cannot be CURRENT');
  for(const [path,sha] of Object.entries(r.artifacts || {})) try{if(effectiveFreshness(model,r)==='CURRENT' && hash(fs.readFileSync(localPath(model.spec.root,path)))!==sha) add('Q-FRESHNESS',`artifact digest changed ${path}`);}catch(err){add('Q-RECEIPT',err.message);}
  for(const path of r.review?.inputs || []) try{localPath(model.spec.root,path);}catch(err){add('Q-REVIEW',err.message);}
  for(const ac of cov.ac || []) if(!targetExists(model,'ac',ac)) add('Q-COVERAGE',`unknown AC denominator ${ac}`);
  for(const scn of cov.scenarios || []) if(!model.stories.some(s=>s.doc.fm.scenarios?.some(x=>`${s.doc.id}.${x.id}`===scn))) add('Q-COVERAGE',`unknown SCN denominator ${scn}`);
  if(effectiveFreshness(model,r)==='CURRENT')for(const [kind,ids] of [['ac',cov.ac],['scn',cov.scenarios]])for(const id of ids || [])if(targetExists(model,kind,id) && !receiptSourceBound(model,r,kind,id))add('Q-RECEIPT',`${kind} ${id} lacks original target source hashes/review inputs`);
  for(const ac of cov.passed || []) {
    const [u,a]=ac.split('.'),story=model.stories.find(s=>s.doc.id===u),scenarios=(story?.doc.fm.scenarios || []).filter(s=>s.ac?.includes(a));
    if(!cov.ac?.includes(ac) || effectiveFreshness(model,r)!=='CURRENT' || e.result!=='PASS' || !scenarios.length || scenarios.some(s=>s.status!=='passing' || ['unassigned','not-built'].includes(s.method) || !cov.scenarios?.includes(`${u}.${s.id}`))) add('Q-COVERAGE',`${ac} passed numerator lacks all current required scenarios`);
  }
  if(['NOT_RUN','BLOCKED','SKIPPED','NA'].includes(e.result) && (cov.passed?.length || r.freshness==='CURRENT')) add('Q-FAILURE','unexecuted/harness failure cannot be passed behavioral coverage');
  if(e.result==='FAIL' && e.exit===null) add('Q-FAILURE','failure must preserve real command exit');
  if(r.domain==='visual') {
    const v=r.visual || {},row=model.inventory?.screens?.find(x=>x.screen===v.screen && x.state===v.state);
    if(!row || !row.roles.includes(v.role) || !row.scope.includes(v.scope) || v.scenarios?.some(s=>!row.scenarios.includes(s))) add('Q-RECEIPT','visual context role/scope/scenario is not in inventory');
    if(e.exit!==null && ['PASS','FAIL'].includes(e.result)) {
      if(['browser','build','ds','probe','png','measurements'].some(k=>!v[k])) add('Q-RECEIPT','executed visual receipt needs actual capture metadata/paths');
      for(const path of [v.png,v.measurements].filter(Boolean)) if(!r.artifacts?.[path]) add('Q-RECEIPT',`capture output must be digest-bound: ${path}`);
      if(v.build!==r.pins?.build || v.ds!==r.pins?.ds || v.probe!==r.pins?.probe) add('Q-FRESHNESS','visual build/DS/probe pins disagree');
    }else if(!Object.keys(r.artifacts || {}).length || !e.recovery || ![0].includes(e.selected) || cov.passed?.length) add('Q-RECEIPT','unexecuted visual requires real diagnostic artifact and recovery');
  }
  reviewRules(P,file,r.review);
  return P.errors.length===before;
}

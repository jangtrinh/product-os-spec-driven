import { targetExists,referenceExists,amendmentFor,amendmentCovers,receiptCovers } from './record-targets.mjs';
import path from 'node:path';
import {readAnswers} from '../run/answer-source.mjs';
function answerSourceMatches(model,q) {
  if(q.decision_ref!==`input/answers.md#${q.id}` || q.status!=='answered')return false;
  try {
    const root=model.options?.projectRoot ?? path.dirname(model.spec.root);
    const row=readAnswers(root).find(row=>row.id===q.id);
    const decidedAt=typeof q.decided_at==='string' ? Date.parse(q.decided_at) : NaN;
    return !!row && Number.isFinite(decidedAt) && decidedAt===Date.parse(row.decided_at) && ['answer','decided_by','decision_ref'].every(key=>row[key]===q[key]);
  } catch {return false;}
}
export function clarifyExpectedRules(model,P,records) {
  const add=(code,file,message)=>P.add(code,file,1,message,'restore the exact target, ruling, amendment and RED source associations');
  for(const {file,value:q} of records.clarify) {
    if(q.recommended>=q.options.length)add('Q-CLARIFY',file,'recommended option index outside options');
    if(q.status==='open' && records.clarify.some(x=>x.value.id!==q.id && x.value.status==='answered' && x.value.question.normalize('NFC').trim().toLowerCase()===q.question.normalize('NFC').trim().toLowerCase()) && !q.duplicate_of)add('Q-CLARIFY',file,'new open question repeats an answered ruling without duplicate_of');
    if(q.decision_ref && !model.decisions.some(d=>d.id===q.decision_ref) && !answerSourceMatches(model,q))add('Q-CLARIFY',file,`decision_ref does not resolve to the exact PO answer/identity/date: ${q.decision_ref}`);
    for(const key of ['superseded_by','duplicate_of'])if(q[key] && (q[key]===q.id || !records.clarify.some(x=>x.value.id===q[key])))add('Q-CLARIFY',file,`${key} question does not resolve: ${q[key]}`);
    for(const id of q.depends_on || [])if(id===q.id || !referenceExists(model,records,id))add('Q-CLARIFY',file,`depends_on does not resolve: ${id}`);
  }
  for(const {file,value:e} of records.expected) {
    const {kind,id}=e.target,known=kind!=='threshold' && targetExists(model,kind,id),amend=amendmentFor(model,e.amendment_ref);
    if(kind!=='threshold' && !known)add('Q-EXPECTED',file,`unknown ${kind} target ${id}`);
    if(e.before!==e.after && (e.status!=='approved' || !e.amendment_ref || !e.red_history.some(r=>r.result==='FAIL')))add('Q-EXPECTED',file,'changed expectation requires approved amendment and actual FAIL history');
    if(e.amendment_ref && !amend)add('Q-EXPECTED',file,'expected-result amendment does not resolve uniquely');
    if(known && amend && !amendmentCovers(model,amend.amendment,kind,id))add('Q-EXPECTED',file,'amendment affected IDs do not include the expected target');
    for(const red of e.red_history || []) {
      const matches=model.receipts.filter(r=>r.value.id===red.receipt && r.value.execution.result===red.result);
      if(matches.length!==1)add('Q-EXPECTED',file,'RED receipt/result does not resolve uniquely');
      else if(known && !receiptCovers(model,matches[0].value,kind,id))add('Q-EXPECTED',file,'RED receipt scope/coverage/source hashes/review inputs do not include the expected target');
      if(red.result==='FAIL' && matches.length===1 && (!matches[0].value.execution.selected || matches[0].value.execution.exit===null || matches[0].value.execution.exit===0))add('Q-EXPECTED',file,'behavioral RED needs a nonempty selection and real failing exit');
    }
  }
}

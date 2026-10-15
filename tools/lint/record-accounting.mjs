import {STAGES} from '../lib/config/config-loader.mjs';
export const RECORD_KINDS={definitions:['gate-definition','Q-DEFINITION'],gates:['gate-state','Q-STATE'],transitions:['transition','Q-TRANSITION'],exceptions:['exception','Q-EXCEPTION'],decisions:['batch-decision','Q-DECISION'],packets:['packet-data','Q-PACKET'],clarify:['clarify-record','Q-CLARIFY'],expected:['expected-change','Q-EXPECTED'],integration:['integration-record','Q-INTEGRATION'],feedback:['feedback-record','Q-FEEDBACK'],candidates:['candidate-manifest','Q-SCOPE'],rounds:['rounds-ledger','Q-ROUNDS']};
export function recordAccounting(model,P,root,files=[]) {
  const checks={};
  for(const [kind,[,code]] of Object.entries(RECORD_KINDS)) {
    const count=files.filter(f=>f.startsWith(`${root}/${kind}/`) && f.endsWith('.json')).length;
    checks[code]={status:count?'CHECKED':'NOT_RUN',checked:count,group:kind,reason:count?null:root?'record group absent or empty':'no gate_model.records'};
  }
  checks['Q-AUDIT']={status:model.auditEvents?.length?'CHECKED':'NOT_RUN',checked:model.auditEvents?.length || 0,group:'audit',reason:model.auditEvents?.length?null:'audit history absent or empty'};
  const packets=model.records?.packets || [],receipts=(model.receipts?.length || 0)+packets.reduce((n,p)=>n+(p.value.evidence?.length || 0),0);
  const inputs={'Q-RECEIPT':receipts,'Q-REVIEW':receipts,'Q-COVERAGE':receipts,'Q-FAILURE':receipts,'Q-FRESHNESS':receipts,'Q-GRAPH':model.graph?1:0,'Q-CHANGESET':model.changeSets?.length || 0,'Q-IMPACT':(model.changeSets?.length || 0)+packets.length,'Q-PROPAGATION':(model.changeSets || []).reduce((n,c)=>n+(c.value.propagation?.length || 0),0)+packets.reduce((n,p)=>n+(p.value.change?.propagation?.length || 0),0),'Q-HANDOFF-PINS':model.records?.candidates?.length || 0};
  for(const [code,count] of Object.entries(inputs))checks[code]={status:count?'CHECKED':'NOT_RUN',checked:count,reason:count?null:'required source records absent or empty'};
  checks['Q-RECEIPT'].witness=model.receiptWitness;
  checks['Q-CLARIFY'].rounds={status:'NOT_RUN',reason:'no declared clarification-round limit input'};
  checks['Q-EXPECTED'].thresholds={status:'NOT_RUN',reason:'no declared threshold input registry'};
  model.qRecords={...model.qRecords,checks,notRun:Object.values(checks).some(c=>c.status==='NOT_RUN' || c.rounds?.status==='NOT_RUN' || c.thresholds?.status==='NOT_RUN')};
  const requireGroup=(kind,file)=>{
    const code=RECORD_KINDS[kind][1];
    if(checks[code].status==='NOT_RUN')P.add(code,file,1,`required ${kind} group absent or empty; check NOT RUN`,'export the records required by the declared gate/checkpoint');
  };
  for(const {file,value:d} of model.records?.definitions || []) for(const c of d.checks || []) if(c.mandatory) {
    const due=!model.options.stage || STAGES.indexOf(d.stage)<STAGES.indexOf(model.options.stage);
    if(due && checks[c.id]?.status==='NOT_RUN')P.add(c.id,file,1,'declared mandatory check inputs absent or empty; check NOT RUN','export the inputs required by the declared check');
  }
  for(const {file,value:g} of model.records?.gates || []) {
    for(const kind of ['definitions','candidates','rounds'])requireGroup(kind,file);
    if(g.decision) {
      requireGroup('decisions',file);
      if(!model.records.decisions.some(d=>d.value.id===g.decision))P.add('Q-DECISION',file,1,'declared gate decision does not resolve','export the exact referenced decision');
    }
    if(g.states?.human==='APPROVED' || g.states?.progress==='accepted') {
      requireGroup('packets',file);
    }
  }
}

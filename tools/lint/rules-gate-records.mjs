import {definitionRevision} from '../lib/definition-scope.mjs';
import { noImpactProof } from './receipt-evidence-key.mjs';
import { prepareReceiptHeads } from './receipt-supersession.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { localPath } from '../lib/local-path.mjs';
import { readPayload } from './rules-design.mjs';
import { parseJson } from '../lib/json-strict.mjs';
import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
import { hash,canonical } from '../lib/digests.mjs';
import { lineageRules } from './rules-lineage.mjs';
import { packetRules } from './rules-packets.mjs';
import { RECORD_KINDS,recordAccounting } from './record-accounting.mjs';
import { clarifyExpectedRules } from './rules-clarify-expected.mjs';
export function recordRules(model,P,root) {
  const add=(code,file,msg)=>P.add(code,file,1,msg,'correct the exported record and preserve its audit history');
  try{if(!fs.statSync(localPath(model.spec.root,root)).isDirectory()) throw new Error('records is not a directory');}catch(e){add('M-GATE-MODEL',root,e.message);prepareReceiptHeads(model,P);recordAccounting(model,P,root);return;}
  const files=model.spec.files.filter(f=>f.startsWith(root+'/'));
  const records={definitions:[],gates:[],transitions:[],exceptions:[],decisions:[],packets:[],clarify:[],expected:[],integration:[],feedback:[],candidates:[],rounds:[]};model.records=records;
  const kinds=RECORD_KINDS;
  for(const file of files) {
    const rel=file.slice(root.length+1),kind=rel.split('/')[0];
    if(file.endsWith('.json') && kinds[kind]) {
      const [schema,code]=kinds[kind],r=readPayload(model,P,file,schema,code);model.qRecords.checked++;if(r)records[kind].push({file,value:r});
      if(r && kind==='definitions' && definitionRevision(r)!==r.scope.revision) add('Q-DEFINITION',file,'definition revision differs from exact membership/id/version');
      if(r && kind==='definitions' && rel!==`definitions/${r.id}/${r.version}.json`) add('Q-DEFINITION',file,'definition id/version differs from fixed file path');
      if(r && ['transitions','exceptions','decisions','clarify','expected','integration','feedback'].includes(kind) && path.basename(file,'.json')!==r.id) add(code,file,'record id differs from filename');
    }else if(rel!=='audit.jsonl') add('M-GATE-MODEL',file,'unknown exported record path');
  }
  const scopes=Object.values(records).flat().map(r=>({file:r.file,scope:r.value.scope}));
  for(const {file,scope:s} of scopes) if(s && typeof s==='object' && (JSON.stringify(s.ids)!==JSON.stringify([...new Set(s.ids || [])].sort()) || s.kind==='ac' && s.ids.some(x=>!/^.+\.AC-\d+$/.test(x)))) add('Q-SCOPE',file,'scope must be exact sorted unique qualified membership');
  for(const {file,value:g} of records.gates) {
    const d=records.definitions.find(x=>x.value.id===g.definition?.id && x.value.version===g.definition?.version)?.value;
    if(!d || canonical(d.scope)!==canonical(g.scope)) add('Q-DEFINITION',file,'gate definition/version/scope does not resolve');
    for(const id of g.receipts || []) if(!model.receipts.some(r=>r.value.id===id)) add('Q-RECEIPT',file,`unknown receipt ${id}`);
    const accepted=g.states?.human==='APPROVED' || g.states?.progress==='accepted';
    if(accepted && (g.states?.eval!=='PASS' || !['PASS','NEEDS_CHANGES'].includes(g.states?.review) || g.states?.freshness!=='CURRENT' || !g.receipts?.length)) add('Q-STATE',file,'human/role stop cannot promote missing eval/review/current evidence');
    if(accepted && g.candidate?.build==='not-built' && d?.stage==='uiux') add('Q-HANDOFF-PINS',file,'not-built candidate cannot establish G4');
    const rounds=g.rounds || {};
    if((rounds.eval_fix>rounds.max_fix || rounds.review>rounds.max_review) && !rounds.continuation) add('Q-ROUNDS',file,'caps exceeded without persisted continuation');
    if(rounds.continuation && !records.exceptions.some(e=>e.value.id===rounds.continuation && e.value.kind==='continuation' && e.value.status==='active')) add('Q-ROUNDS',file,'continuation exception missing/current status invalid');
    if(accepted && d?.stage==='handoff' && (!g.candidate?.head || !g.candidate?.base || !g.candidate?.manifest || !g.candidate?.build)) add('Q-HANDOFF-PINS',file,'G5 requires head/base/manifest/build pins');
    for(const r of model.receipts.filter(r=>g.receipts?.includes(r.value.id))) {
      const preserved=d?.stage!=='handoff' && g.scope.ids.every(id=>noImpactProof(model,g.scope.kind,id,g.candidate));
      for(const k of ['head','base','manifest','build'])if(r.value.pins[k]!==g.candidate?.[k] && (k==='build' || !preserved))add('Q-HANDOFF-PINS',file,`receipt and candidate ${k} differ without no-impact proof`);
    }
  }
  for(const {file,value:t} of records.transitions) {
    const open=t.kind==='backward' && t.decision===null && t.authority==='po' && t.regates?.length && t.impact?.length;
    // A PO-authority proposal is a legitimate open item (gate-model section 1): it authorizes nothing until the PO decides.
    if(open) P.warn('Q-TRANSITION',file,1,'open backward re-entry proposal: no PO decision yet, nothing is authorized','the PO approves the reopened stage; the decision id is then recorded here');
    else if(t.kind==='backward' && (!t.decision || !t.regates?.length || !t.impact?.length)) add('Q-TRANSITION',file,'backward re-entry requires decision/impact/re-gates');
    if(t.kind==='exception' && !records.exceptions.some(e=>e.value.id===t.source && e.value.status==='active' && e.value.at<=t.at && e.value.expires>t.at)) add('Q-EXCEPTION',file,'prototype mutation requires prior scoped unexpired exception');
  }
  for(const {file,value:e} of records.exceptions) {
    if(e.expires<=e.at || e.status==='active' && (!e.non_waivable?.length || !e.compensating_checks?.length)) add('Q-EXCEPTION',file,'exception cannot waive quality or expire before approval');
  }
  const auditFile=`${root}/audit.jsonl`;let events=[];model.auditWitnessEvents=[];let auditValid=true;
  if(files.includes(auditFile)) {
    let previous=null;const seen=new Set();
    for(const line of fs.readFileSync(localPath(model.spec.root,auditFile),'utf8').split('\n').filter(Boolean)) {
      try {
        const e=parseJson(line);events.push(e);model.qRecords.checked++;
        if(validate(e,loadSchema('audit-event.schema.json')).length || e.previous_sha256!==previous || seen.has(e.id)) {add('Q-AUDIT',auditFile,'audit schema/hash chain or unique event id invalid');auditValid=false;}
        if(auditValid)model.auditWitnessEvents.push(e);
        seen.add(e.id);previous=hash(line);
      }catch(e){add('Q-AUDIT',auditFile,e.message);auditValid=false;}
    }
  }
  clarifyExpectedRules(model,P,records);
  for(const {file,value:r} of records.integration) {
    if((r.semantic_conflicts || []).some(c=>c.resolution==='open') && r.status!=='conflicts-open') add('Q-INTEGRATION',file,'open semantic conflicts cannot be accepted as clean/resolved');
    for(const c of r.semantic_conflicts || []) if(c.resolution==='resolved' && !model.decisions.some(d=>d.id===c.decision_ref)) add('Q-INTEGRATION',file,'semantic-conflict owner ruling does not resolve');
  }
  for(const {file,value:r} of records.feedback) {
    if(r.ruling_ref && !model.decisions.some(d=>d.id===r.ruling_ref)) add('Q-FEEDBACK',file,'feedback ruling does not resolve');
    if(r.disposition==='enforced' && (!r.suite_wired || !model.receipts.some(x=>x.value.id===r.negative_control?.red_receipt && x.value.execution.result==='FAIL'))) add('Q-FEEDBACK',file,'enforced feedback requires wired suite and actual RED receipt');
  }
  model.auditEvents=events;
  prepareReceiptHeads(model,P);
  recordAccounting(model,P,root,files);
  lineageRules(model,P,records,events);
  packetRules(model,P,records);
}

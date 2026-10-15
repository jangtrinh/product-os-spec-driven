import fs from 'node:fs';
import path from 'node:path';
import {appendAudit,auditEvents} from '../run/audit-store.mjs';
import {requireTransition} from '../run/runtime-state.mjs';
import {prepareControl} from './behavior-project.mjs';

export function repairControl(c) {
  const {p,check,run,json}=c;
  prepareControl(c,['prd'],{writer:{badUntilFix:true}});
  check('repair stops for human after fresh review',run('failed-eval-repair-fresh-review').code,2);
  const gate=p.gate('prd').data;
  check('failed eval then passing final eval',gate.evals.map(row=>row.exit_code),[1,0]);
  check('repair and review counters', [gate.model.rounds.eval_fix,gate.model.rounds.review],[1,1]);
  check('review saw final repaired output',gate.review.independent,true);
  prepareControl(c,['prd'],{writer:{text:'defect\n'}});p.config.limits.max_fix_rounds=2;p.save();
  check('exhausted cap stops',run('exhaust-fix-cap').code,2);
  check('fix cap persisted',json('review/runtime/prd.json').rounds.eval_fix,2);
  check('restart does not reset cap',run('restart-exhausted-cap').code,2);
  check('restart retained counter',json('review/runtime/prd.json').rounds.eval_fix,2);
}
export function roleControl(c) {
  const {p,check,run}=c;prepareControl(c);
  check('initial human pending',run('create-pending-approval').code,2);
  const before=p.gate('prd').raw;
  p.config.roles.po.gate=false;p.save();
  check('role toggle refuses pending bypass',run('toggle-po-gate').code,2);
  check('pending bytes retained',p.gate('prd').raw,before);
  prepareControl(c);p.config.roles.po.enabled=false;p.config.agents.reviewer.command='manual';p.save();
  check('manual review pauses',run('request-manual-review').code,2);
  p.write('review-answer.txt','VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"original source and case AC"}],"findings":[]}\n```\n');
  check('manual self-review remains pending',run('submit-self-review',['--result','review-answer.txt']).code,2);
  check('manual independence not established',p.gate('prd').data.review.independent,false);
  check('manual human state pending',p.gate('prd').data.model.states.human,'PENDING');
}
export function prototypeControl(c) {
  const {p,check,invoke}=c;prepareControl(c);
  const scope=p.definitions.prd.scope;
  const exception={id:'prototype',kind:'prototype-first',scope,source:'Selected case PO scoped prototype decision',reason:'Explore prototype before contract',by:'po@example.test',at:new Date(Date.now()-1000).toISOString(),expires:new Date(Date.now()+60000).toISOString(),deferred_gates:['gate-prd'],compensating_checks:['combined contract and prototype review'],non_waivable:['mandatory quality floors','independence'],status:'active',combined_checkpoint:'gate-prd'};
  p.write('review/exceptions/prototype.json',exception);p.definitions.prd.exceptions=[exception.id];p.save();
  const transition={id:'prototype-transition',kind:'exception',opener:'dev',at:new Date().toISOString(),source:exception.id,reason:'Selected case prototype-first',from:{stage:'prd',scope,revision:'before'},to:{stage:'prd',scope,revision:'after'},impact:[{node:'ac:US-01.AC-01',domain:'spec',classification:'direct',reason:'Prototype',path:['ac:US-01.AC-01']}],authority:'po',decision:null,regates:['gate-prd']};
  const action=()=>{p.write('transition.json',transition);return requireTransition(p.root,{transition:'transition.json'},p.config,{definitions:new Map([['gate-prd',p.definitions.prd]])},'prd',true);};
  try {invoke('unrecorded-prototype-transition',action);check('unrecorded exception refused',true,false);}catch(error){check('unrecorded exception exit',error.code,2);}
  const event=invoke('record-scoped-po-authority',()=>appendAudit(p.root,{type:'decision',scope,actor:exception.by,refs:[transition.id,exception.id],reason:'PO scoped authorization; synthetic control, not owner approval'}));
  transition.decision=event.id;
  check('recorded transition accepted',invoke('authorized-prototype-transition',action).kind,'exception');
  check('combined checkpoint retained',c.json('review/exceptions/prototype.json').combined_checkpoint,'gate-prd');
  check('transition audit appended',auditEvents(p.root).some(row=>row.type==='transition'),true);
  const before=c.read('review/audit.jsonl');exception.scope={...scope,ids:['us']};p.write('review/exceptions/prototype.json',exception);
  try {invoke('wrong-scope-prototype-transition',action);check('wrong scope refused',true,false);}catch(error){check('wrong scope exit',error.code,2);}
  check('refused transition leaves audit unchanged',c.read('review/audit.jsonl'),before);
}

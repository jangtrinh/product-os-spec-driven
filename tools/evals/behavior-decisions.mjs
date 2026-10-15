import fs from 'node:fs';
import path from 'node:path';
import {recordDeliveryEvent} from '../run/delivery-state.mjs';
import {propagationEligible} from '../run/impact-closure.mjs';
import {appendAudit} from '../run/audit-store.mjs';
import {requireTransition} from '../run/runtime-state.mjs';
import {preparePacket} from './behavior-packet.mjs';

function refusal(c,id,action,code) {
  try {c.invoke(id,action);c.check(`${id} refused`,true,false);}
  catch(error) {c.check(`${id} refusal code`,error.code,code);}
}
export function batchControl(c) {
  const {p,check,read}=c,q=preparePacket(c);
  const before=read('review/audit.jsonl');
  q.packet.requests.pop();q.save();
  check('incomplete packet membership refused',q.importBatch('import-incomplete-packet').code,3);
  check('membership refusal leaves audit unchanged',read('review/audit.jsonl'),before);
  q.rebuild();
  check('moved build refused',q.importBatch('import-moved-build',['--build','different-build']).code,3);
  check('pin refusal leaves audit unchanged',read('review/audit.jsonl'),before);
  q.decision.default='defer';q.save();
  check('defer import executes',q.importBatch('import-deferred-batch').code,0);
  check('deferred members pending',q.states(),['PENDING','PENDING']);
  q.decision.id='case-overrides';q.decision.overrides=[{id:'US-01',decision:'approve',reason:'Approve story'},{id:'US-01.AC-02',decision:'changes-requested',reason:'Second outcome needs changes'}];q.save();
  check('override import executes',q.importBatch('import-story-and-ac-overrides').code,0);
  check('AC override precedes story approval',q.states(),['APPROVED','PENDING']);
  q.decision.id='case-final';q.decision.default='approve';q.decision.overrides=[];q.save();
  check('full current batch imports',q.importBatch('import-exact-case-batch').code,0);
  check('exact members approved',q.states(),['APPROVED','APPROVED']);
  const audit=read('review/audit.jsonl');
  check('batch retry idempotent',q.importBatch('retry-exact-case-batch').code,0);
  check('retry audit immutable',read('review/audit.jsonl'),audit);
}
export function deliveryControl(c) {
  const {p,check,invoke,json,read}=c,q=preparePacket(c);
  check('case batch approved before publication',q.importBatch('approve-handoff-batch').code,0);
  const file=`review/changes/${q.change.id}.json`,change=json(file);
  change.receivers=[{receiver:'dev@example.test',baseline:q.packet.baseline.manifest,acknowledgment:null,switch:null}];p.write(file,change);
  const event={id:'case-publication',type:'publication',actor:'po@example.test'};
  const action=e=>recordDeliveryEvent(p.root,p.config,q.change.id,e,q.packet.candidate);
  const publication=invoke('publish-selected-case-baseline',()=>action(event));
  const snapshot=`spec/delivery/baselines/${q.change.id}/files/spec/us/US-01.md`,bytes=read(snapshot);
  check('publication state explicit',json(file).state,'Published');
  check('publication does not switch receiver',json(file).receivers[0].switch,null);
  check('publication retry idempotent',invoke('retry-publication',()=>action(event)).id,publication.id);
  const before=read('review/audit.jsonl');
  refusal(c,'switch-without-acknowledgment',()=>action({id:'early-switch',type:'switch',actor:'dev@example.test'}),2);
  check('early switch leaves audit unchanged',read('review/audit.jsonl'),before);
  invoke('acknowledge-selected-case-baseline',()=>action({id:'case-ack',type:'acknowledgment',actor:'dev@example.test'}));
  check('acknowledged state explicit',json(file).state,'Acknowledged');
  check('acknowledgment retains old receiver baseline',json(file).receivers[0].baseline,q.packet.baseline.manifest);
  invoke('switch-receiver-to-selected-case-baseline',()=>action({id:'case-switch',type:'switch',actor:'dev@example.test'}));
  check('receiver switched explicitly',json(file).receivers[0].baseline,q.packet.candidate.manifest);
  check('switched state explicit',json(file).state,'Switched');
  p.write('spec/us/US-01.md',read('spec/us/US-01.md')+'\nIncompatible post-handoff draft\n');
  check('published selected source remains immutable',read(snapshot),bytes);
  refusal(c,'publish-moved-head',()=>recordDeliveryEvent(p.root,p.config,q.change.id,{id:'moved-publication',type:'publication',actor:'po@example.test'},{...q.packet.candidate,head:'moved-head'}),2);
}
export function semanticControl(c) {
  const {p,check,invoke}=c,q=preparePacket(c),receipt=q.packet.evidence[0];
  const query=()=>propagationEligible(q.packet.change.propagation,[receipt],q.packet.scope.ids,{members:q.packet.membership.members,approvers:p.config.roles.po.approvers});
  const criteria=receipt.review.criteria;
  receipt.review.criteria=[{id:'trace-tag',mandatory:true,score:2,evidence:'A-09 tagged; old scenario unchanged'}];
  p.write('review/receipts/fixture-receipt.json',receipt);q.rebuild();
  check('tag-only old scenario cannot establish propagation',invoke('evaluate-old-tagged-case-scenario',query),false);
  check('old tagged scenario batch refuses',q.importBatch('import-old-tagged-propagation').code,2);
  const scope=p.definitions.prd.scope;
  const transition={id:'expected-result-change',kind:'backward',opener:'qc',at:new Date().toISOString(),source:'Changed expected result for selected US-01.AC-01',reason:'Return expected outcome to source AC and PO',from:{stage:'tdd',scope,revision:'before'},to:{stage:'prd',scope,revision:'after'},impact:[{node:'ac:US-01.AC-01',domain:'spec',classification:'direct',reason:'Changed expected result',path:['ac:US-01.AC-01']}],authority:'po',decision:null,regates:['gate-prd']};
  const enter=()=>{p.write('transition.json',transition);return requireTransition(p.root,{transition:'transition.json'},p.config,{definitions:new Map([['gate-prd',p.definitions.prd]])},'prd',true);};
  refusal(c,'expected-result-without-po',enter,2);
  const event=invoke('record-case-expected-result-po-decision',()=>appendAudit(p.root,{type:'decision',scope,actor:'po@example.test',refs:[transition.id],reason:'Synthetic PO authorizes source AC review; product review NOT_RUN'}));
  transition.decision=event.id;
  check('recorded expected-result reentry legal',invoke('reenter-case-source-ac-review',enter).kind,'backward');
  p.write('input/po-spec.md',c.read('input/po-spec.md')+'\nA-09: changed expected outcome requires source AC and scenario review.\n');
  check('old source-bound packet cannot approve changed outcomes',q.importBatch('import-after-source-outcome-change').code,3);
  // Build a fresh case-bound synthetic review control for the changed source.
  const fresh=preparePacket(c);
  check('current semantic criterion exists',fresh.packet.evidence[0].review.criteria.some(row=>row.id==='semantic-propagation'),true);
  check('current source-bound propagation eligible',invoke('evaluate-current-case-propagation',()=>propagationEligible(fresh.packet.change.propagation,fresh.packet.evidence,fresh.packet.scope.ids,{members:fresh.packet.membership.members,approvers:p.config.roles.po.approvers})),true);
  check('current reviewed packet imports',fresh.importBatch('import-current-case-propagation').code,0);
}

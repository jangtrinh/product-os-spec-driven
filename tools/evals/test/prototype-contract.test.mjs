import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {appendAudit, auditEvents} from '../../run/audit-store.mjs';
import {requireTransition} from '../../run/runtime-state.mjs';

test('prototype-first requires recorded exact-scope PO authority and retains combined checkpoint', t => {
  const p = projectFixture(t), scope = p.definitions.prd.scope;
  const exception = {id:'prototype', kind:'prototype-first', scope, source:'PO scoped prototype decision', reason:'Explore a prototype before contract', by:'po@example.test', at:new Date(Date.now()-1000).toISOString(), expires:new Date(Date.now()+60000).toISOString(), deferred_gates:['gate-prd'], compensating_checks:['combined contract and prototype review'], non_waivable:['mandatory quality floors','independence'], status:'active', combined_checkpoint:'gate-prd'};
  p.write('review/exceptions/prototype.json', exception); p.definitions.prd.exceptions=[exception.id];
  const transition={id:'prototype-transition', kind:'exception', opener:'dev', at:new Date().toISOString(), source:exception.id, reason:'PO prototype-first', from:{stage:'prd',scope,revision:'before'}, to:{stage:'prd',scope,revision:'after'}, impact:[{node:'ac:US-16.AC-01',domain:'spec',classification:'direct',reason:'Prototype',path:['ac:US-16.AC-01']}], authority:'po', decision:null, regates:['gate-prd']};
  const registry={definitions:new Map([['gate-prd',p.definitions.prd]])};
  p.write('transition.json',transition);
  assert.throws(()=>requireTransition(p.root,{transition:'transition.json'},p.config,registry,'prd',true), e=>e.code===2);
  const event=appendAudit(p.root,{type:'decision',scope,actor:exception.by,refs:[transition.id,exception.id],reason:'PO scoped authorization'});
  transition.decision=event.id; p.write('transition.json',transition);
  const allowed=requireTransition(p.root,{transition:'transition.json'},p.config,registry,'prd',true);
  assert.equal(allowed.kind,'exception'); assert.ok(auditEvents(p.root).some(row=>row.type==='transition'));
  const before=fs.readFileSync(path.join(p.root,'review/audit.jsonl'),'utf8');
  exception.scope={...scope,ids:['us']};p.write('review/exceptions/prototype.json',exception);
  assert.throws(()=>requireTransition(p.root,{transition:'transition.json'},p.config,registry,'prd',true),e=>e.code===2);
  assert.equal(fs.readFileSync(path.join(p.root,'review/audit.jsonl'),'utf8'),before);
});

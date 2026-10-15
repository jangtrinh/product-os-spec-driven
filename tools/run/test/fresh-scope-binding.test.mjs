import {definitionRevision} from '../../lib/definition-scope.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {candidateFor,loadRegistries} from '../registries.mjs';
import {invalidateGates} from '../invalidate-gates.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
test('fresh writer bytes reach PENDING without a predicted-output hash or rebinding',t=>{
 const p=projectFixture(t,['prd'],{writer:{text:'Unpredicted writer output\n'}});
 const before=canonical(p.definitions.prd);
 const result=p.run();assert.equal(result.code,2,result.out);assert.match(result.out,/prd: GATE: PENDING/);
 assert.match(p.gate('prd').raw,/^GATE: PENDING/);assert.equal(canonical(p.definitions.prd),before);
});
test('approved content changes stale the active gate while definition membership stays fixed',t=>{
 const p=projectFixture(t);assert.equal(p.run().code,2);p.approve('prd');
 const scope=canonical(p.definitions.prd.scope), manifest=p.gate('prd').data.model.candidate.manifest;
 p.write('spec/prd.txt','Changed after human approval\n');
 const result=invalidateGates(p.root,p.config,loadRegistries(p.root,p.config),{head:'fixture-head',build:'not-built'});
 assert.ok(result.invalidated.has('prd'));assert.match(p.gate('prd').raw,/^GATE: PENDING/);
 assert.equal(p.gate('prd').data.model.states.freshness,'STALE');assert.equal(p.gate('prd').data.approval,undefined);
 assert.equal(canonical(p.definitions.prd.scope),scope);
 const current=candidateFor(p.root,p.definitions.prd);assert.equal(canonical(current.scope),scope);assert.notEqual(current.digest,manifest);
});
test('added, removed or renamed scope ids require a new membership binding',t=>{
 for(const [before,ids] of [[['prd'],['prd','us']],[['prd','us'],['prd']],[['prd'],['renamed']]]) {
  const p=projectFixture(t);p.definitions.prd.scope.ids=before;p.definitions.prd.scope.revision=definitionRevision(p.definitions.prd);p.definitions.prd.scope.ids=ids;p.save();
  const result=p.run();assert.equal(result.code,2,result.out);assert.match(result.out,/scope-version-required/);
  assert.equal(fs.existsSync(path.join(p.root,'review/gates/prd.md')),false);
 }
});

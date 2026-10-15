import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plant } from '../self-test.mjs';
import { lintSpec } from '../index.mjs';
import { v3Controls,approvePacket } from '../controls-v3.mjs';
import { digest,hash } from '../../lib/digests.mjs';
import {completeMemberGraph} from '../controls-member-census.mjs';
const CLI=fileURLToPath(new URL('../lint.mjs',import.meta.url));
function seeded(mutate,check){const f=plant(mutate);try{check(lintSpec(f.root,f.options),f);}finally{f.cleanup();}}
test('complete graph setup is repeatable while empty attack mutations refuse',()=>{
  const f=plant(t=>{
    completeMemberGraph(t);
    const before=fs.readFileSync(path.join(t.root,'assets/graph.json'),'utf8');
    completeMemberGraph(t);
    assert.equal(fs.readFileSync(path.join(t.root,'assets/graph.json'),'utf8'),before);
    assert.throws(()=>t.json('spec.manifest.json',()=>{}),/mutation changed nothing/);
  });
  f.cleanup();
});
for(const [i,[code,mutate]] of v3Controls.entries()) test(`approval/source attack ${i+1} refuses with ${code}`,()=>seeded(mutate,r=>{assert.notEqual(r.exitCode,0,JSON.stringify(r.stats));assert.ok(r.problems.errors.some(p=>p.code===code),JSON.stringify(r.problems.list));}));
test('empty optional records disclose every group without passing checked zero',()=>seeded(t=>{t.remove('assets/records');fs.mkdirSync(path.join(t.root,'assets/records'));},r=>{assert.equal(r.exitCode,0,JSON.stringify(r.problems.list));assert.equal(r.stats.qRecords.notRun,true);assert.equal(r.stats.qRecords.checks['Q-CLARIFY'].status,'NOT_RUN');assert.equal(r.stats.qRecords.checks['Q-EXPECTED'].status,'NOT_RUN');}));
test('missing clarify group is visible in JSON and human output',()=>seeded(t=>t.remove('assets/records/clarify'),(r,f)=>{assert.equal(r.exitCode,0,JSON.stringify(r.problems.list));assert.equal(r.stats.qRecords.checks['Q-CLARIFY'].status,'NOT_RUN');const c=spawnSync(process.execPath,[CLI,f.root],{encoding:'utf8'});assert.equal(c.status,0,c.stderr);assert.match(c.stdout,/Q-CLARIFY.*NOT RUN/);}));
test('round without supplied clarification limit is NOT RUN, never guessed',()=>seeded(t=>t.json('assets/records/clarify/Q-001.json',q=>q.round=999),r=>{assert.equal(r.exitCode,0,JSON.stringify(r.problems.list));assert.equal(r.stats.qRecords.checks['Q-CLARIFY'].rounds.status,'NOT_RUN');}));
test('threshold target without input is NOT RUN',()=>seeded(t=>t.json('assets/records/expected/XC-001.json',q=>q.target={kind:'threshold',id:'quality-floor'}),r=>{assert.equal(r.stats.qRecords.checks['Q-EXPECTED'].thresholds.status,'NOT_RUN');}));
for(const def of ['defer','changes-requested','approve']) test(`valid embedded receipt permits effective approval under ${def}`,()=>seeded(t=>approvePacket(t,'valid',def),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('exact AC override precedes US approval and leaves all members deferred',()=>seeded(t=>{approvePacket(t,'open');t.json('assets/records/decisions/decision-1.json',d=>d.overrides=[{id:'US-01',decision:'approve',reason:'US'},{id:'US-01.AC-01',decision:'defer',reason:'AC'}]);},r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('declared mandatory clarification check cannot silently lose its group',()=>seeded(t=>{t.remove('assets/records/clarify');t.json('assets/records/definitions/story/1.json',d=>d.checks.push({id:'Q-CLARIFY',command:'node lint',mandatory:true,blocker_policy:'missing blocks'}));},r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-CLARIFY'))));
test('accepted gate cannot lose its referenced decision export',()=>seeded(t=>{t.json('assets/records/gates/story.json',g=>{g.states.progress='accepted';g.decision='decision-1';});t.remove('assets/records/decisions');},r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-DECISION'))));
test('receipt scope revision cannot be a label',()=>seeded(t=>approvePacket(t,(p,r)=>r.scope.revision='invented'),r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-DECISION'))));
test('missing affected propagation row blocks its effective approval',()=>seeded(t=>approvePacket(t,p=>p.change.propagation[0].ac=['US-02.AC-01']),r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-DECISION'))));
function twoMembers(t,includeOther=false,otherFails=false,def='defer') {
  approvePacket(t,(p,r)=>{
    const artifacts={'us/US-02.md':hash(fs.readFileSync(path.join(t.root,'us/US-02.md')))};
    const member={kind:'ac',id:'US-02.AC-01',artifacts,revision:digest(artifacts)};
    r.id='receipt-expanded-members';p.change.propagation.forEach(x=>x.evidence=[r.id]);
    p.membership.members.push(member);p.scope.ids.push(member.id);p.scope.revision=digest(p.membership.members);p.candidate.manifest=digest(p.membership);r.pins={...p.candidate};
    p.requests.push({id:member.id,reason:'Other member'});
    p.change.propagation.push({...p.change.propagation[0],ac:[member.id],status:'not-run',evidence:[]});
    if(includeOther) {
      const second=structuredClone(r);second.id='receipt-other';second.scope={kind:'ac',ids:[member.id],revision:digest([member])};second.coverage.ac=[member.id];second.coverage.scenarios=['US-02.SCN-02-01'];second.artifacts=artifacts;second.review.inputs=['us/US-02.md'];second.review.criteria[0].evidence='us/US-02.md';
      if(otherFails){second.execution.result='FAIL';second.execution.exit=1;second.review.verdict='FAIL';second.review.criteria[0].score=0;}
      p.evidence.push(second);p.change.propagation.at(-1).status='verified';p.change.propagation.at(-1).evidence=[second.id];
    }
  },def);
}
test('deferred member unverified propagation does not block an independent approved member',()=>seeded(t=>twoMembers(t),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('all approved members each need their own eligible evidence',()=>seeded(t=>twoMembers(t,false,false,'approve'),r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-DECISION' && p.message.includes('US-02.AC-01')))));
test('all approved members with valid exact evidence pass',()=>seeded(t=>twoMembers(t,true,false,'approve'),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('failed criteria on a deferred member remain visible without approving that member',()=>seeded(t=>twoMembers(t,true,true),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('failed criteria block the member approved under a US override',()=>seeded(t=>{twoMembers(t,true,true);t.json('assets/records/decisions/decision-1.json',d=>d.overrides.push({id:'US-02',decision:'approve',reason:'Other US'}));},r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-DECISION' && p.message.includes('US-02.AC-01')))));
test('approval cannot replace missing bound original source bytes with unrelated bytes',()=>seeded(t=>approvePacket(t,(p,r)=>{r.artifacts={'README.md':hash(fs.readFileSync(path.join(t.root,'README.md')))};}),r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-DECISION'))));
test('clarification dependency joins actual prior question IDs',()=>seeded(t=>{const q=JSON.parse(fs.readFileSync(path.join(t.root,'assets/records/clarify/Q-001.json')));q.id='Q-002';q.depends_on=['Q-001'];q.question='Follow-up question';t.write('assets/records/clarify/Q-002.json',JSON.stringify(q));},r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('expected scenario target joins amendment through its owning AC',()=>seeded(t=>t.json('assets/records/expected/XC-001.json',x=>x.target={kind:'scn',id:'US-03.SCN-03-01'}),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('RED receipt coverage without its target scope cannot establish history',()=>seeded(t=>t.json('assets/red-receipt.json',r=>{r.scope.ids=['US-02.AC-01'];}),r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-EXPECTED'))));
test('zero-selected failing execution cannot establish behavioral RED',()=>seeded(t=>t.json('assets/red-receipt.json',r=>r.execution.selected=0),r=>assert.ok(r.problems.errors.some(p=>p.code==='Q-EXPECTED'))));
test('domain environment pins extend candidate pins without erasing them',()=>seeded(t=>approvePacket(t,(p,r)=>{r.id='receipt-environment';r.pins.environment='fixture-node';p.change.propagation.forEach(x=>x.evidence=[r.id]);}),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));

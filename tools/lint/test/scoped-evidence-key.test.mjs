import test from 'node:test';
import assert from 'node:assert/strict';
import { plant } from '../self-test.mjs';
import { lintSpec } from '../index.mjs';
import { approvePacket } from '../controls-v3.mjs';
import { store,retirement,read,refreshPacket } from '../controls-evidence-heads.mjs';
import { completeMemberGraph } from '../controls-member-census.mjs';
import {assertFinalGraph} from './no-impact-graph-fixture.mjs';
const red=(r,code)=>{assert.equal(r.exitCode,1,JSON.stringify(r.problems.list));assert.ok(r.problems.errors.some(e=>e.code===code),JSON.stringify(r.problems.list));};
function seeded(mutate,check){const f=plant(mutate);try{check(lintSpec(f.root),f);}finally{f.cleanup();}}
export function preservedScope(t,pin='manifest',attack) {
 t.json('assets/graph.json',g=>{g.nodes.push({id:'us:US-02',kind:'us',revision:'1',source:'us/US-02.md'},{id:'ac:US-02.AC-01',kind:'ac',revision:'1',source:'us/US-02.md'});g.edges.push({from:'us:US-02',to:'ac:US-02.AC-01',relation:'derives',source:'us/US-02.md',revision:'1'});});
 t.json('assets/receipt.json',r=>r.pins[pin]='prior-'+pin);
 approvePacket(t,p=>{p.change.impact=[{node:'ac:US-02.AC-01',domain:'spec',classification:'direct',reason:'Independent member changed',path:['us:US-02','ac:US-02.AC-01']}];if(attack==='incomplete-closure')p.change.closure={complete:false,fallback:'us'};if(attack==='unknown')p.change.impact[0].classification='unknown';if(attack==='missing-seed')p.change.impact[0].node='rule:missing';});
 completeMemberGraph(t,{replace:true});assertFinalGraph(t);
 if(attack==='incomplete-graph')t.json('assets/graph.json',g=>g.complete=false);
 if(attack==='transitive')t.json('assets/graph.json',g=>g.edges.push({from:'ac:US-02.AC-01',to:'ac:US-01.AC-01',relation:'governs',source:'us/US-01.md',revision:'1'}));
 if(attack==='missing-graph')t.json('spec.manifest.json',m=>m.gate_model.graph='assets/absent-graph.json');
}
for(const pin of ['head','base','manifest']) {
 test(`scoped ${pin} drift with no-impact proof preserves approval`,()=>seeded(t=>preservedScope(t,pin),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
 test(`scoped ${pin} drift without proof blocks approval`,()=>seeded(t=>{t.json('assets/receipt.json',r=>r.pins[pin]='prior-'+pin);approvePacket(t);},r=>red(r,'Q-DECISION')));
 test(`accepted scoped gate preserves ${pin} drift with no-impact proof`,()=>seeded(t=>{preservedScope(t,pin);t.json('assets/records/gates/story.json',g=>{g.states.human='APPROVED';g.states.progress='accepted';g.decision='decision-1';});},r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
}
for(const attack of ['incomplete-closure','incomplete-graph','missing-graph','unknown','missing-seed','transitive'])test(`scoped drift cannot use ${attack} proof`,()=>seeded(t=>preservedScope(t,'manifest',attack),r=>red(r,'Q-DECISION')));
for(const pin of ['build','rules','evaluator'])test(`supersession rejects scoped ${pin} key drift`,()=>seeded(t=>retirement(t,(p,r,f)=>{f.pins[pin]='old-'+pin;store(t,f);}),r=>red(r,'Q-RECEIPT')));
test('scoped candidate-wide pin drift does not change the supersession key',()=>seeded(t=>retirement(t,(p,r,f)=>{f.pins.head='old-head';store(t,f);}),r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('handoff supersession rejects head pin drift',()=>seeded(t=>{retirement(t,(p,r,f)=>{f.pins.head='old-head';store(t,f);});t.json('assets/records/definitions/story/1.json',d=>d.stage='handoff');},r=>red(r,'Q-RECEIPT')));
for(const pin of ['head','base','manifest'])test(`handoff ${pin} drift remains strict despite no-impact proof`,()=>seeded(t=>{preservedScope(t,pin);t.json('assets/records/definitions/story/1.json',d=>d.stage='handoff');},r=>red(r,'Q-DECISION')));
test('supersession cycle retires nothing',()=>seeded(t=>retirement(t,(p,r,f)=>{f.supersedes=[{id:r.id,reason:'Circular observation'}];store(t,f);}),r=>{red(r,'Q-RECEIPT');assert.equal(r.model.validSupersessions.size,0);}));

test('new handoff receipt retires an old handoff reference only through an explicit edge',()=>seeded(t=>{retirement(t);t.json('assets/records/definitions/story/1.json',d=>d.stage='handoff');},r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));

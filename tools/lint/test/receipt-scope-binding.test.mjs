import test from 'node:test';
import assert from 'node:assert/strict';
import { plant } from '../self-test.mjs';
import { lintSpec } from '../index.mjs';
import { approvePacket } from '../controls-v3.mjs';
import { read,store,refreshPacket,retirement } from '../controls-evidence-heads.mjs';
import { evidenceKey } from '../receipt-evidence-key.mjs';
import { headReceipts,eligibleCurrentReceipts } from '../current-receipts.mjs';
import { digest } from '../../lib/digests.mjs';
import { completeMemberGraph } from '../controls-member-census.mjs';
import { hasDependencyCensus } from '../source-dependency-census.mjs';
import {assertFinalGraph} from './no-impact-graph-fixture.mjs';
const red=(r,code)=>{assert.equal(r.exitCode,1,JSON.stringify(r.problems.list));assert.ok(r.problems.errors.some(e=>e.code===code),JSON.stringify(r.problems.list));};
function seeded(mutate,check){const f=plant(mutate);try{check(lintSpec(f.root),f);}finally{f.cleanup();}}
function terminal(t) {
 const gate=read(t,'assets/records/gates/story.json');
 t.json('assets/change.json',c=>{Object.assign(c,{state:'Approved',scope:read(t,'assets/receipt.json').scope,candidate:gate.candidate,po_decision:'decision-1',packet:t.files().find(f=>f.endsWith('/packet-data.json')).split('/').at(-2)});c.propagation[0].status='verified';c.propagation[0].evidence=['receipt-spec'];});
}
for(const consumer of ['packet','aggregate','gate','terminal','scenario'])for(const wrong of [false,true])test(`${consumer} binds the current member revision wrong=${wrong}`,()=>seeded(t=>{
 if(['packet','aggregate','gate'].includes(consumer))approvePacket(t,p=>{if(consumer==='aggregate')p.aggregate_checks=['receipt-spec'];});
 if(consumer==='gate')t.json('assets/records/gates/story.json',g=>{g.states.human='APPROVED';g.states.progress='accepted';g.decision='decision-1';});
 if(['terminal','scenario'].includes(consumer))terminal(t);
 if(wrong){t.json('assets/receipt.json',r=>r.scope.revision='wrong-revision');if(['packet','aggregate','gate'].includes(consumer))refreshPacket(t);}
},r=>wrong?red(r,consumer==='gate'?'Q-REVIEW':['terminal','scenario'].includes(consumer)?'Q-PROPAGATION':'Q-DECISION'):assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
test('terminal cannot qualify evidence without current membership',()=>seeded(t=>{terminal(t);t.remove('assets/records/candidates');t.remove('assets/records/packets');},r=>red(r,'Q-PROPAGATION')));
test('terminal binds its own current scope before counting a correct receipt',()=>seeded(t=>{terminal(t);t.json('assets/change.json',c=>c.scope.revision='wrong-current-scope');},r=>red(r,'Q-PROPAGATION')));
for(const wrong of [false,true])test(`US membership binds covered AC and scenario wrong=${wrong}`,()=>seeded(t=>{},r=>{
 const receipt=structuredClone(r.model.receipts[0].value),member={kind:'us',id:'US-01',artifacts:receipt.artifacts,revision:digest(receipt.artifacts)},membership={version:'1',members:[member]},scope={kind:'us',ids:['US-01'],revision:digest([member])};
 receipt.pins.manifest=digest(membership);receipt.scope={...scope,revision:wrong?'wrong-revision':scope.revision};
 for(const [kind,id] of [['ac','US-01.AC-01'],['scn','US-01.SCN-01-01']])assert.equal(eligibleCurrentReceipts(r.model,[receipt],kind,id,receipt.pins,undefined,new Map(),{membership,scope}).length,wrong?0:1);
}));
for(const missing of ['story','edge','none'])test(`declared story dependency belongs to the ancestor census missing=${missing}`,()=>seeded(t=>{
 t.edit('us/US-01.md',s=>s.replace('  req: [REQ-01]','  req: [REQ-01]\n  us: [US-02]'));completeMemberGraph(t);
},r=>{
 const model=r.model;
 if(missing==='story'){model.graph.nodes=model.graph.nodes.filter(n=>n.id!=='us:US-02');model.graph.edges=model.graph.edges.filter(e=>e.to!=='us:US-02' && e.from!=='us:US-02');}
 if(missing==='edge')model.graph.edges=model.graph.edges.filter(e=>e.from!=='us:US-02');
 assert.equal(hasDependencyCensus(model,['ac:US-01.AC-01']),missing==='none');
}));
for(const [pin,version] of [['evaluator','evaluator_version'],['rules','ruleset_version']]) {
 test(`${pin} pins must bind the review version before it is a head`,()=>seeded(t=>{t.json('assets/receipt.json',r=>r.pins[pin]='2');approvePacket(t);},r=>{red(r,'Q-RECEIPT');assert.equal(headReceipts(r.model,[r.model.receipts[0].value],'ac','US-01.AC-01',r.model.receipts[0].value.pins).length,0);}));
 test(`${pin} matching pinned review version qualifies`,()=>seeded(t=>{t.json('assets/receipt.json',r=>{r.pins[pin]='2';r.review[version]='2';});approvePacket(t);},r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
 test(`unpinned ${pin} review versions form different keys`,()=>seeded(t=>{},r=>{const a=r.model.receipts[0].value,b=structuredClone(a);b.review[version]='2';assert.notEqual(evidenceKey(r.model,a,'ac','US-01.AC-01'),evidenceKey(r.model,b,'ac','US-01.AC-01'));}));
 test(`unpinned ${pin} version drift cannot supersede`,()=>seeded(t=>retirement(t,(p,r)=>{r.review[version]='2';store(t,r,'assets/receipt.json');}),r=>{red(r,'Q-RECEIPT');red(r,'Q-DECISION');}));
}
test('accepted Minor head retains approval with PO reason and follow-up',()=>seeded(t=>{t.json('assets/receipt.json',r=>{r.review.verdict='NEEDS_CHANGES';r.review.findings=[{id:'minor-1',criterion:'quality',file:'us/US-01.md',line:1,impact:'Copy clarity',fix:'Review copy',owner:'Dev',severity:'Minor',disposition:'accepted-minor',accepted_by:'po@example.test',reason:'Retained copy issue',follow_up:'Review copy before publication'}];});approvePacket(t);},r=>assert.equal(r.exitCode,0,JSON.stringify(r.problems.list))));
for(const attack of ['owner','edge','prerequisite','prerequisite-edge','provenance-edge','reachable','none'])test(`no-impact proof validates declared ancestors attack=${attack}`,()=>seeded(t=>{
 t.json('spec.manifest.json',m=>m.gate_model.changes=[]);
 t.json('assets/graph.json',g=>{
  g.nodes.push({id:'us:US-02',kind:'us',revision:'1',source:'us/US-02.md'},{id:'ac:US-02.AC-01',kind:'ac',revision:'1',source:'us/US-02.md'});
  g.edges.push({from:'us:US-02',to:'ac:US-02.AC-01',relation:'derives',source:'us/US-02.md',revision:'1'});
 });
 t.json('assets/receipt.json',r=>r.pins.manifest='prior-manifest');
 approvePacket(t,p=>p.change.impact=[{node:'ac:US-02.AC-01',domain:'spec',classification:'direct',reason:'Independent member changed',path:['us:US-02','ac:US-02.AC-01']}]);
 completeMemberGraph(t,{replace:true});assertFinalGraph(t);
 if(attack!=='none')t.json('assets/graph.json',g=>{
  const before=JSON.stringify(g);
  if(attack==='owner'){g.nodes=g.nodes.filter(n=>n.id!=='us:US-01');g.edges=g.edges.filter(e=>e.from!=='us:US-01' && e.to!=='us:US-01');}
  if(attack==='edge')g.edges=g.edges.filter(e=>e.to!=='ac:US-01.AC-01');
  if(attack==='prerequisite'){g.nodes=g.nodes.filter(n=>n.id!=='req:REQ-01');g.edges=g.edges.filter(e=>e.from!=='req:REQ-01');}
  if(attack==='prerequisite-edge')g.edges=g.edges.filter(e=>e.from!=='req:REQ-01');
  if(attack==='provenance-edge')g.edges.find(e=>e.from==='req:REQ-01').relation='mentions';
  if(attack==='reachable')g.edges.push({from:'ac:US-02.AC-01',to:'us:US-01',relation:'governs',source:'us/US-01.md',revision:'1'});
  assert.notEqual(JSON.stringify(g),before,attack);
 });
},r=>attack==='none'?assert.equal(r.exitCode,0,JSON.stringify(r.problems.list)):red(r,'Q-DECISION')));
for(const missing of ['contract','amendment','contract-edge','affected-edge','none'])test(`amendment dependency census requires owning contract and affected edge missing=${missing}`,()=>seeded(t=>completeMemberGraph(t),r=>{
 const model=r.model;
 if(missing==='contract')model.graph.nodes=model.graph.nodes.filter(n=>n.id!=='contract:fc-001');
 if(missing==='amendment')model.graph.nodes=model.graph.nodes.filter(n=>n.id!=='amendment:fc-001.A-01');
 if(missing==='contract-edge')model.graph.edges=model.graph.edges.filter(e=>e.from!=='contract:fc-001');
 if(missing==='affected-edge')model.graph.edges=model.graph.edges.filter(e=>e.from!=='amendment:fc-001.A-01');
 assert.equal(hasDependencyCensus(model,['ac:US-03.AC-01']),missing==='none');
}));

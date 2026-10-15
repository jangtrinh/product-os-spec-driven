import test from 'node:test';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plant } from '../self-test.mjs';
import { lintSpec } from '../index.mjs';
import { declaredFixtureGraph } from './declared-graph-fixture.mjs';
import {censusGraph} from '../../../fixtures/runner/census-graph.mjs';
import {declaredRelationCensus} from '../../lib/declared-relation-census.mjs';
import { hasDependencyCensus } from '../source-dependency-census.mjs';

const doc=(id,type,fm={})=>({id,type,rel:`${type}/${id}.md`,body:'',bodyLine:1,fm:{id,type,...fm}});
function model() {
  const a=doc('US-01','us'),b=doc('US-02','us'),prd=doc('prd','prd'),contract=doc('fc','contract');
  return {docs:[a,b,prd,contract],stories:[{doc:a,ac:{rows:[{id:'AC-01'}]}},{doc:b,ac:{rows:[]}}],
    reqs:[{id:'REQ-01',doc:prd}],contractDocs:[contract],withAmend:[],decisions:[],inventory:{screens:[]},uiRows:[],
    graph:{nodes:[{id:'us:US-01'},{id:'ac:US-01.AC-01'}],edges:[{from:'us:US-01',to:'ac:US-01.AC-01',relation:'derives'}]}};
}
const edge=(m,from,to,relation='governs')=>{
  for(const id of [from,to])if(!m.graph.nodes.some(n=>n.id===id))m.graph.nodes.push({id});
  m.graph.edges.push({from,to,relation});
};
const cases=[
  ['req',m=>{m.docs[0].fm.trace={req:['REQ-01']};edge(m,'req:REQ-01','us:US-01');},'req:REQ-01','artifact:us/US-01.md'],
  ['us',m=>{m.docs[0].fm.trace={us:['US-02']};edge(m,'us:US-02','us:US-01');},'us:US-02','artifact:us/US-01.md'],
  ['ac',m=>{m.stories[1].ac.rows=[{id:'AC-01'}];m.docs[0].fm.trace={ac:['US-02.AC-01']};edge(m,'us:US-02','ac:US-02.AC-01','derives');edge(m,'ac:US-02.AC-01','us:US-01');},'ac:US-02.AC-01','artifact:us/US-01.md'],
  ['decisions',m=>{m.decisions=[{id:'D1'}];m.docs[0].fm.trace={decisions:['D1']};edge(m,'decision:D1','us:US-01');},'decision:D1','artifact:us/US-01.md'],
  ['amendments',m=>{m.withAmend=[{doc:m.docs[3],amend:{items:[{id:'A-01',rows:[]}]}}];m.docs[0].fm.trace={amendments:['fc.A-01']};edge(m,'contract:fc','amendment:fc.A-01','derives');edge(m,'amendment:fc.A-01','us:US-01');},'amendment:fc.A-01','artifact:us/US-01.md'],
  ['screen',m=>{m.docs[0].fm.screens=['S01'];m.inventory.screens=[{screen:'S01',state:'normal'}];edge(m,'us:US-01','screen-state:S01/normal','renders');},'us:US-01','screen-state:S01/normal'],
  ['board',m=>{m.docs[0].fm.boards=['W-01'];edge(m,'board:W-01','us:US-01','uses');},'us:US-01','board:W-01'],
  ['ui-contract',m=>{m.docs.push(doc('ui','ui-contract'));m.uiRows=[{screen:'S01',state:'normal',us:['US-01'],used_by:[],file:'ui-contract/ui.md'}];edge(m,'us:US-01','screen-state:S01/normal','renders');edge(m,'screen-state:S01/normal','artifact:ui/S01/normal','renders');edge(m,'us:US-01','artifact:ui/S01/normal','implements');},'us:US-01','screen-state:S01/normal'],
  ['scenario',m=>{m.docs[0].fm.scenarios=[{id:'SCN-01',ac:['AC-01']}];edge(m,'ac:US-01.AC-01','scenario:US-01.SCN-01','verifies');},'ac:US-01.AC-01','scenario:US-01.SCN-01'],
];
function materialize(m) {
  for(const story of m.stories)story.doc.body='## 4. Acceptance criteria\n| ID | Then |\n|---|---|\n'+story.ac.rows.map(a=>`| ${a.id} | Outcome |`).join('\n');
  m.docs[2].body='| ID | Requirement | Source |\n|---|---|---|\n| REQ-01 | Outcome | — |';
  if(m.decisions.length || m.withAmend.length) {
    if(!m.ledger){m.ledger=doc('ledger','decisions',{ledger:true});m.docs.push(m.ledger);}
    m.ledger.body='| Id | Decision | Detail |\n|---|---|---|\n| D1 | Authorize | — |';
  }
  for(const x of m.withAmend)x.doc.body='# Amendment A-01 (2026-10-07, po@example.test, D1) — Change';
  for(const ui of m.docs.filter(d=>d.type==='ui-contract'))ui.body='| Screen | State | US | SCN |\n|---|---|---|---|\n'+m.uiRows.map(r=>`| ${r.screen} | ${r.state} | ${r.us.join(',')} | ${r.used_by.join(',')} |`).join('\n');
  m.graph=censusGraph(m);
}
for(const [name,declare,from,to] of cases)for(const omission of ['edge','node'])test(`declared ${name}: GREEN complete and RED missing ${omission}`,()=>{
  const m=model();declare(m);materialize(m);
  assert.ok(m.graph.edges.some(e=>e.from===from && e.to===to),`${name} independent expected edge`);
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),true,`${name} complete`);
  if(omission==='edge')m.graph.edges=m.graph.edges.filter(e=>e.from!==from || e.to!==to);
  else m.graph.nodes=m.graph.nodes.filter(n=>n.id!==(from==='us:US-01' || from==='ac:US-01.AC-01'?to:from));
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),false,`${name} omitted`);
});
test('every declared relation present remains GREEN across a cycle',()=>{
  const m=model();for(const [,declare] of cases)declare(m);
  m.docs[0].fm.trace={req:['REQ-01'],us:['US-02'],ac:['US-02.AC-01'],decisions:['D1'],amendments:['fc.A-01']};
  m.docs[1].fm.trace={us:['US-01']};materialize(m);
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),true);
});
for(const relation of ['mentions','history','supersedes'])test(`provenance ${relation} cannot establish a declared dependency`,()=>{
  const m=model();m.docs[0].fm.trace={req:['REQ-01']};edge(m,'req:REQ-01','us:US-01',relation);
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),false);
});
test('an unknown declared trace field cannot be silently omitted',()=>{
  const m=model();m.docs[0].fm.trace={unknown:['rule-1']};
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),false);
});
test('legacy screen table supplies an explicit screen link without inventing a state',()=>{
  const m=model(),inventory=doc('inventory','ux',{inventory:true});m.docs.push(inventory);
  inventory.body='| Screen | Story |\n|---|---|\n| S01 | US-01 |\n';m.docs[0].fm.screens=['S01'];
  edge(m,'us:US-01','screen-state:S01','renders');
  assert.equal(declaredRelationCensus(m).complete,false);
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),false);
  m.graph.edges=m.graph.edges.filter(e=>e.to!=='screen-state:S01');
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),false);
});
test('a decision ancestor inherits every trace on its owning ledger',()=>{
  const m=model(),ledger=doc('ledger','decisions',{trace:{req:['REQ-01']}});m.docs.push(ledger);m.ledger=ledger;m.decisions=[{id:'D1'}];
  m.docs[0].fm.trace={decisions:['D1']};materialize(m);
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),true);
  m.graph.edges=m.graph.edges.filter(e=>e.from!=='req:REQ-01');
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),false);
});
test('document identity joins form finite cycles without emitting self edges',()=>{
  const m=model();m.docs[0].fm.trace={us:['US-01']};
  materialize(m);
  assert.ok(declaredRelationCensus(m).edges.every(e=>e.from!==e.to));
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),true);
});
test('an unresolved UI scenario is retained as unavailable proof',()=>{
  const m=model();cases.find(c=>c[0]==='ui-contract')[1](m);m.uiRows[0].used_by=['SCN-99-01'];m.docs.at(-1).body='| Screen | State | US | SCN |\n|---|---|---|---|\n| S01 | normal | US-01 | SCN-99-01 |';
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),false);
});
test('source-only CLI relation matrix blocks every omission and preserves the independent GREEN',()=>{
  const cli=spawnSync(process.execPath,[fileURLToPath(new URL('./declared-relations-cli-control.mjs',import.meta.url))],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stdout+cli.stderr);
  const rows=cli.stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(rows.length,24);
  assert.equal(rows.filter(r=>r.mode==='independent' && r.exit===0).length,2);
  assert.equal(rows.filter(r=>r.expected===1 && r.exit===1 && r.codes.includes('Q-DECISION')).length,22);
});
const amendmentId='amendment:fc-001.A-01', contractFile='contract/FC-001.md';
for(const attack of ['none','amendment-bare','amendment-anchor','amendment-source','amendment-wrong-document','amendment-heading-only-bare','decision-source','contract-relation','amendment-relation','decision-relation'])test(`typed amendment and decision graph joins attack=${attack}`,()=>{
  const f=plant(t=>{
    if(attack==='amendment-heading-only-bare')t.edit(contractFile,s=>s.replace(/\namendments:\n[\s\S]*?\n---/,'\n---'));
    const graph=declaredFixtureGraph(t.root);
    t.write('assets/graph.json',JSON.stringify(graph));
  });
  try {
    const baseline=lintSpec(f.root);
    assert.equal(baseline.exitCode,0,JSON.stringify(baseline.problems.list));
    const graph=baseline.model.graph, original=structuredClone(graph);
    const amendment=graph.nodes.find(n=>n.id===amendmentId);
    const sources=declaredRelationCensus(baseline.model).nodeSources.get(amendmentId);
    const anchor=[...sources].find(source=>source.includes('#'));
    assert.ok(anchor?.startsWith(contractFile+'#amendment-a-01-'));
    if(attack!=='amendment-heading-only-bare')assert.ok(sources.has(contractFile));
    else assert.equal(sources.has(contractFile),false);
    if(attack==='amendment-bare'||attack==='amendment-heading-only-bare')amendment.source=contractFile;
    if(attack==='amendment-anchor')amendment.source=anchor;
    if(attack==='amendment-source')amendment.source=contractFile+'#wrong-amendment';
    if(attack==='amendment-wrong-document')amendment.source='prd/PRD.md';
    if(attack==='decision-source')graph.nodes.find(n=>n.id==='decision:D1').source='prd/PRD.md';
    if(attack==='contract-relation')graph.edges.find(e=>e.from==='contract:fc-001' && e.to===amendmentId).relation='governs';
    const affected=graph.edges.find(e=>e.from===amendmentId && e.to==='ac:US-03.AC-01');
    assert.equal(affected?.relation,'governs');
    if(attack==='amendment-relation')affected.relation='derives';
    if(attack==='decision-relation')graph.edges.find(e=>e.from==='decision:D1' && e.to==='artifact:us/US-01.md').relation='derives';
    const positive=['none','amendment-bare','amendment-anchor'].includes(attack);
    if(!positive)assert.notDeepEqual(graph,original,'attack must change the GREEN graph');
    const file=f.root+'/assets/graph.json';
    writeFileSync(file,JSON.stringify(graph));
    const result=lintSpec(f.root);
    assert.equal(result.exitCode,positive?0:1,JSON.stringify(result.problems.list));
    if(!positive)assert.ok(result.problems.errors.some(p=>p.code==='Q-GRAPH'));
    writeFileSync(file,JSON.stringify(original));
    const restored=lintSpec(f.root);
    assert.equal(restored.exitCode,0,JSON.stringify(restored.problems.list));
  } finally {f.cleanup();}
});
test('ancestor document declarations are followed transitively',()=>{
  const m=model();m.docs[0].fm.trace={req:['REQ-01']};m.docs[2].fm.trace={decisions:['D1']};m.decisions=[{id:'D1'}];
  materialize(m);
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),true);
  m.graph.edges=m.graph.edges.filter(e=>e.from!=='decision:D1');
  assert.equal(hasDependencyCensus(m,['ac:US-01.AC-01']),false);
});

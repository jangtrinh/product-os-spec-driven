import {definitionRevision} from '../lib/definition-scope.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { hash,digest,canonical } from '../lib/digests.mjs';
export function completeFixture(root) {
  const write=(rel,value)=>{const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
  const bytes=rel=>fs.readFileSync(path.join(root,rel)),sha=rel=>hash(bytes(rel));
  const manifest=JSON.parse(bytes('spec.manifest.json'));
  const scope={kind:'ac',ids:['US-01.AC-01'],revision:'fixture-revision'};
  const versions={workflow:'1',templates:'1',ruleset:'1',skill:'none'};
  const states=['normal','empty','loading','error','disabled','focus','long-content','no-permission'];
  write('assets/tokens.json',{version:'1',spacing:8});write('assets/rubric.txt','Mandatory quality criteria.');
  write('assets/catalog.json',{version:'1',adapter:'example',kind:'component',items:[{handle:'Button',name:'Button',status:'active'}]});
  const profile={id:'example',version:'1',authority:[{id:'identity',path:'README.md',revision:sha('README.md'),kind:'identity',non_waivable:true}],tokens:{owner:'Dev',source:'assets/tokens.json',revision:sha('assets/tokens.json'),generated:[],sync_direction:'source to generated'},catalogs:[{id:'example',path:'assets/catalog.json',revision:sha('assets/catalog.json'),kind:'component'}],capabilities:[{id:'browser',status:'available',reason:'local fixture'}],rubrics:{core:'assets/rubric.txt',adapter:[]},evidence_providers:[],locales:['vi','en'],viewports:[{width:375,height:800},{width:768,height:1024},{width:1440,height:900}],modes:['light','dark'],inputs:['README.md']};
  write('assets/profile.json',profile);
  const rows=[];for(const [screen,us,scns] of [['S01','US-01',['SCN-01-01','SCN-01-02']],['S02','US-02',['SCN-02-01']],['S03','US-03',['SCN-03-01','SCN-03-02']]]) for(const state of states) rows.push({screen,state,route:`/filters/${screen.toLowerCase()}`,roles:['Dev'],scope:['workspace'],us:[us],ac:scns.map((s,i)=>`${us}.AC-0${i+1}`),scenarios:scns.map(s=>`${us}.${s}`),flow:'not-applicable: fixture flow described in US',boards:[],components:['example/Button'],patterns:[],data:'not-applicable: local sample inputs',source:{kind:'not-created',ref:null,reason:'No external canvas selected'},availability:'all local demo users',overlay:'none',consequences:['Complete the requested filter action'],evidence:[]});
  write('assets/inventory.json',{version:'1',screens:rows});
  write('ux/inventory.md','---\nid: structured-inventory\ntype: screen-inventory\ntitle: Screens and states\nupdated: 2026-01-09\ndata: assets/inventory.json\n---\n\n## Screens and states\nStructured records: [inventory](../assets/inventory.json).\n\n## Flow and disclosure\nEach row joins its owning US.\n\n## Gaps and departures\nNo external source selected; no visual acceptance claimed.\n');
  write('ux/ui-contract.md','---\nid: ui-contract\ntype: ui-contract\ntitle: Behavioral selectors\nupdated: 2026-01-09\n---\n\n| Screen | State | Route | Roles | Scope | US | Element | Kind | Components | Patterns | Target | SCN |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n'+rows.map(r=>`| ${r.screen} | ${r.state} | ${r.route} | Dev | workspace | ${r.us[0]} | role=button; name=Complete filter action | button | example/Button | — | Complete the requested action | ${r.scenarios.map(s=>s.split('.')[1]).join(', ')} |`).join('\n')+'\n');
  write('assets/sources.json',{generated:true,generator:'fixture-generator',version:'1',at:'2026-01-09T00:00:00Z',inputs:{'README.md':sha('README.md')},entries:[]});
  const pins={head:'fixture-head',base:'fixture-base',manifest:'fixture-manifest',build:'not-built'};
  const receipt={id:'receipt-spec',scope,at:'2026-01-09T00:00:00Z',freshness:'CURRENT',pins,execution:{command:'node test',cwd:'tests',exit:0,result:'PASS',selected:1,total:1,skipped:[],baseline_debt:[],red_controls:['missing-fixture'],recovery:'rerun after changes'},review:{builder:'Dev',reviewer:'QC',independent:true,evaluator_version:'1',prompt_version:'1',ruleset_version:'1',verdict:'PASS',inputs:['us/US-01.md'],criteria:[{id:'quality',mandatory:true,score:2,evidence:'us/US-01.md'}],findings:[]},coverage:{ac:['US-01.AC-01'],scenarios:['US-01.SCN-01-01'],passed:[],na:[]},artifacts:{'us/US-01.md':sha('us/US-01.md')},domain:'spec'};
  write('assets/receipt.json',receipt);
  const fail=structuredClone(receipt);fail.id='receipt-red';fail.execution.exit=1;fail.execution.result='FAIL';fail.review.verdict='FAIL';fail.review.criteria[0].score=0;write('assets/red-receipt.json',fail);
  write('assets/graph.json',{version:'1',complete:true,nodes:[{id:'us:US-01',kind:'us',revision:'1',source:'us/US-01.md'},{id:'ac:US-01.AC-01',kind:'ac',revision:'1',source:'us/US-01.md'}],edges:[{from:'us:US-01',to:'ac:US-01.AC-01',relation:'derives',source:'us/US-01.md',revision:'1'}]});
  write('assets/change.json',{id:'CS-filter',baseline:pins,candidate:null,scope,source:'A-01',reason:'Fixture repair',state:'Proposed',impact:[{node:'ac:US-01.AC-01',domain:'spec',classification:'direct',reason:'Rule changed',path:['us:US-01','ac:US-01.AC-01']}],propagation:[{behavior:'Require confirmation',ac:['US-01.AC-01'],scenario:['US-01.SCN-01-01'],ui:['S01/normal'],evidence:[],status:'not-run',review:'QC must inspect semantics'}],po_decision:null,regates:[],packet:null,receivers:[]});
  write('assets/records/definitions/story/1.json',{id:'story',version:'1',stage:'us',scope,inputs:['us/US-01.md'],outputs:['assets/receipt.json'],checks:[{id:'lint',command:'node lint',mandatory:true,blocker_policy:'any error blocks'}],reviewer:'QC',decider:'po',transitions:['advance','repair'],invalidation:'typed closure; BR-14 fallback',exceptions:[],versions});
  write('assets/records/gates/story.json',{definition:{id:'story',version:'1'},scope,states:{eval:'PASS',review:'PASS',human:'PENDING',freshness:'CURRENT',progress:'draft',delivery:'draft'},receipts:['receipt-spec'],rounds:{cycle:'cycle-1',eval_fix:0,review:1,max_fix:3,max_review:3,continuation:null},decision:null,exception_ids:[],candidate:pins});
  write('assets/records/transitions/repair-1.json',{id:'repair-1',kind:'repair',opener:'Dev',at:'2026-01-09T00:00:00Z',source:'D1',reason:'same acceptance repair',from:{stage:'us',scope,revision:'1'},to:{stage:'us',scope,revision:'2'},impact:[{node:'ac:US-01.AC-01',domain:'spec',classification:'direct',reason:'repair',path:['ac:US-01.AC-01']}],authority:'dev',decision:'D1',regates:['story']});
  write('assets/records/exceptions/no-ui.json',{id:'no-ui',kind:'applicability',scope,source:'D1',reason:'no UI acceptance at spec stage',by:'po@example.test',at:'2026-01-09T00:00:00Z',expires:'2030-01-09T00:00:00Z',deferred_gates:[],compensating_checks:['spec review'],non_waivable:['mandatory quality'],status:'active'});
  write('assets/records/clarify/Q-001.json',{id:'Q-001',stage:'clarify',round:1,question:'Should filters be personal?',options:['Personal','Shared'],recommended:0,depends_on:['US-01.AC-01'],status:'answered',asked_at:'2026-01-08T00:00:00Z',answer:'Personal',decided_by:'po@example.test',decided_at:'2026-01-09T00:00:00Z',decision_ref:'D1'});
  write('assets/records/expected/XC-001.json',{id:'XC-001',target:{kind:'ac',id:'US-01.AC-01'},before:'No confirmation',after:'Confirmation required',reason:'owner ruling',requested_by:'po@example.test',requested_at:'2026-01-08T00:00:00Z',status:'approved',decided_by:'po@example.test',decided_at:'2026-01-09T00:00:00Z',amendment_ref:'fc-001.A-01',red_history:[{receipt:'receipt-red',result:'FAIL'}]});
  write('assets/records/audit.jsonl',JSON.stringify({id:'event-1',at:'2026-01-09T00:00:00Z',actor:'PO',type:'decision',scope,before:null,after:'1',refs:['D1'],reason:'fixture',previous_sha256:null})+'\n');
  manifest.design={profile:'assets/profile.json',inventory:'assets/inventory.json',sources:'assets/sources.json',evidence:[]};manifest.gate_model={graph:'assets/graph.json',changes:['assets/change.json'],receipts:['assets/receipt.json','assets/red-receipt.json'],records:'assets/records'};
  write('spec.manifest.json',manifest);
}

// Rebind only definition/gate scope projections; leave content evidence intact.
export function rebindFixtureScopes(root) {
 const directory=path.join(root,'assets/records/definitions');
 const definitions=[];
 for(const id of fs.readdirSync(directory))for(const version of fs.readdirSync(path.join(directory,id))) {
  const file=path.join(directory,id,version),definition=JSON.parse(fs.readFileSync(file,'utf8'));
  definition.scope={...definition.scope,revision:definitionRevision(definition)};
  fs.writeFileSync(file,JSON.stringify(definition,null,2)+'\n');definitions.push(definition);
 }
 const gates=path.join(root,'assets/records/gates');
 for(const name of fs.readdirSync(gates)) {
  const file=path.join(gates,name),gate=JSON.parse(fs.readFileSync(file,'utf8'));
  const definition=definitions.find(d=>d.id===gate.definition.id&&d.version===gate.definition.version);
  if(!definition)throw new Error('Missing fixture gate definition: '+name);
  gate.scope=definition.scope;fs.writeFileSync(file,JSON.stringify(gate,null,2)+'\n');
 }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadConfig, STAGES} from '../../lib/config/config-loader.mjs';
import {declaredOutputs} from '../project-registries.mjs';
import {stageContext} from '../stage-context.mjs';
import {loadRegistries} from '../registries.mjs';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {REVIEW_REQUIRED_STAGES,validateConfig} from '../../lib/config/config-loader.mjs';
import {hasKitHistory} from './kit-history.mjs';
const kit=fileURLToPath(new URL('../../../',import.meta.url));
const expected=['intake','clarify','contract','prd','us','wireframe','prototype','design','tdd','uiux','handoff'];
test('runner uses canonical stage order even with reversed YAML keys and requires design skills on the new stages',t=>{
 const p=projectFixture(t,['wireframe','prototype']);p.config.stages=Object.fromEntries(Object.entries(p.config.stages).reverse());p.save();
 const result=p.run();assert.equal(result.code,2,result.out);assert.match(p.gate('wireframe').raw,/^GATE: PENDING/);assert.equal(fs.existsSync(path.join(p.root,'review/gates/prototype.md')),false);
 for(const stage of ['wireframe','prototype']){assert.ok(REVIEW_REQUIRED_STAGES.includes(stage));const c=structuredClone(p.config);delete c.stages[stage].skill;assert.throws(()=>validateConfig(c),new RegExp(`stages.${stage}.skill`));}
});
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ui-stages-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function call(root,args=[],entry=path.join(kit,'tools/run/init.mjs')){return spawnSync(process.execPath,[entry,'--project',root,...args],{encoding:'utf8',timeout:30000});}
test('canonical order, enabled PO gates and literal outputs do not require the optional design adapter',t=>{
 assert.deepEqual(STAGES,expected);
 const root=temp(t),r=call(root,['--name','Fixture','--lang','en']);assert.equal(r.status,0,r.stdout+r.stderr);
 const c=loadConfig(root);assert.equal(c.design_adapter,undefined);assert.equal(fs.existsSync(path.join(root,'context/design')),false);
 for(const [stage,output] of [['wireframe','spec/wireframe/wireframes.md'],['prototype','spec/prototype/index.html']]){
  assert.equal(c.stages[stage].enabled,true);assert.equal(c.stages[stage].owner,'po');assert.deepEqual(JSON.parse(JSON.stringify(c.stages[stage].skill)),{capability:'design',skills:['es-designer']});
  assert.deepEqual(declaredOutputs(root,stage),[output]);assert.deepEqual(JSON.parse(JSON.stringify(c.gates.stage_definitions[stage])),{id:stage,version:'1'});
 }
 const doctor=spawnSync(process.execPath,[path.join(kit,'tools/run/doctor.mjs'),'--project',root],{encoding:'utf8'});assert.equal(doctor.status,0,doctor.stdout+doctor.stderr);
});
test('default handoff skips absent reviews from disabled design and uiux producers',t=>{
 const root=temp(t),r=call(root,['--name','Fixture','--lang','en']);assert.equal(r.status,0,r.stdout+r.stderr);
 const c=loadConfig(root);
 for(const entry of c.stages.handoff.context){if(entry==='spec/reviews/')continue;const file=path.join(root,entry.endsWith('/')?entry+'fixture.md':entry);if(!fs.existsSync(file)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'Fixture context\n');}}
 const context=stageContext(root,c,loadRegistries(root,c),'handoff');assert.ok(context.skipped.includes('spec/reviews/'));
});
test('reviews remain required if design is enabled while uiux is disabled',t=>{
 const p=projectFixture(t,['handoff']);const registry=loadRegistries(p.root,p.config);p.config.stages.design.enabled=true;p.config.stages.handoff.context=['spec/reviews/'];p.definitions.handoff.inputs=['spec/reviews/'];p.save();
 assert.throws(()=>stageContext(p.root,p.config,registry,'handoff'),/Missing or empty context\/selection: spec\/reviews\//);
});
test('2.0.2 upgrade adds stages and definitions without changing upstream approvals; dry-run writes nothing',t=>{
 if (!hasKitHistory(t, kit, 'a4dbef45704b6f887d45d350c895d018b9a78db9')) return;
 const old=temp(t),archive=spawnSync('git',['archive','a4dbef45704b6f887d45d350c895d018b9a78db9','SPEC.md','format','templates','rules','prompts','tools','evals','config'],{cwd:kit,maxBuffer:100*1024*1024});assert.equal(archive.status,0);
 assert.equal(spawnSync('tar',['-x','-C',old],{input:archive.stdout}).status,0);
 const root=temp(t);let r=call(root,['--name','Legacy','--lang','en'],path.join(old,'tools/run/init.mjs'));assert.equal(r.status,0,r.stdout+r.stderr);
 const records=['intake','clarify','contract','prd','us'].map(s=>`review/gates/${s}.md`).concat('review/decisions/owner.json');
 for(const f of records){fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),'Owner fixture record, preserved byte for byte\n');}
 const snapshots=records.map(f=>fs.readFileSync(path.join(root,f)));const before=fs.readFileSync(path.join(root,'kit.lock.json'));
 r=call(root,['--upgrade','--dry-run']);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/config stages.wireframe: new-default/);assert.match(r.stdout,/new definition review\/definitions\/prototype\/1.json/);assert.deepEqual(fs.readFileSync(path.join(root,'kit.lock.json')),before);assert.equal(fs.existsSync(path.join(root,'prompts/prototype.md')),false);
 r=call(root,['--upgrade']);assert.equal(r.status,0,r.stdout+r.stderr);const c=loadConfig(root);assert.equal(c.stages.wireframe.enabled,true);assert.equal(c.stages.prototype.enabled,true);
 assert.ok(Object.keys(c.stages).indexOf('wireframe')>Object.keys(c.stages).indexOf('handoff'),'upgrade appends YAML keys');assert.deepEqual(STAGES,expected);
 records.forEach((f,i)=>assert.deepEqual(fs.readFileSync(path.join(root,f)),snapshots[i]));assert.notEqual(c.gates.stage_definitions.tdd.version,'1');assert.notEqual(c.gates.stage_definitions.handoff.version,'1');
});

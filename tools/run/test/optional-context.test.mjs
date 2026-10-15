import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {loadConfig,validateConfig} from '../../lib/config/config-loader.mjs';
import {selectFiles} from '../../lib/config/path-selection.mjs';
import {stageContext,writerPrompt} from '../stage-context.mjs';
import {loadRegistries} from '../registries.mjs';
import {invalidateGates} from '../invalidate-gates.mjs';
import {projectStatus} from '../status.mjs';
const settings=(p,stage,pattern='context/custom/**')=>{p.config.stages[stage].optional_context=[pattern];p.save();};
test('generic optional selectors accept absent/empty folders; loaded bytes are declared and hashed verbatim',t=>{
 const p=projectFixture(t);settings(p,'prd');let c=loadConfig(p.root),r=loadRegistries(p.root,c);let ctx=stageContext(p.root,c,r,'prd');assert.ok(ctx.skipped.includes('context/custom/**'));
 fs.mkdirSync(path.join(p.root,'context/custom'),{recursive:true});assert.equal(stageContext(p.root,c,r,'prd').context.filter(x=>x.startsWith('context/custom/')).length,0);
 p.write('context/custom/note.md','  Prepared\r\n');ctx=stageContext(p.root,c,r,'prd');assert.ok(ctx.inputs['context/custom/note.md']);assert.ok(ctx.declared.includes('context/custom/note.md'));assert.ok(writerPrompt(p.root,'prd',ctx.context,['spec/prd.txt']).includes('  Prepared\r\n'));
});
test('optional selector configuration validates type, duplicate, relative containment and required overlap',t=>{
 const p=projectFixture(t);p.config.stages.prd.optional_context=['context/prepared/**'];assert.doesNotThrow(()=>validateConfig(p.config));for(const value of [true,['x','x'],['../escape'],['/absolute'],['input/po-spec.txt']]){p.config.stages.prd.optional_context=value;assert.throws(()=>{validateConfig(p.config);p.save();loadConfig(p.root);},/optional_context|Invalid.*path/);}
});
test('adding empty optional selectors preserves approved gates on actual runner traversal',t=>{
 const p=projectFixture(t,['prd','us']);p.config.roles.po.enabled=false;p.save();assert.equal(p.run().code,0);const before=['prd','us'].map(s=>p.gate(s).raw);
 settings(p,'prd');assert.equal(p.run().code,0);assert.deepEqual(['prd','us'].map(s=>p.gate(s).raw),before);
});
for(const kind of ['sources','ui'])test(`${kind} loading after approval stales precisely consuming stages and candidates bind loaded files`,t=>{
 const p=projectFixture(t,['prd','us','wireframe','prototype','tdd']);p.config.roles.po.enabled=false;
 const readers=kind==='sources'?['prd','us']:['wireframe','prototype'];for(const stage of readers)p.config.stages[stage].optional_context=[`context/${kind}/**`];p.save();assert.equal(p.run().code,0);const before=new Map(['prd','us','wireframe','prototype','tdd'].map(s=>[s,p.gate(s).raw]));
 p.write(`context/${kind}/note.md`,'Prepared context');const changes=invalidateGates(p.root,p.config,loadRegistries(p.root,p.config),{head:'fixture-head',build:'not-built'});assert.deepEqual([...changes.invalidated],readers);
 for(const [s,bytes] of before)if(!readers.includes(s))assert.equal(p.gate(s).raw,bytes,s);
 assert.equal(p.run().code,0);for(const s of readers){const gate=p.gate(s);assert.ok(gate.data.inputs[`context/${kind}/note.md`]);const manifest=JSON.parse(fs.readFileSync(path.join(p.root,`review/candidates/${gate.data.model.candidate.manifest}.json`),'utf8'));assert.ok(manifest.members[0].artifacts[`context/${kind}/note.md`]);}
 p.write(`context/${kind}/note.md`,'Changed bytes');assert.deepEqual([...invalidateGates(p.root,p.config,loadRegistries(p.root,p.config),{head:'fixture-head',build:'not-built'}).invalidated],readers);
 assert.equal(p.run().code,0);fs.unlinkSync(path.join(p.root,`context/${kind}/note.md`));assert.deepEqual([...invalidateGates(p.root,p.config,loadRegistries(p.root,p.config),{head:'fixture-head',build:'not-built'}).invalidated],readers);
});
test('mixing optional and required input changes keeps conservative downstream invalidation',t=>{
 const p=projectFixture(t,['prd','us']);p.config.roles.po.enabled=false;settings(p,'prd');assert.equal(p.run().code,0);p.write('context/custom/note.md','context');p.write('input/po-spec.txt','changed source');assert.deepEqual([...invalidateGates(p.root,p.config,loadRegistries(p.root,p.config),{head:'fixture-head',build:'not-built'}).invalidated],['prd','us']);
});
test('status exposes next stage and first wireframe attempt; PO none marker is read-only and never stales gates',t=>{
 const p=projectFixture(t,['us','wireframe','prototype']);assert.equal(projectStatus(p.root).next_stage,'us');assert.equal(projectStatus(p.root).ui_context_due,false);
 assert.equal(p.run().code,2);p.approve('us');let value=projectStatus(p.root);assert.equal(value.next_stage,'wireframe');assert.equal(value.ui_context_due,true);
 const before=p.gate('us').raw;p.write('input/context-intake.json',JSON.stringify({ui:{asked:true,answer:'none'}}));value=projectStatus(p.root);assert.equal(value.ui_context_due,false);assert.equal(p.gate('us').raw,before);assert.equal(value.stages[0].freshness,'CURRENT');
 fs.unlinkSync(path.join(p.root,'input/context-intake.json'));assert.equal(p.run().code,2);assert.equal(projectStatus(p.root).ui_context_due,false,'existing wireframe attempt never triggers first-run intake');
});
test('status asks before a run that can traverse disabled human stops into first wireframe',t=>{
 const p=projectFixture(t,['prd','us','wireframe','prototype']);p.config.roles.po.enabled=false;p.save();assert.equal(projectStatus(p.root).ui_context_due,true);
});
test('os junk beside a loaded text file keeps the approved gate current',t=>{
 const p=projectFixture(t,['prd']);p.config.roles.po.enabled=false;p.config.stages.prd.optional_context=['context/sources/**'];p.save();
 p.write('context/sources/note.md','Prepared context');assert.equal(p.run().code,0);const before=p.gate('prd').raw;
 assert.equal(p.gate('prd').data.model.states.freshness,'CURRENT');assert.ok(p.gate('prd').data.inputs['context/sources/note.md']);
 const dir=path.join(p.root,'context/sources');
 fs.writeFileSync(path.join(dir,'.DS_Store'),Buffer.from([0,1,2,0]));fs.writeFileSync(path.join(dir,'._note.md'),Buffer.from([0,1,2]));
 fs.writeFileSync(path.join(dir,'Thumbs.db'),Buffer.from([0]));fs.writeFileSync(path.join(dir,'desktop.ini'),'[.ShellClassInfo]\n');fs.writeFileSync(path.join(dir,'shot.png'),'png');
 assert.equal(p.run().code,0);assert.equal(p.gate('prd').data.model.states.freshness,'CURRENT');assert.equal(p.gate('prd').raw,before);
 const ctx=stageContext(p.root,loadConfig(p.root),loadRegistries(p.root,loadConfig(p.root)),'prd');
 assert.deepEqual(ctx.context.filter(file=>file.startsWith('context/sources/')),['context/sources/note.md']);
 assert.equal(writerPrompt(p.root,'prd',ctx.context,['spec/prd.txt']).includes('\u0000'),false);
});
test('optional glob inventories only its literal prefix directory',t=>{
 const p=projectFixture(t);const outside=fs.mkdtempSync(path.join(os.tmpdir(),'context-link-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 fs.symlinkSync(outside,path.join(p.root,'assets'));fs.symlinkSync(outside,path.join(p.root,'input/attachments'));
 assert.deepEqual(selectFiles(p.root,'context/custom/**',{optional:true,preparedText:true}),[]);
});
test('a symlink inside an optional prefix is still refused',t=>{
 const p=projectFixture(t);const outside=fs.mkdtempSync(path.join(os.tmpdir(),'context-inner-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 fs.mkdirSync(path.join(p.root,'context/custom'),{recursive:true});fs.writeFileSync(path.join(p.root,'context/custom/note.md'),'Prepared');
 fs.symlinkSync(outside,path.join(p.root,'context/custom/linked'));
 assert.throws(()=>selectFiles(p.root,'context/custom/**',{optional:true,preparedText:true}),/Symlink/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {hasKitHistory} from './kit-history.mjs';
const kit=fileURLToPath(new URL('../../../',import.meta.url));
const upstream=['intake','clarify','contract','prd','us'];
test('upgrade preserves approved intake and records intentional answer-context invalidation downstream',async t=>{
 if (!hasKitHistory(t, kit, 'a4dbef4','93aab67')) return;
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'approved-upgrade-'));t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 const old=path.join(workspace,'old'),root=path.join(workspace,'project');fs.mkdirSync(old);
 const archive=spawnSync('git',['archive','a4dbef4','SPEC.md','format','templates','rules','prompts','tools','evals','config'],{cwd:kit,maxBuffer:100*1024*1024});assert.equal(archive.status,0);assert.equal(spawnSync('tar',['-x','-C',old],{input:archive.stdout}).status,0);
 // The 2.3.0 product/skill-id rename is an intended one-time invalidation of every stage input it touches. Apply that
 // rename to the old kit too (files the old kit shares byte-for-byte with 2.2.2) so this test isolates upgrade traversal.
 const renamed=spawnSync('git',['diff','--name-only','93aab67','--','prompts','rules','templates','config'],{cwd:kit,encoding:'utf8'});assert.equal(renamed.status,0,renamed.stderr);
 for(const file of renamed.stdout.split('\n').filter(Boolean)){
  const was=spawnSync('git',['show',`93aab67:${file}`],{cwd:kit,maxBuffer:16*1024*1024}),target=path.join(old,file);
  if(was.status===0&&fs.existsSync(target)&&fs.readFileSync(target).equals(was.stdout)&&fs.existsSync(path.join(kit,file)))fs.copyFileSync(path.join(kit,file),target);
 }
 const {replacementForLegacySkillId}=await import(pathToFileURL(path.join(kit,'tools/lib/config/skill-ids.mjs')));
 const oldConfig=path.join(old,'config/pipeline.yaml');
 fs.writeFileSync(oldConfig,fs.readFileSync(oldConfig,'utf8').replace(/^(\s*-\s+)([a-z]+:[a-z-]+)\s*$/gm,(_,lead,id)=>lead+replacementForLegacySkillId(id)));
 const call=(source,entry,args)=>spawnSync(process.execPath,[path.join(source,'tools/run',entry),'--project',root,...args],{encoding:'utf8',timeout:30000});
 let result=call(old,'init.mjs',['--name','Approved fixture','--lang','en']);assert.equal(result.status,0,result.stdout+result.stderr);
 const put=(file,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);};
 fs.cpSync(path.join(kit,'fixtures/v2/full'),path.join(root,'spec'),{recursive:true});
 for(const [from,to] of [['decisions/glossary.md','glossary.md'],['decisions/decision-log.md','decisions/decisions.md'],['contract/FC-001.md','contract/contract.md'],['prd/PRD.md','prd/prd.md']])put('spec/'+to,fs.readFileSync(path.join(root,'spec',from)));
 put('fixture-check.mjs',"process.stdout.write('Controlled fixture structural check; no model quality claim\\n');\n");
 put('fixture-review.mjs',"import fs from 'node:fs'; fs.readFileSync(0,'utf8'); process.stdout.write('VERDICT: PASS\\n```review-data\\n'+JSON.stringify({criteria:[{id:'fixture',mandatory:true,score:2,evidence:'Synthetic independent-process review control'}],findings:[]})+'\\n```\\n');\n");
 const cfgFile=path.join(root,'config/pipeline.yaml');let yaml=fs.readFileSync(cfgFile,'utf8');
 yaml=yaml.replace('  po:\n    enabled: true\n    gate: true','  po:\n    enabled: true\n    gate: true\n    approvers:\n      - po@example.test');
 yaml=yaml.replace(/(  reviewer:\n    command:) .*/,(_,prefix)=>prefix+' '+JSON.stringify('node '+JSON.stringify(path.join(root,'fixture-review.mjs'))));
 yaml=yaml.replace(/run: node tools\/lint\/lint.mjs spec --pipeline config\/pipeline.yaml --stage (intake|clarify|contract|prd|us)\b/g,'run: node fixture-check.mjs');
 fs.writeFileSync(cfgFile,yaml);
 const {loadConfig,STAGES}=await import(pathToFileURL(path.join(old,'tools/lib/config/config-loader.mjs')));
 const {gateDefinition,declaredOutputs}=await import(pathToFileURL(path.join(old,'tools/run/project-registries.mjs')));
 const {concreteOutputs}=await import(pathToFileURL(path.join(old,'tools/lib/output-patterns.mjs')));
 const config=loadConfig(root);
 // Definitions are configured before any execution/approval, as in a normal project setup.
 for(const stage of STAGES){const inputs=[...new Set([...config.stages[stage].context,'tools/agents/','tools/run/agent-timeouts.mjs','tools/run/process-tree.mjs'])];const def=gateDefinition(config,stage,{inputs,outputs:declaredOutputs(root,stage)});put(`review/definitions/${def.id}/${def.version}.json`,JSON.stringify(def)+'\n');}
 const snapshots=new Map();
 for(const stage of upstream){
  const declared=declaredOutputs(root,stage),files=Object.fromEntries(concreteOutputs(root,declared).map(file=>[file,fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file),'utf8'):`Fixture ${file}\n`]));
  const answer=declared.length===1?Object.values(files)[0]:'```files\n'+JSON.stringify(files)+'\n```\n';put(`answers/${stage}.txt`,answer);
  result=call(old,'run.mjs',['--head','fixture-head','--build','not-built','--paste',`answers/${stage}.txt`]);assert.equal(result.status,2,result.stdout+result.stderr);
  result=call(old,'decide.mjs',['--stage',stage,'--as','po@example.test','--approve']);assert.equal(result.status,0,result.stdout+result.stderr);
  const bytes=fs.readFileSync(path.join(root,`review/gates/${stage}.md`)),data=JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(bytes.toString())[1]);assert.equal(data.approval.by,'po@example.test');assert.ok(data.model.decision);snapshots.set(stage,{bytes,approval:data.approval});
 }
 const protectedInputs=new Set();for(const stage of upstream){const data=JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(snapshots.get(stage).bytes.toString())[1]);Object.keys(data.inputs).forEach(file=>protectedInputs.add(file));}
 result=call(kit,'init.mjs',['--upgrade']);assert.equal(result.status,0,result.stdout+result.stderr);
 for(const [stage,before] of snapshots)assert.deepEqual(fs.readFileSync(path.join(root,`review/gates/${stage}.md`)),before.bytes,`${stage}: upgrade must preserve owner records before traversal`);
 result=call(kit,'run.mjs',['--head','fixture-head','--build','not-built']);
 for(const [stage,before] of [...snapshots].filter(([stage])=>stage==='intake')){const after=fs.readFileSync(path.join(root,`review/gates/${stage}.md`));assert.deepEqual(after,before.bytes,`${stage} approval was invalidated by upgrade/traversal: ${result.stdout}`);const data=JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(after.toString())[1]);assert.deepEqual(data.approval,before.approval);}
 assert.equal(result.status,2,result.stdout+result.stderr);assert.match(result.stdout,/Manual writer pending: review\/manual\/clarify.json/);
 const changed=JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(fs.readFileSync(path.join(root,'review/gates/clarify.md'),'utf8'))[1]);
 assert.equal(changed.model.states.freshness,'STALE');assert.ok(changed.invalidation);
 assert.match(fs.readFileSync(path.join(root,'input/answers.md'),'utf8'),/\| Q \| Answer \| Decided by \| Date \| Note \|/);
 t.diagnostic('Protected upstream inputs: '+JSON.stringify([...protectedInputs].sort()));
});

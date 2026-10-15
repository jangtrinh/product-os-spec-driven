import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {hasKitHistory} from './kit-history.mjs';
const kit=fileURLToPath(new URL('../../../',import.meta.url));
const upstream=['intake','clarify','contract','prd','us','wireframe','prototype','tdd','handoff'];
test('kit-only contract upgrade preserves gate records until traversal, then marks approved gates stale',async t=>{
 if (!hasKitHistory(t, kit, '5ee290f')) return;
 const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'approved-upgrade-'));t.after(()=>fs.rmSync(workspace,{recursive:true,force:true}));
 const old=path.join(workspace,'old'),root=path.join(workspace,'project');fs.mkdirSync(old);
 const archive=spawnSync('git',['archive','5ee290f','SPEC.md','format','templates','rules','prompts','tools','evals','config'],{cwd:kit,maxBuffer:100*1024*1024});assert.equal(archive.status,0);assert.equal(spawnSync('tar',['-x','-C',old],{input:archive.stdout}).status,0);
 const call=(source,entry,args)=>spawnSync(process.execPath,[path.join(source,'tools/run',entry),'--project',root,...args],{encoding:'utf8',timeout:30000});
 let result=call(old,'init.mjs',['--name','Approved fixture','--lang','en']);assert.equal(result.status,0,result.stdout+result.stderr);
 const put=(file,bytes)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);};
 fs.cpSync(path.join(kit,'fixtures/v2/full'),path.join(root,'spec'),{recursive:true});
 for(const [from,to] of [['decisions/glossary.md','glossary.md'],['decisions/decision-log.md','decisions/decisions.md'],['contract/FC-001.md','contract/contract.md'],['prd/PRD.md','prd/prd.md']])put('spec/'+to,fs.readFileSync(path.join(root,'spec',from)));
 put('fixture-check.mjs',"process.stdout.write('Controlled fixture structural check; no model quality claim\\n');\n");
 put('fixture-review.mjs',"import fs from 'node:fs'; fs.readFileSync(0,'utf8'); process.stdout.write('VERDICT: PASS\\n```review-data\\n'+JSON.stringify({criteria:[{id:'fixture',mandatory:true,score:2,evidence:'Synthetic independent-process review control'}],findings:[]})+'\\n```\\n');\n");
 const cfgFile=path.join(root,'config/pipeline.yaml');let yaml=fs.readFileSync(cfgFile,'utf8');
 yaml=yaml.replace('  po:\n    enabled: true\n    gate: true','  po:\n    enabled: true\n    gate: true\n    approvers:\n      - po@example.test');
 yaml=yaml.replace('  qc:\n    enabled: false','  qc:\n    enabled: true');
 yaml=yaml.replace(/(  reviewer:\n    command:) .*/,(_,prefix)=>prefix+' '+JSON.stringify('node '+JSON.stringify(path.join(root,'fixture-review.mjs'))));
 yaml=yaml.replace(/run: node tools\/lint\/lint.mjs spec --pipeline config\/pipeline.yaml --stage (intake|clarify|contract|prd|us|wireframe|prototype|tdd|handoff)\b/g,'run: node fixture-check.mjs');
 fs.writeFileSync(cfgFile,yaml);
 const {loadConfig,STAGES}=await import(pathToFileURL(path.join(old,'tools/lib/config/config-loader.mjs')));
 const {gateDefinition,declaredOutputs}=await import(pathToFileURL(path.join(old,'tools/run/project-registries.mjs')));
 const {concreteOutputs}=await import(pathToFileURL(path.join(old,'tools/lib/output-patterns.mjs')));
 const config=loadConfig(root);
 // Baseline handoff inventories its own gate directory in candidate inputs.
 // This upgrade control removes that pre-existing self-reference before execution.
 config.stages.handoff.context=config.stages.handoff.context.filter(file=>file!=='review/gates/');
 const {editYaml}=await import(pathToFileURL(path.join(old,'tools/lib/config/yaml-in-place.mjs')));
 fs.writeFileSync(cfgFile,editYaml(fs.readFileSync(cfgFile,'utf8'),config));
 // Definitions are configured before any execution/approval, as in a normal project setup.
 for(const stage of STAGES){const inputs=[...new Set([...config.stages[stage].context,'tools/agents/','tools/run/agent-timeouts.mjs','tools/run/process-tree.mjs'])];const def=gateDefinition(config,stage,{inputs,outputs:declaredOutputs(root,stage)});put(`review/definitions/${def.id}/${def.version}.json`,JSON.stringify(def)+'\n');}
 const snapshots=new Map();
 for(const stage of upstream){
  const declared=declaredOutputs(root,stage),files=Object.fromEntries(concreteOutputs(root,declared).map(file=>[file,fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file),'utf8'):`Fixture ${file}\n`]));
  const answer=declared.length===1?Object.values(files)[0]:'```files\n'+JSON.stringify(files)+'\n```\n';put(`answers/${stage}.txt`,answer);
  result=call(old,'run.mjs',['--head','fixture-head','--build','not-built','--paste',`answers/${stage}.txt`]);assert.equal(result.status,2,result.stdout+result.stderr);
  result=call(old,'decide.mjs',['--stage',stage,'--as','po@example.test','--approve']);if(result.status!==0)t.diagnostic(call(old,'status.mjs',['--json']).stdout);assert.equal(result.status,0,result.stdout+result.stderr);
  const bytes=fs.readFileSync(path.join(root,`review/gates/${stage}.md`)),data=JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(bytes.toString())[1]);assert.equal(data.approval.by,'po@example.test');assert.ok(data.model.decision);snapshots.set(stage,{bytes,approval:data.approval});
 }
 const protectedInputs=new Set();for(const stage of upstream){const data=JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(snapshots.get(stage).bytes.toString())[1]);Object.keys(data.inputs).forEach(file=>protectedInputs.add(file));}
 result=call(kit,'init.mjs',['--upgrade','--dry-run']);assert.equal(result.status,0,result.stdout+result.stderr);
 for(const [stage,before] of snapshots)assert.deepEqual(fs.readFileSync(path.join(root,`review/gates/${stage}.md`)),before.bytes);
 result=call(kit,'init.mjs',['--upgrade']);assert.equal(result.status,0,result.stdout+result.stderr);
 const {loadConfig:currentConfig}=await import(pathToFileURL(path.join(kit,'tools/lib/config/config-loader.mjs')));
 const updated=currentConfig(root);
 for(const stage of ['intake','clarify','contract','prd','us'])assert.ok(updated.stages[stage].optional_context.includes('context/sources/**'));
 for(const stage of ['wireframe','prototype','design','uiux'])assert.ok(updated.stages[stage].optional_context.includes('context/ui/**'));
 for(const [stage,before] of snapshots)assert.deepEqual(fs.readFileSync(path.join(root,`review/gates/${stage}.md`)),before.bytes,`${stage}: upgrade before traversal`);
 result=call(kit,'run.mjs',['--head','fixture-head','--build','not-built']);assert.equal(result.status,2,result.stdout+result.stderr);
 for(const stage of upstream){
  const data=JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(fs.readFileSync(path.join(root,`review/gates/${stage}.md`),'utf8'))[1]);
  assert.equal(data.model.states.freshness,'STALE',`${stage}: rewritten kit contract must stale the old approval`);
  assert.equal(data.approval,undefined,`${stage}: stale gate must not retain approval`);
  assert.ok(data.invalidation,`${stage}: stale gate records its invalidation`);
 }
 t.diagnostic('Kit-only contract changes stale approved gates: '+upstream.join(', '));
});

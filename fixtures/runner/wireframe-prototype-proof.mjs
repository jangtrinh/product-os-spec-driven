import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {projectFixture} from './project-fixture.mjs';
import {wireframe,prototype} from './wireframe-prototype-fixture.mjs';
import {loadConfig} from '../../tools/lib/config/config-loader.mjs';
import {gateDefinition} from '../../tools/run/project-registries.mjs';
const kit=fileURLToPath(new URL('../../',import.meta.url));
export function proof(out) {
 const upstream=['intake','clarify','contract','prd','us'];
 const p=projectFixture(null,[...upstream,'wireframe','prototype']),defaults=loadConfig(kit),log=[];
 try {
  fs.cpSync(path.join(kit,'fixtures/v2/full'),path.join(p.root,'spec'),{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(p.root,'spec/spec.manifest.json')));
  manifest.artifacts.push({id:'wireframe',folder:'wireframe',name:'ASCII wireframes'},{id:'prototype',folder:'prototype',name:'HTML prototype'});p.write('spec/spec.manifest.json',manifest);
  p.config.gates.baseline='review/baseline.json';
  p.write(p.config.gates.baseline,{id:'synthetic-full-fixture-baseline',head:'fixture-base',manifest:'4b7775b8e926745757bd6e1f594a7532bcc27376404e81918d15c95bf028b25a'});
  p.config.agents.writer.command='manual';
  for(const stage of ['wireframe','prototype']){
   p.config.stages[stage]=structuredClone(defaults.stages[stage]);
   p.config.stages[stage].context=p.config.stages[stage].context.map(f=>f==='spec/decisions/decisions.md'?'spec/decisions/decision-log.md':f==='spec/glossary.md'?'spec/decisions/glossary.md':f);
   for(const file of p.config.stages[stage].context.filter(f=>!f.startsWith('spec/')))p.write(file,fs.readFileSync(path.join(kit,file),'utf8'));
   p.write(`prompts/${stage}.md`,fs.readFileSync(path.join(kit,`prompts/${stage}.md`),'utf8'));
   p.config.evals[stage]=[{run:`${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(kit,'tools/lint/lint.mjs'))} spec --pipeline config/pipeline.yaml --stage ${stage}`}];
   p.definitions[stage]=gateDefinition(p.config,stage,{inputs:p.config.stages[stage].context,outputs:[stage==='wireframe'?'spec/wireframe/wireframes.md':'spec/prototype/index.html']});
  }
  p.save();
  // Synthetic upstream approvals are confined to this disposable test project.
  for(const stage of upstream){p.write(`answer-${stage}.txt`,`Generated ${stage}\n`);const result=p.run(['--paste',`answer-${stage}.txt`]);assert.equal(result.code,2,result.out);assert.match(p.gate(stage).raw,/^GATE: PENDING/);p.approve(stage);log.push({stage,exit:result.code,fixtureApproval:true});}
  p.write('wireframe-answer.txt',wireframe);
  let result=p.run(['--stage','wireframe']);assert.equal(result.code,2,result.out);assert.match(result.out,/Manual writer pending/);log.push({stage:'wireframe',entry:'--stage wireframe (first entry; no existing downstream gates, no transition needed)',exit:result.code});
  result=p.run(['--result','wireframe-answer.txt']);assert.equal(result.code,2,result.out);assert.ok(fs.existsSync(path.join(p.root,'review/gates/wireframe.md')),result.out);assert.match(p.gate('wireframe').raw,/^GATE: PENDING/);log.push({stage:'wireframe',exit:result.code,gate:'PENDING',eval:p.gate('wireframe').data.evals});
  p.approve('wireframe');
  p.write('prototype-answer.txt',prototype);result=p.run();assert.equal(result.code,2,result.out);assert.match(result.out,/Manual writer pending/);
  result=p.run(['--result','prototype-answer.txt']);assert.equal(result.code,2,result.out);assert.match(p.gate('prototype').raw,/^GATE: PENDING/);log.push({stage:'prototype',exit:result.code,gate:'PENDING',eval:p.gate('prototype').data.evals});
  fs.mkdirSync(out,{recursive:true});
  for(const [from,to] of [['spec/wireframe/wireframes.md','wireframes.md'],['spec/prototype/index.html','index.html'],['review/gates/wireframe.md','wireframe-gate.md'],['review/gates/prototype.md','prototype-gate.md']])fs.copyFileSync(path.join(p.root,from),path.join(out,to));
  fs.writeFileSync(path.join(out,'proof-run.json'),JSON.stringify({disclaimer:'Disposable synthetic fixture: manual writer, fake reviewer process, fixture approvals only. No model review or real PO decision. Real projects remain unproven.',log},null,2)+'\n');
  return log;
 }catch(error){
  fs.mkdirSync(out,{recursive:true});
  fs.cpSync(path.join(p.root,'review/log'),path.join(out,'failed-proof-logs'),{recursive:true});
  throw error;
 }finally{fs.rmSync(p.root,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(proof(path.resolve(process.argv[2]??'.')),null,2));

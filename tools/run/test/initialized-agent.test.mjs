import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const kit=fileURLToPath(new URL('../../../',import.meta.url));
const doc=(id,type,title,body)=>`---\nid: ${id}\ntype: ${type}\ntitle: ${title}\nupdated: 2026-10-10\nstatus: draft\n---\n\n${body}\n`;
test('initialized stdin/stdout agents reach intake PENDING without hand edits',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spec-auto-init-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const capture=path.join(root,'calls.jsonl'),agent=path.join(root,'double.cjs');
 const files={
  'spec/spec.manifest.json':JSON.stringify({format:'2',title:'Intake test',language:'en',tests_root:'tests',glossary:{document:'glossary.md'},artifacts:[{id:'intake',name:'Source',folder:'intake'},{id:'decisions',name:'Decisions',folder:'decisions'}]}),
  'spec/README.md':doc('guide','overview','Intake overview','## Status\nThe source is awaiting PO decisions.'),
  'spec/intake/intake.md':doc('intake-source','intake','PO input','## Source\nPO must supply confirmed product requirements.'),
  'spec/glossary.md':fs.readFileSync(path.join(kit,'evals/cases/baseline/candidate/glossary.md'),'utf8'),
  'spec/decisions/decisions.md':doc('decision-ledger','decisions','Decision ledger','## Decisions\nNo product decisions supplied.\n\n## Questions\nPO must supply confirmed requirements.'),
 };
 fs.writeFileSync(agent,`const fs=require('node:fs');const input=fs.readFileSync(0,'utf8');const review=input.includes('READ-ONLY INDEPENDENT REVIEW');fs.appendFileSync(${JSON.stringify(capture)},JSON.stringify({review,pid:process.pid,cwd:process.cwd()})+'\\n');if(review){process.stdout.write('VERDICT: PASS\\n'+String.fromCharCode(96).repeat(3)+'review-data\\n'+JSON.stringify({criteria:[{id:'source',mandatory:true,score:2,evidence:'Test double compared supplied source and outputs'}],findings:[]})+'\\n'+String.fromCharCode(96).repeat(3)+'\\n');}else{process.stdout.write(String.fromCharCode(96).repeat(3)+'files\\n'+JSON.stringify(${JSON.stringify(files)})+'\\n'+String.fromCharCode(96).repeat(3)+'\\n');}`);
 // The double lives outside the install target so init still starts empty.
 const project=path.join(root,'project');const command=`node '${agent}'`;
 const i=spawnSync(process.execPath,[path.join(kit,'tools/run/init.mjs'),'--project',project,'--name','Intake test','--lang','en','--agent',command],{encoding:'utf8'});assert.equal(i.status,0,i.stdout+i.stderr);
 const r=spawnSync(process.execPath,[path.join(project,'tools/run/run.mjs'),'--project',project,'--head','intake-source','--build','not-built'],{encoding:'utf8',timeout:30000});
 const diagnostics=fs.readdirSync(path.join(project,'review/log')).filter(file=>file.includes('-eval-')).map(file=>fs.readFileSync(path.join(project,'review/log',file),'utf8')).join('\n');
 assert.equal(r.status,2,r.stdout+r.stderr);assert.match(r.stdout,/intake: GATE: PENDING/);assert.doesNotMatch(diagnostics,/ERROR/);
 for(const file of Object.keys(files))assert.equal(fs.readFileSync(path.join(project,file),'utf8'),files[file]);
 const calls=fs.readFileSync(capture,'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.length,2);assert.deepEqual(calls.map(call=>call.review),[false,true]);assert.notEqual(calls[0].pid,calls[1].pid);assert.notEqual(calls[0].cwd,calls[1].cwd);
 const state=JSON.parse(fs.readFileSync(path.join(project,'review/runtime/intake.json'),'utf8'));assert.deepEqual(state.last_evals.map(row=>row.exit_code),[0]);assert.equal(state.rounds.eval_fix,0);assert.equal(state.review_result.verdict,'PASS');assert.equal(state.review_result.independent,true);
 assert.match(fs.readFileSync(path.join(project,'review/gates/intake.md'),'utf8'),/^GATE: PENDING/);
});
test('failed vendor wrapper is mapped to runner environment exit 4',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spec-wrapper-refusal-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const i=spawnSync(process.execPath,[path.join(kit,'tools/run/init.mjs'),'--project',root,'--name','Refusal','--lang','en','--agent','node tools/agents/codex-writer --cli missing-spec-codex'],{encoding:'utf8'});assert.equal(i.status,0,i.stdout+i.stderr);
 const r=spawnSync(process.execPath,[path.join(kit,'tools/run/run.mjs'),'--project',root,'--head','source','--build','not-built'],{encoding:'utf8',timeout:20000});assert.equal(r.status,4,r.stdout+r.stderr);assert.match(r.stdout,/Writer not runnable/);
});

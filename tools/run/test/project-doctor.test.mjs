import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const kit=fileURLToPath(new URL('../../../',import.meta.url));
const doctor=path.join(kit,'tools/run/doctor.mjs');
function project(t,agent='manual') {
 const p=fs.mkdtempSync(path.join(os.tmpdir(),'spec-doctor-'));t.after(()=>fs.rmSync(p,{recursive:true,force:true}));
 const r=spawnSync(process.execPath,[path.join(kit,'tools/run/init.mjs'),'--project',p,'--name','doctor','--lang','vi','--agent',agent],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);return p;
}
function call(root,env={}) {return spawnSync(process.execPath,[doctor,'--project',root],{encoding:'utf8',env:{...process.env,...env},timeout:20000});}
test('doctor reports required readiness and optional browser impact without invoking agent CLIs',t=>{
 const root=project(t),r=call(root);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/PASS Node/);assert.match(r.stdout,/PASS Ajv 2020/);assert.match(r.stdout,/(PASS|NOT RUN) Playwright/);
 assert.match(r.stdout,/PASS writer: manual/); assert.match(r.stdout,/PASS reviewer: manual/);
});
test('explicit invalid Ajv module and missing configured CLI fail with fixes',t=>{
 const root=project(t,'missing-spec-agent'),r=call(root,{SPEC_AJV_MODULE:'/not-installed/ajv/2020'});
 assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,/FAIL Ajv 2020/);assert.match(r.stdout,/SPEC_AJV_MODULE/);assert.match(r.stdout,/FAIL writer.*missing-spec-agent/);
 const wrapper=project(t,'codex');const absent=call(wrapper,{PATH:''});assert.equal(absent.status,1);assert.match(absent.stdout,/FAIL writer.*codex/);
});
test('unreadable project returns cannot-check status and unsupported Node is required failure',async t=>{
 const root=project(t);const r=call(path.join(root,'missing'));assert.equal(r.status,2);assert.match(r.stdout,/NOT RUN Project/);
 const {checkReadiness}=await import('../doctor.mjs');const lines=[];assert.equal(await checkReadiness({project:root,nodeVersion:'17.9.0'},line=>lines.push(line)),1);assert.ok(lines.some(line=>line.includes('FAIL Node')));
});
for(const ready of [false,true]) test(`doctor probes browser launch and close instead of executable presence (${ready?'ready':'missing headless shell'})`,async t=>{
 const root=project(t),module=path.join(root,'node_modules/playwright'),marker=path.join(root,'browser-probe.jsonl');
 fs.mkdirSync(module,{recursive:true});
 fs.writeFileSync(path.join(module,'index.js'),`const fs=require('node:fs');exports.chromium={executablePath:()=>process.execPath,launch:async options=>{fs.appendFileSync(${JSON.stringify(marker)},JSON.stringify({event:'launch',timeout:options.timeout})+'\\n');if(!${ready})throw Error('Headless shell absent');return {close:async()=>fs.appendFileSync(${JSON.stringify(marker)},JSON.stringify({event:'close'})+'\\n')};}};`);
 const result=call(root);assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(result.stdout,ready?/PASS Playwright:.*launch/:/NOT RUN Playwright:.*headless shell/);
 if(!ready)assert.match(result.stdout,/npx playwright install chromium/);
 const events=fs.readFileSync(marker,'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(events.map(e=>e.event),ready?['launch','close']:['launch']);assert.ok(events[0].timeout>0&&events[0].timeout<=10000);
});
test('doctor keeps kit current after an owner adds PO approvers',t=>{
 const root=project(t),file=path.join(root,'config/pipeline.yaml'),yaml=fs.readFileSync(file,'utf8');
 const edited=yaml.replace('  po:\n    enabled: true\n    gate: true\n','  po:\n    enabled: true\n    gate: true\n    approvers:\n      - po@example.com\n');
 assert.notEqual(edited,yaml);fs.writeFileSync(file,edited);
 const r=call(root);assert.match(r.stdout,/kit: current/);assert.doesNotMatch(r.stdout,/kit: drift/);
});
test('doctor still reports kit drift after an owner edits a kit-owned stage context list',t=>{
 const root=project(t),file=path.join(root,'config/pipeline.yaml'),yaml=fs.readFileSync(file,'utf8');
 const edited=yaml.replace('      - rules/writing-rules.md\n','      - rules/writing-rules.md\n      - context/owner-extra.md\n');
 assert.notEqual(edited,yaml);fs.writeFileSync(file,edited);
 const r=call(root);assert.match(r.stdout,/kit: drift \(1 files\)/);
});

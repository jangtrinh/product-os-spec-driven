import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runCommand,freshReview} from '../command-process.mjs';
import {loadConfig} from '../../lib/config/config-loader.mjs';
import {loadRegistries} from '../registries.mjs';
import {stageContext} from '../stage-context.mjs';
const kit=fileURLToPath(new URL('../../../',import.meta.url));
const wrapper=path.join(kit,'tools/agents/grok-reviewer');
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spec-grok-double-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const cli=path.join(root,'grok');
 fs.writeFileSync(cli,`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);const prompt=fs.readFileSync(args[args.indexOf('--prompt-file')+1],'utf8');
fs.writeFileSync(${JSON.stringify(path.join(root,'invoked.json'))},JSON.stringify({args,prompt,pid:process.pid,env:Object.fromEntries(Object.entries(process.env).filter(([k])=>/^GROK_(CLAUDE|CURSOR|MEMORY)/.test(k)))}));
if(prompt==='cli-failure'){console.error('token=NEVER_LOG_THIS');process.exit(7);}
if(prompt==='bad-json'){console.log('NEVER_LOG_THIS');process.exit(0);}
const stopReason=prompt.startsWith('stop:')?prompt.slice(5):'end_turn';
const text=prompt==='empty'?'':prompt==='whitespace'?'  \\n':prompt==='non-string'?null:'Final review only.';
const content=text===null?[{type:'text',text:{}}]:[{type:'text',text}];
const lines=[
 {type:'system',subtype:'init',session_id:'s',model:'grok-4.7',tools:[],skills:[]},
 {type:'assistant',message:{id:'msg_final',type:'message',role:'assistant',model:'grok-4.7',content,stop_reason:stopReason,stop_sequence:null,usage:{input_tokens:1,output_tokens:1}},parent_tool_use_id:null,session_id:'s'},
 {type:'result',subtype:stopReason==='end_turn'?'success':'error_during_execution',is_error:stopReason!=='end_turn',num_turns:1,result:text,stop_reason:stopReason,usage:{input_tokens:12,output_tokens:4},session_id:'s'}
];
process.stdout.write(lines.map(line=>JSON.stringify(line)).join('\\n')+'\\n');`);
 fs.chmodSync(cli,0o755);
 return {root,cli,call:(input='source',args=[])=>spawnSync(process.execPath,[wrapper,'--cli',cli,...args],{input,encoding:'utf8',timeout:10000})};
}
test('grok reviewer is fresh, read-only, lean and read-only-tools with final-only stdout and metrics',t=>{
 const p=fixture(t),metric=path.join(p.root,'metrics.jsonl');
 const first=p.call('source',['--metrics',metric]);assert.equal(first.status,0,first.stderr);assert.equal(first.stdout,'Final review only.');
 const a=JSON.parse(fs.readFileSync(path.join(p.root,'invoked.json')));
 const second=p.call('source',['--model','selected-model','--effort','high']);assert.equal(second.status,0,second.stderr);
 const b=JSON.parse(fs.readFileSync(path.join(p.root,'invoked.json')));
 assert.equal(a.prompt,'source');assert.notEqual(a.pid,b.pid);
 for(const [flag,value] of [['--sandbox','read-only'],['--permission-mode','plan'],['--output-format','streaming-messages-json'],['--model','grok-4.7'],['--tools','read_file,grep,list_dir']]) assert.equal(a.args[a.args.indexOf(flag)+1],value,flag);
 assert.equal(a.args[a.args.indexOf('--rules')+1],'Read-only reviewer. Use only read_file, grep and list_dir. Never spawn subagents, never write or run commands. If the prompt says content was omitted, read it with read_file. Finish with the final answer in the required format.');
 const disallowed=a.args[a.args.indexOf('--disallowed-tools')+1].split(',');
 for(const name of ['spawn_subagent','run_terminal_cmd','write','search_replace']) assert.ok(disallowed.includes(name),name);
 for(const name of ['read_file','grep','list_dir']) assert.equal(disallowed.includes(name),false,name);
 assert.ok(a.args.includes('--no-subagents'));assert.ok(a.args.includes('--disable-web-search'));
 assert.ok(a.args.includes('MCPTool(*)'));assert.ok(a.args.includes('run_terminal_cmd'));
 assert.equal(b.args[b.args.indexOf('--effort')+1],'high');assert.ok(b.args.includes('selected-model'));
 assert.ok(!a.args.some(x=>['--resume','--continue','--worktree','--always-approve'].includes(x)));
 for(const host of ['CLAUDE','CURSOR'])for(const kind of ['SKILLS','AGENTS','RULES','HOOKS','MCPS'])assert.equal(a.env[`GROK_${host}_${kind}_ENABLED`],'false');
 assert.equal(a.env.GROK_MEMORY,'0');assert.equal(fs.existsSync(a.args[a.args.indexOf('--prompt-file')+1]),false);
 const m=JSON.parse(fs.readFileSync(metric));assert.equal(m.vendor,'grok');assert.equal(m.role,'reviewer');assert.equal(m.exit,0);assert.ok(m.wall_ms>0);
 assert.equal(m.output_bytes,Buffer.byteLength(first.stdout));assert.equal(m.output_sha256,createHash('sha256').update(first.stdout).digest('hex'));assert.equal(m.input_bytes,Buffer.byteLength('source'));
 assert.deepEqual(m.usage,{input_tokens:12,output_tokens:4});
 assert.doesNotMatch(fs.readFileSync(metric,'utf8'),/NEVER_LOG_THIS|source/);
});
for(const input of ['stop:cancelled','stop:max_turns','stop:max_tokens','stop:refusal','stop:tool_use','stop:','empty','whitespace','non-string','bad-json','cli-failure']) test(`grok ${input} fails without exposing partial text or metadata`,t=>{
 const p=fixture(t),metric=path.join(p.root,'metrics.jsonl'),r=p.call(input,['--metrics',metric]);
 assert.notEqual(r.status,0);assert.equal(r.stdout,'');assert.match(r.stderr,/grok.*(failed|final|JSON|end_turn)/i);assert.doesNotMatch(r.stderr,/NEVER_LOG_THIS|Final review only/);
 const m=JSON.parse(fs.readFileSync(metric));assert.equal(m.exit,r.status);assert.equal(m.output_bytes,0);
});
test('grok dry-run emits only argv, does not read stdin or invoke the CLI; help documents options',t=>{
 const p=fixture(t),metric=path.join(p.root,'metrics.jsonl');
 const r=p.call('secret prompt',['--dry-run','--metrics',metric]);assert.equal(r.status,0,r.stderr);
 const dry=JSON.parse(r.stdout);assert.equal(dry.cli,p.cli);assert.ok(dry.args.includes('<temporary-prompt>'));assert.doesNotMatch(r.stdout,/secret prompt/);
 assert.equal(fs.existsSync(path.join(p.root,'invoked.json')),false);assert.equal(fs.existsSync(metric),false);
 const help=p.call('',['--help']);assert.equal(help.status,0);assert.match(help.stdout,/grok-4\.7/);assert.match(help.stdout,/--timeout-ms/);
});
test('grok timeout rejects a buffered end_turn even when the provider exits zero on TERM',t=>{
 const p=fixture(t),metric=path.join(p.root,'metrics.jsonl');
 fs.writeFileSync(p.cli,`#!${process.execPath}\nprocess.stdout.write(JSON.stringify({stopReason:'end_turn',text:'Incomplete review.'}));process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`);
 const r=p.call('source',['--timeout-ms','500','--metrics',metric]);
 assert.equal(r.status,4,r.stderr);assert.equal(r.stdout,'');assert.equal(JSON.parse(fs.readFileSync(metric)).exit,4);
});
const pause=()=>new Promise(r=>setTimeout(r,20));
const dead=pid=>{try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}};
test('grok provider inherits the runner-owned process group',async t=>{
 const p=fixture(t),marker=path.join(p.root,'group.json');
 fs.writeFileSync(p.cli,`#!${process.execPath}\nconst fs=require('node:fs'),{execFileSync}=require('node:child_process');fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({group:Number(execFileSync('ps',['-p',String(process.pid),'-o','pgid=']).toString().trim())}));const text='Final review only.';process.stdout.write([JSON.stringify({type:'system',subtype:'init',session_id:'s',model:'grok-4.7',tools:[],skills:[]}),JSON.stringify({type:'assistant',message:{id:'msg',type:'message',role:'assistant',model:'grok-4.7',content:[{type:'text',text}],stop_reason:'end_turn',stop_sequence:null},parent_tool_use_id:null,session_id:'s'}),JSON.stringify({type:'result',subtype:'success',is_error:false,num_turns:1,result:text,stop_reason:'end_turn',usage:{input_tokens:12,output_tokens:4},session_id:'s'})].join('\\n')+'\\n');`);
 const result=await runCommand(`${JSON.stringify(process.execPath)} ${JSON.stringify(wrapper)} --cli ${JSON.stringify(p.cli)}`,{cwd:p.root,input:'source',timeout:10000});
 assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(fs.readFileSync(marker)).group,result.pid);
});
for(const mode of ['timeout','SIGINT','SIGTERM','overflow']) test(`grok wrapper ${mode} kills provider and ordinary grandchildren in runner group`,async t=>{
 const p=fixture(t),marker=path.join(p.root,'pids.json');
 fs.writeFileSync(p.cli,`#!${process.execPath}\nconst fs=require('node:fs'),{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({provider:process.pid,grandchild:child.pid}));process.on('SIGTERM',()=>{});${mode==='overflow'?"setTimeout(()=>process.stdout.write('x'.repeat(9*1024*1024)),200);":''}setInterval(()=>{},1000);`);
 const command=`${JSON.stringify(process.execPath)} ${JSON.stringify(wrapper)} --cli ${JSON.stringify(p.cli)} --timeout-ms ${mode==='timeout'?'600':'10000'}`;
 let child;
 t.after(()=>{if(child&&!dead(child.pid))child.kill('SIGKILL');if(fs.existsSync(marker))for(const pid of Object.values(JSON.parse(fs.readFileSync(marker))).slice(0,2))if(!dead(pid))process.kill(pid,'SIGKILL');});
 let result;
 if(mode==='SIGINT'||mode==='SIGTERM') {
  child=spawn(process.execPath,[wrapper,'--cli',p.cli,'--timeout-ms','10000'],{cwd:p.root,stdio:['pipe','pipe','pipe']});child.stdout.resume();child.stderr.resume();child.stdin.end('source');
  const closed=new Promise(r=>child.on('close',r));for(let i=0;i<250&&!fs.existsSync(marker);i++)await pause();assert.ok(fs.existsSync(marker));child.kill(mode);assert.notEqual(await closed,0);
 } else {result=await runCommand(command,{cwd:p.root,input:'source',timeout:5000});assert.notEqual(result.code,0);assert.equal(result.stdout,'');}
 assert.ok(fs.existsSync(marker));const pids=JSON.parse(fs.readFileSync(marker));
 for(let i=0;i<100&&(!dead(pids.provider)||!dead(pids.grandchild));i++)await pause();
 assert.ok(dead(pids.provider));assert.ok(dead(pids.grandchild));
});
function initialize(root,args) {return spawnSync(process.execPath,[path.join(kit,'tools/run/init.mjs'),'--project',root,'--name','Grok review','--lang','en',...args],{encoding:'utf8',timeout:20000});}
test('init ships grok reviewer and doctor checks availability without invoking it',t=>{
 const p=fixture(t),root=path.join(p.root,'project');const init=initialize(root,['--writer','codex','--reviewer','grok']);assert.equal(init.status,0,init.stdout+init.stderr);
 const config=loadConfig(root);assert.equal(config.agents.writer.command,'node tools/agents/codex-writer');assert.equal(config.agents.reviewer.command,'node tools/agents/grok-reviewer');assert.ok(fs.existsSync(path.join(root,'tools/agents/grok-reviewer')));
 // A manual writer isolates the reviewer readiness probe from other vendors.
 const yaml=path.join(root,'config/pipeline.yaml');fs.writeFileSync(yaml,fs.readFileSync(yaml,'utf8').replace('node tools/agents/codex-writer','manual'));
 const bin=path.join(p.root,'bin');fs.mkdirSync(bin);fs.symlinkSync(process.execPath,path.join(bin,'node'));fs.copyFileSync(p.cli,path.join(bin,'grok'));fs.chmodSync(path.join(bin,'grok'),0o755);
 const call=()=>spawnSync(process.execPath,[path.join(kit,'tools/run/doctor.mjs'),'--project',root],{encoding:'utf8',env:{...process.env,PATH:bin},timeout:20000});
 const ready=call();assert.equal(ready.status,0,ready.stdout+ready.stderr);assert.match(ready.stdout,/PASS reviewer: grok available \(not invoked\)/);assert.equal(fs.existsSync(path.join(p.root,'invoked.json')),false);
 fs.unlinkSync(path.join(bin,'grok'));const missing=call();assert.equal(missing.status,1);assert.match(missing.stdout,/FAIL reviewer: grok unavailable/);
 fs.writeFileSync(yaml,fs.readFileSync(yaml,'utf8').replace('node tools/agents/grok-reviewer',`node tools/agents/grok-reviewer --cli ${p.cli}`));assert.equal(call().status,0);assert.equal(fs.existsSync(path.join(p.root,'invoked.json')),false);
});
for(const flag of ['--writer','--agent'])test(`init ${flag} grok refuses unsupported writer before copying files`,t=>{
 const p=fixture(t),root=path.join(p.root,'project');const r=initialize(root,[flag,'grok']);assert.equal(r.status,3);assert.match(r.stdout,/grok.*reviewer.only|no grok writer/i);assert.equal(fs.existsSync(root),false);
});
test('initialized reviewer snapshot carries the shipped wrapper import closure',async t=>{
 const p=fixture(t),root=path.join(p.root,'project');const r=initialize(root,['--writer','manual','--reviewer','grok']);assert.equal(r.status,0,r.stdout+r.stderr);
 const config=loadConfig(root),registry=loadRegistries(root,config),context=stageContext(root,config,registry,'intake');
 const result=await freshReview(root,`${config.agents.reviewer.command} --cli ${JSON.stringify(p.cli)}`,'source',context.context,{timeout:10000});
 assert.equal(result.code,0,result.stderr);assert.equal(result.stdout,'Final review only.');
});

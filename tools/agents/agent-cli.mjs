import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {AGENT_TIMEOUT_MS} from '../run/agent-timeouts.mjs';
import {processTree} from '../run/process-tree.mjs';
const grokRecordTypes = new Set(['system', 'assistant', 'user', 'result']);
const grokSkippedBlocks = new Set(['thinking', 'redacted_thinking']);
// streaming-messages-json is one Messages API record per line. json.text joins every
// assistant segment, so a final answer cannot be isolated from that object.
export function grokFinalMessage(raw) {
 const records = [];
 for (const rawLine of String(raw).split('\n')) {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  if (!line) continue;
  let value;
  try { value = JSON.parse(line); } catch { return {failure: 'CLI returned invalid JSON'}; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !grokRecordTypes.has(value.type)) return {failure: 'CLI returned no isolable final message'};
  records.push(value);
 }
 const results = records.filter(record => record.type === 'result');
 const assistants = records.filter(record => record.type === 'assistant');
 if (results.length !== 1 || records.at(-1) !== results[0] || !assistants.length) return {failure: 'CLI returned no isolable final message'};
 const result = results[0];
 if (result.stop_reason !== 'end_turn') return {failure: 'CLI did not finish with end_turn'};
 if (result.subtype !== 'success' || result.is_error !== false) return {failure: 'CLI returned no isolable final message'};
 const assistant = assistants.at(-1);
 if (records.at(-2) !== assistant || assistant.parent_tool_use_id != null || typeof assistant.session_id !== 'string' || assistant.session_id !== result.session_id) return {failure: 'CLI returned no isolable final message'};
 const message = assistant.message;
 if (!message || typeof message !== 'object' || Array.isArray(message) || message.role !== 'assistant' || message.type !== 'message' || !Array.isArray(message.content)) return {failure: 'CLI returned no isolable final message'};
 let text = '', sawText = false;
 for (const block of message.content) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return {failure: 'CLI returned no isolable final message'};
  if (block.type === 'text') {
   if (typeof block.text !== 'string') return {failure: 'CLI returned no isolable final message'};
   text += block.text;
   sawText = true;
  } else if (!grokSkippedBlocks.has(block.type)) return {failure: 'CLI returned no isolable final message'};
 }
 if (message.stop_reason !== 'end_turn') return {failure: 'CLI did not finish with end_turn'};
 if (!sawText || typeof result.result !== 'string' || result.result !== text) return {failure: 'CLI returned no isolable final message'};
 if (!text.trim()) return {failure: 'CLI returned no final result'};
 const usage = Object.fromEntries(['input_tokens', 'output_tokens', 'cache_read_input_tokens'].filter(key => Number.isSafeInteger(result.usage?.[key]) && result.usage[key] >= 0).map(key => [key, result.usage[key]]));
 return {text, usage};
}
// Built-ins observed in the provider's Messages init record. read_file, grep
// and list_dir stay allowed; every other observed default is disallowed.
const grokDisabledTools = 'run_terminal_cmd,' +
 'search_replace,kill_command_or_subagent,todo_write,get_command_or_subagent_output,spawn_subagent,scheduler_create,scheduler_delete,scheduler_list,monitor,search_tool,use_tool,workflow,enter_plan_mode,exit_plan_mode,ask_user_question,send_feedback,image_gen,image_edit,image_to_video,reference_to_video,write';
const grokReviewerRules = 'Read-only reviewer. Use only read_file, grep and list_dir. Never spawn subagents, never write or run commands. If the prompt says content was omitted, read it with read_file. Finish with the final answer in the required format.';
const vendors = {
 codex: output => ['exec','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--color','never','--output-last-message',output],
 claude: () => ['--print','--output-format','text','--no-session-persistence','--tools',''],
 grok: (_,prompt) => ['--prompt-file',prompt,'--output-format','streaming-messages-json','--sandbox','read-only','--permission-mode','plan','--tools','read_file,grep,list_dir','--rules',grokReviewerRules,'--disallowed-tools',grokDisabledTools,'--deny','run_terminal_cmd','--no-subagents','--disable-web-search','--deny','MCPTool(*)'],
};
const grokLeanEnv = Object.fromEntries([
 ...['SKILLS','AGENTS','RULES','HOOKS','MCPS'].flatMap(kind => ['CLAUDE','CURSOR'].map(host => [`GROK_${host}_${kind}_ENABLED`,'false'])),
 ['GROK_MEMORY','0'],
]);
export async function agentCli(vendor,role,argv=process.argv.slice(2)) {
 const options={},seen=new Set();
 try {
  for(let i=0;i<argv.length;i++) {
   const flag=argv[i]; if(seen.has(flag)) throw new Error(`Duplicate ${flag}`);seen.add(flag);
   if(['--help','--dry-run'].includes(flag)) {options[flag.slice(2)]=true;continue;}
   if(!['--model','--effort','--cli','--timeout-ms','--metrics'].includes(flag)||!argv[i+1]?.trim()||argv[i+1].startsWith('--')) throw new Error(`Unknown or missing ${flag}`);
   options[flag.slice(2)]=argv[++i];
  }
  if(options.help) {console.log(`${vendor}-${role}: stdin prompt -> stdout final result. --model <id> --effort low|medium|high|xhigh --cli <executable> --timeout-ms <positive-ms> --metrics <JSONL-log> --dry-run. Codex model/effort inherit CLI config; Claude reviewer model defaults to sonnet; Grok reviewer defaults to grok-4.7, writes the full stdin prompt to a file, allows only read-only file tools (read_file, grep, list_dir) (provider versions may retain subagent controls), and prints only the last assistant message from streaming-messages-json. Other settings inherit CLI config. No sessions are resumed.`);return 0;}
  if(!vendors[vendor] || (vendor==='grok'&&role!=='reviewer')) throw new Error('Unsupported agent vendor/role');
  if(options.effort&&!['low','medium','high','xhigh'].includes(options.effort)) throw new Error('Invalid --effort');
  const timeout=options['timeout-ms']??String(AGENT_TIMEOUT_MS); if(!/^\d+$/.test(timeout)||Number(timeout)<1) throw new Error('Invalid --timeout-ms');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'spec-agent-'));
  try {
   const output=path.join(directory,'final.txt');
   const promptFile=path.join(directory,'prompt.txt');
   const args=vendors[vendor](output,promptFile);
   const model=options.model??(role==='reviewer'?({claude:'sonnet',grok:'grok-4.7'}[vendor]??null):null);
   if(model) args.push('--model',model);
   if(options.effort) args.push(...(vendor==='codex'?['-c',`model_reasoning_effort=${JSON.stringify(options.effort)}`]:['--effort',options.effort]));
   if(vendor==='codex') args.push('-');
   const cli=options.cli??vendor;
   if(options['dry-run']) {console.log(JSON.stringify({cli,args:args.map(arg=>arg===output?'<temporary-final-message>':arg===promptFile?'<temporary-prompt>':arg)}));return 0;}
   const promptBuf=fs.readFileSync(0);
   const prompt=promptBuf.toString('utf8');
   if(!prompt.trim()) throw new Error('Empty stdin prompt');
   if(vendor==='grok') {
    fs.writeFileSync(promptFile,promptBuf,{mode:0o600});
    if(fs.statSync(promptFile).size!==promptBuf.length) throw new Error('Prompt file was truncated');
   }
   const start=process.hrtime.bigint();
   const result=await new Promise(resolve=>{
    // Inherit the runner-owned group; a detached provider defeats group cleanup.
    const child=spawn(cli,args,{stdio:['pipe','pipe','pipe'],detached:false,env:vendor==='grok'?{...process.env,...grokLeanEnv}:process.env});
    const tree=child.pid?processTree(child.pid,{ownedGroup:false}):null;
    let text='',size=0,ended=false;
    let termination=null;
    const stop=()=>{termination??=tree?.terminate()??Promise.resolve();};
    const timer=setTimeout(stop,Number(timeout));
    const terminate=()=>stop(); process.once('SIGTERM',terminate); process.once('SIGINT',terminate);
    const finish=async code=>{if(ended)return;ended=true;clearTimeout(timer);if(termination){await termination;code=4;}tree?.stop();process.removeListener('SIGTERM',terminate);process.removeListener('SIGINT',terminate);resolve({code,text});};
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>8*1024*1024)stop();else if(vendor!=='codex')text+=chunk;});
    // Provider diagnostics may contain credentials; never forward them to logs.
    child.stderr.resume(); child.stdin.on('error',()=>{});
    child.on('error',()=>finish(4));child.on('close',code=>finish(code??4));child.stdin.end(vendor==='grok'?promptBuf:prompt);
   });
   let text='';
   let failure=null,usage;
   if(result.code===0) {
    if(vendor==='grok') {
     const final=grokFinalMessage(result.text);
     if(final.failure) {failure=final.failure;result.code=4;}
     else {text=final.text;usage=final.usage;}
    } else text=vendor==='codex'?fs.readFileSync(output,'utf8'):result.text;
   }
   if(options.metrics) fs.appendFileSync(options.metrics,JSON.stringify({vendor,role,exit:result.code,wall_ms:Number(process.hrtime.bigint()-start)/1e6,output_bytes:Buffer.byteLength(text),output_sha256:createHash('sha256').update(text).digest('hex'),...(usage?{usage}:{}),...(vendor==='grok'?{input_bytes:promptBuf.length}:{})})+'\n');
   if(result.code!==0) {console.error(`${vendor} CLI failed (exit ${result.code}); ${failure??'check CLI availability and authentication separately'}.`);return result.code;}
   if(!text.trim()) throw new Error(`${vendor} CLI returned no final result`);
   process.stdout.write(text);return 0;
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
 } catch(error) {console.error(`${vendor}-${role}: ${error.code==='ENOENT'?'CLI final result unavailable':error.message}`);return 4;}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const agents=fileURLToPath(new URL('../../agents/',import.meta.url));
function fake(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spec-cli-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const cli=path.join(root,'vendor-cli'); fs.writeFileSync(cli,`#!/usr/bin/env node\nconst fs=require('node:fs'); const args=process.argv.slice(2), prompt=fs.readFileSync(0,'utf8');\nif(prompt==='refuse') {process.stderr.write('token=NEVER_LOG_THIS');process.exit(7);}\nconst value=JSON.stringify({args,prompt,pid:process.pid}); const i=args.indexOf('--output-last-message');\nif(i>=0) {fs.writeFileSync(args[i+1],value);process.stdout.write('vendor progress noise');} else process.stdout.write(value);\n`); fs.chmodSync(cli,0o755); return cli;
}
for(const vendor of ['codex','claude']) for(const role of ['writer','reviewer']) test(`${vendor} ${role} uses stdin/final stdout, parameters and a new process without session reuse`,t=>{
 const cli=fake(t), entry=path.join(agents,`${vendor}-${role}`);
 const call=(input,args=[])=>spawnSync(process.execPath,[entry,'--cli',cli,...args],{input,encoding:'utf8',timeout:10000});
 const metric=path.join(path.dirname(cli),'metrics.jsonl');
 const first=call('supplied source',['--metrics',metric]),second=call('supplied source',['--model','selected-model','--effort','high']);
 const measured=JSON.parse(fs.readFileSync(metric,'utf8'));assert.equal(measured.exit,0);assert.equal(measured.output_bytes,Buffer.byteLength(first.stdout));assert.ok(measured.wall_ms>0);assert.equal(measured.output_sha256.length,64);assert.ok(!fs.readFileSync(metric,'utf8').includes('supplied source'));
 assert.equal(first.status,0,first.stderr); assert.equal(second.status,0,second.stderr);
 const a=JSON.parse(first.stdout),b=JSON.parse(second.stdout);
 assert.equal(a.prompt,'supplied source'); assert.notEqual(a.pid,b.pid);
 assert.ok(b.args.includes('selected-model')); assert.ok(b.args.includes(vendor==='codex'?'model_reasoning_effort="high"':'high'));
 assert.ok(!b.args.some(arg=>['resume','fork','--resume','--continue'].includes(arg)));
 if(vendor==='codex') {assert.ok(a.args.includes('read-only')); assert.ok(a.args.includes('--ephemeral')); assert.ok(!a.args.includes('--model'));}
 else {assert.ok(a.args.includes('--no-session-persistence')); if(role==='reviewer') assert.ok(a.args.includes('sonnet'));}
 const failed=call('refuse'); assert.equal(failed.status,7); assert.equal(failed.stdout,''); assert.doesNotMatch(failed.stderr,/NEVER_LOG_THIS/);
 const dry=call('secret input',['--dry-run']); assert.equal(dry.status,0); assert.doesNotMatch(dry.stdout,/secret input/);
 const help=spawnSync(process.execPath,[entry,'--help'],{encoding:'utf8'});assert.equal(help.status,0);assert.match(help.stdout,/--model/);
});

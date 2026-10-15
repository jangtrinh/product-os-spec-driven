import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runCommand} from '../command-process.mjs';

const dead = pid => {try {process.kill(pid, 0); return false;} catch (error) {return error.code === 'ESRCH';}};
test('runner and wrapper derive ordered timeout defaults from one source', async () => {
  let defaults;
  try {defaults = await import('../agent-timeouts.mjs');} catch {}
  assert.ok(defaults, 'shared timeout defaults missing');
  assert.ok(defaults.RUNNER_TIMEOUT_MS > defaults.AGENT_TIMEOUT_MS);
  assert.match(fs.readFileSync(new URL('../command-process.mjs', import.meta.url), 'utf8'), /timeout = RUNNER_TIMEOUT_MS/);
  assert.match(fs.readFileSync(new URL('../../agents/agent-cli.mjs', import.meta.url), 'utf8'), /AGENT_TIMEOUT_MS/);
});
for (const mode of ['timeout', 'overflow']) test(`${mode} kills a detached grandchild even when wrapper ignores TERM`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-process-test-'));
  let pid;
  t.after(() => {if (pid && !dead(pid)) process.kill(pid, 'SIGKILL'); fs.rmSync(root, {recursive: true, force: true});});
  const marker = path.join(root, 'pid');
  fs.writeFileSync(path.join(root, 'child.mjs'), `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
  fs.writeFileSync(path.join(root, 'parent.mjs'), `import {spawn} from 'node:child_process';import fs from 'node:fs';spawn(process.execPath,['child.mjs'],{detached:true,stdio:'ignore'}).unref();process.on('SIGTERM',()=>{});const ready=setInterval(()=>{if(fs.existsSync(${JSON.stringify(marker)})){clearInterval(ready);${mode === 'overflow' ? "process.stdout.write('x'.repeat(9*1024*1024));" : ''}}},10);setInterval(()=>{},1000);`);
  const result = await runCommand(`${JSON.stringify(process.execPath)} parent.mjs`, {cwd: root, timeout: 700});
  pid = Number(fs.readFileSync(marker, 'utf8'));
  assert.equal(result[mode === 'timeout' ? 'timedOut' : 'overflow'], true);
  for (let i = 0; i < 50 && !dead(pid); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dead(pid), true, `detached grandchild ${pid} survived`);
});

test('interrupt waits for detached descendant cleanup before returning failure', async t => {
  const {spawn} = await import('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-interrupt-test-'));
  const module = new URL('../command-process.mjs', import.meta.url).href;
  const marker = path.join(root, 'pid'); let pid;
  const script = path.join(root, 'controller.mjs');
  fs.writeFileSync(path.join(root, 'child.mjs'), `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`);
  fs.writeFileSync(path.join(root, 'parent.mjs'), "import {spawn} from 'node:child_process';spawn(process.execPath,['child.mjs'],{detached:true,stdio:'ignore'}).unref();process.on('SIGTERM',()=>{});setInterval(()=>{},1000);");
  fs.writeFileSync(script, `import {runCommand,commandFailed} from ${JSON.stringify(module)};const result=await runCommand(${JSON.stringify(`${JSON.stringify(process.execPath)} parent.mjs`)},{cwd:${JSON.stringify(root)},timeout:5000});console.log(JSON.stringify({result,failed:commandFailed(result)}));`);
  const controller = spawn(process.execPath, [script], {stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = ''; controller.stdout.on('data', chunk => stdout += chunk);
  const closed = new Promise(resolve => controller.on('close', code => resolve(code)));
  t.after(() => {if (pid && !dead(pid)) process.kill(pid, 'SIGKILL'); if (!dead(controller.pid)) controller.kill('SIGKILL'); fs.rmSync(root, {recursive: true, force: true});});
  for (let i = 0; i < 100 && !fs.existsSync(marker); i++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(fs.existsSync(marker), 'double did not start'); pid = Number(fs.readFileSync(marker));
  controller.kill('SIGINT'); assert.equal(await closed, 0);
  assert.equal(JSON.parse(stdout).failed, true);
  assert.equal(JSON.parse(stdout).result.interrupted, true);
  assert.equal(dead(pid), true, `detached grandchild ${pid} survived interrupt`);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runCommand} from '../command-process.mjs';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

const wrapper = fileURLToPath(new URL('../../agents/claude-writer', import.meta.url));
const runner = fileURLToPath(new URL('../run.mjs', import.meta.url));
const dead = pid => {try {process.kill(pid, 0); return false;} catch (error) {return error.code === 'ESRCH';}};
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
async function waitFor(file) {
  for (let i = 0; i < 250 && !fs.existsSync(file); i++) await pause();
  assert.ok(fs.existsSync(file), `double did not start: ${file}`);
}
function double(t, root, mode) {
  const marker = path.join(root, 'grand.json');
  // Adapted from verifier wrapper-probes/escape-modes: parent exits immediately.
  // No detached spawn/setsid in the provider: ownership must come from the runner.
  fs.writeFileSync(path.join(root, 'grand.mjs'), `import fs from 'node:fs';import {execFileSync} from 'node:child_process';fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,pgid:Number(execFileSync('ps',['-p',String(process.pid),'-o','pgid='],{encoding:'utf8'}).trim())}));process.on('SIGTERM',()=>{});${mode === 'overflow' ? "setTimeout(()=>process.stdout.write('x'.repeat(9*1024*1024)),300);" : ''}setInterval(()=>{},1000);`);
  fs.writeFileSync(path.join(root, 'middle.mjs'), "import {spawn} from 'node:child_process';spawn(process.execPath,['grand.mjs'],{stdio:'inherit'}).unref();");
  const cli = path.join(root, 'provider-double');
  fs.writeFileSync(cli, `#!${process.execPath}\nimport fs from 'node:fs';import {spawn} from 'node:child_process';fs.writeFileSync('wrapper.pid',String(process.ppid));spawn(process.execPath,['middle.mjs'],{stdio:'inherit'}).unref();`);
  fs.chmodSync(cli, 0o755);
  t.after(async () => {
    if (fs.existsSync(marker)) {const {pid} = JSON.parse(fs.readFileSync(marker)); if (!dead(pid)) process.kill(pid, 'SIGKILL');}
    await pause();
  });
  return {marker, command: `${JSON.stringify(process.execPath)} ${JSON.stringify(wrapper)} --cli ${JSON.stringify(cli)} --timeout-ms 10000`};
}
for (const mode of ['timeout', 'overflow', 'SIGINT', 'SIGTERM']) test(`runner ${mode} kills quick-reparent ordinary grandchild through shipped wrapper`, async t => {
  const p = projectFixture(t); const probe = double(t, p.root, 'ordinary');
  let result;
  if (mode === 'timeout' || mode === 'overflow') {
    let cmd = probe.command;
    if (mode === 'overflow') {
      p.write('overflow-root.mjs', `import fs from 'node:fs';import {spawn} from 'node:child_process';const child=spawn(process.execPath,${JSON.stringify([wrapper, '--cli', path.join(p.root, 'provider-double'), '--timeout-ms', '10000'])},{stdio:['pipe','inherit','inherit']});child.stdin.end('Offline double.');const ready=setInterval(()=>{if(fs.existsSync(${JSON.stringify(probe.marker)})){clearInterval(ready);process.stdout.write('x'.repeat(9*1024*1024));}},20);setInterval(()=>{},1000);`);
      cmd = `${JSON.stringify(process.execPath)} overflow-root.mjs`;
    }
    result = await runCommand(cmd, {cwd: p.root, input: 'Offline double.', timeout: 1500});
    assert.equal(result[mode === 'timeout' ? 'timedOut' : 'overflow'], true);
  } else {
    p.config.agents.writer.command = probe.command; p.save();
    const child = spawn(process.execPath, [runner, '--project', p.root, '--head', 'fixture-head', '--build', 'not-built'], {stdio: ['ignore', 'pipe', 'pipe']});
    child.stdout.resume(); child.stderr.resume();
    const closed = new Promise(resolve => child.on('close', resolve));
    t.after(() => {if (!dead(child.pid)) child.kill('SIGKILL');});
    await waitFor(probe.marker); await new Promise(resolve => setTimeout(resolve, 300));
    child.kill(mode); assert.equal(await closed, 4);
  }
  await waitFor(probe.marker);
  const {pid, pgid} = JSON.parse(fs.readFileSync(probe.marker));
  for (let i = 0; i < 100 && !dead(pid); i++) await pause();
  assert.equal(dead(pid), true, `grandchild ${pid} survived ${mode}`);
  assert.equal(pgid, result?.pid ?? Number(fs.readFileSync(path.join(p.root, 'wrapper.pid'))), 'provider must stay in runner-owned group');
});
for (const mode of ['timeout', 'SIGINT', 'SIGTERM']) test(`standalone wrapper ${mode} still kills its provider CLI`, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-wrapper-own-'));
  const marker = path.join(root, 'cli.pid'), cli = path.join(root, 'provider-double');
  fs.writeFileSync(cli, `#!${process.execPath}\nimport fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`); fs.chmodSync(cli, 0o755);
  const child = spawn(process.execPath, [wrapper, '--cli', cli, '--timeout-ms', mode === 'timeout' ? '500' : '10000'], {cwd: root, stdio: ['pipe', 'pipe', 'pipe']});
  child.stdout.resume(); child.stderr.resume(); child.stdin.end('Offline double.');
  const closed = new Promise(resolve => child.on('close', resolve));
  t.after(() => {if (fs.existsSync(marker)) {const pid = Number(fs.readFileSync(marker)); if (!dead(pid)) process.kill(pid, 'SIGKILL');} if (!dead(child.pid)) child.kill('SIGKILL'); fs.rmSync(root, {recursive: true, force: true});});
  await waitFor(marker); if (mode !== 'timeout') child.kill(mode);
  assert.notEqual(await closed, 0); assert.equal(dead(Number(fs.readFileSync(marker))), true);
});

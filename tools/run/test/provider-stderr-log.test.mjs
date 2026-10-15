import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {redact} from '../command-process.mjs';

const agents = fileURLToPath(new URL('../../agents/', import.meta.url));
const SECRETS = ['sk-abcdefghijklmnop1234567890', 'Zm9vYmFyYmF6cXV4MTIzNDU2', 'hunter2-not-a-real-key', 'ghp_abcdefghijklmnop123456'];
const DIAGNOSTIC = 'auth failed: provider rejected the request';
const providerStderr = [DIAGNOSTIC, `retry with token ${SECRETS[0]}`, `Authorization: Bearer ${SECRETS[1]}`, `api_key=${SECRETS[2]}`, `github ${SECRETS[3]}`];
// Fake provider: reads the prompt, prints secret-looking diagnostics on stderr and exits 1.
function fakeProvider(p) {
  const file = path.join(p.root, 'fake-provider-cli.mjs');
  fs.writeFileSync(file, `#!/usr/bin/env node\nimport fs from 'node:fs'; fs.readFileSync(0, 'utf8'); process.stderr.write(${JSON.stringify(providerStderr.join('\n'))} + '\\n'); process.exit(1);\n`);
  fs.chmodSync(file, 0o755);
  return file;
}
// A project-provided agent command: stderr goes straight to the runner.
const projectCommand = p => `${JSON.stringify(process.execPath)} ${JSON.stringify(fakeProvider(p))}`;
// A shipped wrapper in front of the provider CLI.
const wrapperCommand = name => p => `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(agents, name))} --cli ${JSON.stringify(fakeProvider(p))}`;
const logs = p => fs.readdirSync(path.join(p.root, 'review/log')).filter(name => name.endsWith('-stderr.txt'));
const assertClean = (text, label) => { for (const secret of SECRETS) assert.ok(!text.includes(secret), `${label} leaked ${secret}`); };

function expectLoggedFailure(t, role, command) {
  const p = projectFixture(t, ['prd']);
  p.config.agents[role].command = command(p); p.save();
  const run = p.run();
  assert.equal(run.code, 4, run.out);
  assert.match(run.out, role === 'writer' ? /Writer not runnable/ : /Reviewer not runnable/);
  const files = logs(p); assert.equal(files.length, 1, files.join());
  assert.match(files[0], role === 'writer' ? /^prd-writer-\d+-\d+-stderr\.txt$/ : /^prd-review-\d+-stderr\.txt$/);
  assert.ok(run.out.includes(`stderr log: review/log/${files[0]}`), run.out);
  const log = fs.readFileSync(path.join(p.root, 'review/log', files[0]), 'utf8');
  assert.match(log, new RegExp(DIAGNOSTIC)); assert.match(log, /\[REDACTED\]/);
  assertClean(log, 'stderr log'); assertClean(run.out, 'console output');
  assert.ok(!run.out.includes('retry with token'), 'console shows the log path, not the whole diagnostic');
}

test('redact strips sk- keys, bearer tokens and key=value secrets', () => {
  const text = redact(providerStderr.join('\n'));
  assertClean(text, 'redact()');
  assert.match(text, /auth failed/);
});
test('failed writer command exits 4 and keeps redacted stderr in a named log', t => expectLoggedFailure(t, 'writer', projectCommand));
test('failed reviewer command exits 4 and keeps redacted stderr in a named log', t => expectLoggedFailure(t, 'reviewer', projectCommand));

// The shipped wrappers still drop the provider's stderr inside tools/agents/agent-cli.mjs. Those files are hashed
// gate inputs, so changing them stales approved gates on upgrade (see upgraded-approval-preservation); un-skip
// these once that cost is accepted and the wrapper captures stderr through the shared redaction helper.
const WRAPPER_BLOCKED = 'tools/agents/** is a hashed gate input; changing the wrapper stales approved gates on upgrade';
test('shipped codex writer wrapper surfaces redacted provider stderr in the log', {skip: WRAPPER_BLOCKED}, t => expectLoggedFailure(t, 'writer', wrapperCommand('codex-writer')));
test('shipped claude reviewer wrapper surfaces redacted provider stderr in the log', {skip: WRAPPER_BLOCKED}, t => expectLoggedFailure(t, 'reviewer', wrapperCommand('claude-reviewer')));

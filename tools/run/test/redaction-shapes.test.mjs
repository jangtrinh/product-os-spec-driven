import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {redact} from '../command-process.mjs';
import {currentEvalEvidence} from '../current-eval-evidence.mjs';

// Every value below is an obviously fake test secret. `secret` is the substring that must never survive.
const SHAPES = [
  {name: 'URL userinfo', line: 'fetch failed for https://deploy-bot:s3cret-fake@registry.example.test/pkg.tgz', secret: 's3cret-fake'},
  {name: 'URL userinfo token only', line: 'clone https://ghp_fakefakefakefake1234@git.example.test/repo.git failed', secret: 'ghp_fakefakefakefake1234'},
  {name: 'JSON api_key', line: '{"api_key": "abcd-fake-key", "region": "eu"}', secret: 'abcd-fake-key'},
  {name: 'quoted value with spaces', line: 'config error password: "secret with spaces fake" rejected', secret: 'secret with spaces fake'},
  {name: 'single quoted value with spaces', line: "token = 'two words fake' invalid", secret: 'two words fake'},
  {name: 'Authorization Bearer quoted', line: 'Authorization: Bearer "bearer-fake-quoted-value"', secret: 'bearer-fake-quoted-value'},
  {name: 'Authorization Bearer bare', line: 'Authorization: Bearer bearer-fake-bare-value-1234', secret: 'bearer-fake-bare-value-1234'},
  {name: 'Authorization Basic', line: 'Authorization: Basic ZmFrZXVzZXI6ZmFrZXBhc3M=', secret: 'ZmFrZXVzZXI6ZmFrZXBhc3M='},
  {name: 'github_pat token', line: 'auth with github_pat_11ABCDEFG0fakefakefakefake_abcdefghijklmnopqrstuvwxyz0123 failed', secret: 'github_pat_11ABCDEFG0fakefakefakefake'},
  {name: 'SECRET_KEY env', line: 'SECRET_KEY=env-secret-key-fake', secret: 'env-secret-key-fake'},
  {name: '_TOKEN env', line: 'DEPLOY_TOKEN=env-deploy-token-fake', secret: 'env-deploy-token-fake'},
  {name: '_KEY env', line: 'export STRIPE_KEY=env-stripe-key-fake', secret: 'env-stripe-key-fake'},
  {name: 'multi-line quoted value', line: 'private_key: "line-one-fake\nline-two-fake\nline-three-fake" tail', secret: 'line-two-fake'},
  {name: 'multi-line block scalar', line: 'secret: |\n  block-line-one-fake\n  block-line-two-fake\nnext: ok', secret: 'block-line-two-fake'},
  {name: 'block scalar with a blank line', line: 'secret: |\n  blank-block-one-fake\n\n  blank-block-two-fake\n\n  blank-block-three-fake\nnext: ok', secret: 'blank-block-three-fake'},
  {name: 'block scalar with indentation indicator', line: 'secret: |2\n    indicator-block-one-fake\n    indicator-block-two-fake\nnext: ok', secret: 'indicator-block-one-fake'},
  {name: 'block scalar with CRLF', line: 'secret: |\r\n  crlf-block-one-fake\r\n  crlf-block-two-fake\r\nnext: ok', secret: 'crlf-block-two-fake'},
  {name: 'folded block scalar with chomping', line: 'private_key: >-\n  folded-one-fake\n  folded-two-fake\nnext: ok', secret: 'folded-two-fake'},
  {name: 'block scalar with a trailing comment', line: 'password: | # rotate quarterly\n  comment-block-one-fake\n  comment-block-two-fake\nnext: ok', secret: 'comment-block-two-fake'},
  {name: 'block scalar with indicator and comment (CRLF)', line: 'secret: >-  # note\r\n  comment-crlf-one-fake\r\n  comment-crlf-two-fake\r\nnext: ok', secret: 'comment-crlf-two-fake'},
  {name: 'PEM private key', line: '-----BEGIN PRIVATE KEY-----\nMIIfakefakefakefake\nfakefakefake\n-----END PRIVATE KEY-----', secret: 'MIIfakefakefakefake'},
];
const KEPT = 'diagnostic text that must stay readable';

test('redact covers every secret shape and keeps the diagnostic text', () => {
  for (const shape of SHAPES) {
    const out = redact(`${KEPT}\n${shape.line}\n${KEPT} again`);
    assert.ok(!out.includes(shape.secret), `${shape.name} leaked: ${out}`);
    assert.ok(out.includes('[REDACTED]'), `${shape.name} not marked: ${out}`);
    assert.ok(out.startsWith(KEPT) && out.endsWith(`${KEPT} again`), `${shape.name} damaged surrounding text: ${out}`);
    assert.equal(redact(out), out, `${shape.name} redaction is not idempotent`);
  }
});

test('a block scalar ends where the indentation decreases and a missing end cannot swallow a large log', () => {
  const out = redact('  secret: |\n      inner-fake\n\n      inner-two-fake\n  sibling: kept\n    deeper: kept too\n');
  assert.ok(!out.includes('inner-two-fake'));
  assert.match(out, /sibling: kept/); assert.match(out, /deeper: kept too/);
  const big = `secret: |\n${'  filler line of an unterminated block\n'.repeat(40000)}`;
  const redacted = redact(big);
  assert.ok(redacted.length < big.length && redacted.length > 100000, `cap leaves the tail visible: ${redacted.length}`);
});

test('redact leaves ordinary prose and identifiers alone', () => {
  const plain = 'Basic authentication is required\nmonkey: banana\nkeyboard layout ok\nERROR spec/prd.txt:3 heading "Scope" is missing\nhttps://example.test/a/b?x=1';
  assert.equal(redact(plain), plain);
});

const printedFirstLine = out => out.split('\n').find(line => line.includes('Writer not runnable')) ?? '';

test('a failed writer command with a secret on stderr line 1 keeps it out of the log and the printed line', t => {
  for (const shape of SHAPES) {
    const p = projectFixture(t, ['prd']);
    const first = path.join(p.root, 'noisy-writer.mjs');
    fs.writeFileSync(first, `import fs from 'node:fs'; fs.readFileSync(0, 'utf8'); process.stderr.write(${JSON.stringify(`${shape.line}\nsecond diagnostic line\n`)}); process.exit(1);\n`);
    p.config.agents.writer.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(first)}`; p.save();
    const run = p.run(); assert.equal(run.code, 4, `${shape.name}: ${run.out}`);
    assert.ok(!run.out.includes(shape.secret), `${shape.name} leaked to the console: ${printedFirstLine(run.out)}`);
    const logs = fs.readdirSync(path.join(p.root, 'review/log')).filter(name => name.endsWith('-stderr.txt'));
    assert.equal(logs.length, 1, `${shape.name}: ${logs.join()}`);
    const log = fs.readFileSync(path.join(p.root, 'review/log', logs[0]), 'utf8');
    assert.ok(!log.includes(shape.secret), `${shape.name} leaked to the stored log`);
    assert.match(log, /second diagnostic line/);
  }
});

test('a secret on an eval ERROR line stays out of the stored eval log and the writer repair request', t => {
  for (const shape of SHAPES) {
    const p = projectFixture(t, ['prd'], {writer: {}});
    const capture = path.join(p.root, 'writer-inputs.jsonl');
    p.config.agents.writer.command = command({badUntilFix: true, capture});
    const lines = JSON.stringify(`ERROR spec/prd.txt:3 ${shape.line}\nERROR spec/prd.txt:9 second problem`);
    p.write('evaluator.mjs', `import fs from 'node:fs';const bad=fs.readFileSync('spec/prd.txt','utf8').includes('defect');if(bad){console.log(${lines});}if(!bad)console.log('checked 1 spec/prd.txt');process.exit(bad?1:0);`);
    p.config.evals.prd = [{run: `${JSON.stringify(process.execPath)} evaluator.mjs`}]; p.save();
    const run = p.run(); assert.equal(run.code, 2, `${shape.name}: ${run.out}`);
    const inputs = fs.readFileSync(capture, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).input);
    assert.equal(inputs.length, 2, `${shape.name}: initial write plus one repair`);
    const repair = inputs[1].slice(inputs[1].indexOf('CHANGE REQUEST / REPAIR:'));
    assert.ok(!repair.includes(shape.secret), `${shape.name} leaked into the repair request`);
    assert.match(repair, /second problem/, `${shape.name}: the ERROR line after the secret must survive`);
    const evalLogs = fs.readdirSync(path.join(p.root, 'review/log')).filter(name => name.includes('-eval-'));
    assert.ok(evalLogs.length > 0);
    for (const name of evalLogs) assert.ok(!fs.readFileSync(path.join(p.root, 'review/log', name), 'utf8').includes(shape.secret), `${shape.name} leaked into ${name}`);
    assert.ok(!run.out.includes(shape.secret), `${shape.name} leaked to the console`);
  }
});

// `truncated` means ERROR lines were actually dropped, not merely that the excerpt is shorter than the log.
function evidenceFor(t, log, options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-evidence-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'eval.txt'), log);
  const text = currentEvalEvidence(root, [{report: 'eval.txt', exit_code: 1}], options);
  return JSON.parse(text.split('\n').find(line => line.startsWith('[')))[0];
}
test('truncated is false when every ERROR line fits even though the log is longer', t => {
  const header = Array.from({length: 80}, (_, i) => `Q-CHECK-${i}: NOT RUN (no records declared)`).join('\n');
  const row = evidenceFor(t, `${header}\nERROR a.txt:1 first\nERROR a.txt:2 second\n`, {only: /\bERROR\b/});
  assert.match(row.excerpt, /first/); assert.match(row.excerpt, /second/);
  assert.equal(row.truncated, false);
});
test('truncated is true when ERROR lines were dropped for budget', t => {
  const flood = Array.from({length: 400}, (_, i) => `ERROR line ${i} padding padding padding`).join('\n');
  const row = evidenceFor(t, flood, {only: /\bERROR\b/});
  assert.match(row.excerpt, /ERROR line 0 /); assert.doesNotMatch(row.excerpt, /ERROR line 399 /);
  assert.equal(row.truncated, true);
});
test('truncated keeps its meaning without a line filter', t => {
  assert.equal(evidenceFor(t, 'short log\n').truncated, false);
  assert.equal(evidenceFor(t, 'x'.repeat(5000)).truncated, true);
});

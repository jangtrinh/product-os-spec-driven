import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {evaluate} from '../eval-commands.mjs';
import {recordReceipt} from '../evidence-records.mjs';
import * as runtime from '../runtime-state.mjs';

const read = (p, file) => fs.readFileSync(path.join(p.root, file), 'utf8');
test('silent evaluator cannot approve a planted wrong outcome or consume a behavioral round', t => {
  const p = projectFixture(t, ['prd'], {writer: {text: 'defect\n'}});
  p.config.roles.po.enabled = false;
  p.config.evals.prd = [{run: 'node -e "process.exit(0)"'}];
  p.write('spec/prd.txt', 'defect\n'); p.save();
  const result = p.run(); assert.equal(result.code, 4, result.out);
  assert.match(result.out, /observation/);
  assert.equal(read(p, 'spec/prd.txt'), 'defect\n');
  assert.equal(fs.existsSync(path.join(p.root, 'review/gates/prd.md')), false);
  assert.deepEqual(fs.readdirSync(path.join(p.root, 'review/receipts')), []);
  const state = JSON.parse(read(p, 'review/runtime/prd.json'));
  assert.equal(state.rounds.eval_fix, 0); assert.equal(state.rounds.review, 0);
  const logs = fs.readdirSync(path.join(p.root, 'review/log')).filter(f => f.includes('-eval-'));
  assert.match(read(p, `review/log/${logs[0]}`), /exit=0;/);
  const before = read(p, 'review/audit.jsonl');
  assert.equal(p.run().code, 4); assert.equal(read(p, 'review/audit.jsonl'), before);
});

test('restart after malformed output cannot invoke a successful writer beyond the persisted cap', t => {
  const p = projectFixture(t); p.config.roles.po.enabled = false; p.config.limits.max_fix_rounds = 1;
  p.definitions.prd.outputs = ['spec/a.txt', 'spec/b.txt'];
  for (const file of p.definitions.prd.outputs) p.write(file, 'good\n');
  for (const file of p.definitions.prd.outputs) fs.rmSync(path.join(p.root, file));
  p.write('counted-writer.mjs', `import fs from 'node:fs';
const count = fs.existsSync('attempts.txt') ? Number(fs.readFileSync('attempts.txt', 'utf8')) + 1 : 1;
fs.writeFileSync('attempts.txt', String(count));
process.stdout.write(count < 3 ? 'malformed' : '\x60\x60\x60files\\n' + JSON.stringify({'spec/a.txt':'good\\n','spec/b.txt':'good\\n'}) + '\\n\x60\x60\x60\\n');
`);
  p.config.agents.writer.command = `${JSON.stringify(process.execPath)} counted-writer.mjs`;
  p.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/*.txt'}]; p.save();
  assert.equal(p.run().code, 2); assert.equal(read(p, 'attempts.txt'), '2');
  const before = read(p, 'review/audit.jsonl'); const state = read(p, 'review/runtime/prd.json');
  const resumed = p.run(); assert.equal(resumed.code, 2, resumed.out);
  assert.match(resumed.out, /cap exhausted/); assert.equal(read(p, 'attempts.txt'), '2');
  assert.equal(read(p, 'review/audit.jsonl'), before); assert.equal(read(p, 'review/runtime/prd.json'), state);
  assert.equal(fs.existsSync(path.join(p.root, 'spec/a.txt')), false);
});

test('manual repair prompt reserves only the submitted attempt and resumes at cap one', t => {
  const p = projectFixture(t); p.config.agents.writer.command = 'manual'; p.config.limits.max_fix_rounds = 1;
  p.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/prd.txt'}]; p.save();
  p.write('bad.txt', 'defect\n'); p.write('good.txt', 'Generated prd\n');
  assert.equal(p.run(['--paste', 'bad.txt']).code, 2);
  const pending = JSON.parse(read(p, 'review/runtime/prd.json'));
  assert.equal(pending.rounds.eval_fix, 0);
  const result = p.run(['--result', 'good.txt']); assert.equal(result.code, 2, result.out);
  assert.match(result.out, /GATE: PENDING/);
  assert.equal(p.gate('prd').data.model.rounds.eval_fix, 1);
});

test('failed reviewer execution is reserved before launch and cannot retry beyond cap', t => {
  const p = projectFixture(t, ['prd'], {reviewer: {exit: 1}}); p.config.review.max_rounds = 1; p.save();
  assert.equal(p.run().code, 4);
  assert.equal(JSON.parse(read(p, 'review/runtime/prd.json')).rounds.review, 1);
  const before = read(p, 'review/audit.jsonl'); const again = p.run();
  assert.equal(again.code, 2, again.out); assert.match(again.out, /Review cap exhausted/);
  assert.equal(read(p, 'review/audit.jsonl'), before);
});

test('silent nonzero evaluator is unavailable observation, never behavioral RED', async t => {
  const p = projectFixture(t); p.config.evals.prd = [{run: 'node -e "process.exit(1)"'}];
  const rounds = {eval_fix: 0};
  await assert.rejects(evaluate(p.root, p.config, 'prd', {}, {rounds}), error => error.code === 4);
  assert.equal(rounds.eval_fix, 0); assert.equal(fs.existsSync(path.join(p.root, 'review/audit.jsonl')), false);
  const log = fs.readdirSync(path.join(p.root, 'review/log'))[0]; assert.match(read(p, `review/log/${log}`), /exit=1;/);
});

test('receipt construction cannot turn a silent successful command log into PASS', t => {
  const p = projectFixture(t); p.write('review/log/silent.txt', '\n\nexit=0; signal=null; timeout=false\n');
  assert.throws(() => recordReceipt(p.root, p.config, p.definitions.prd, null, [], [], {}, {}, [{command: 'silent', exit_code: 0, report: 'review/log/silent.txt'}]), error => error.code === 4);
  assert.deepEqual(fs.readdirSync(path.join(p.root, 'review/receipts')), []);
  assert.equal(fs.existsSync(path.join(p.root, 'review/audit.jsonl')), false);
});

test('stale competing reservations and held runtime lock cannot spend another attempt', t => {
  const p = projectFixture(t); const state = runtime.loadState(p.root, p.config, p.definitions.prd);
  runtime.saveState(p.root, 'prd', state); const stale = structuredClone(state);
  runtime.reserveAttempt(p.root, 'prd', state, 'eval_fix');
  const audit = read(p, 'review/audit.jsonl'); const bytes = read(p, 'review/runtime/prd.json');
  assert.throws(() => runtime.reserveAttempt(p.root, 'prd', stale, 'eval_fix'), error => error.code === 2);
  assert.throws(() => runtime.saveState(p.root, 'prd', stale), error => error.code === 2);
  p.write('review/runtime/prd.lock', 'held by fixture');
  assert.throws(() => runtime.reserveAttempt(p.root, 'prd', state, 'eval_fix'), error => error.code === 2);
  assert.equal(read(p, 'review/audit.jsonl'), audit); assert.equal(read(p, 'review/runtime/prd.json'), bytes);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {auditEvents, appendAudit} from '../audit-store.mjs';
import {loadConfig, STAGES} from '../../lib/config/config-loader.mjs';
import {appendAnswer, readAnswers, emptyAnswers} from '../answer-source.mjs';

const kit = fileURLToPath(new URL('../../../', import.meta.url));
const call = (entry, root, args = []) => spawnSync(process.execPath, [path.join(kit, 'tools/run', entry), '--project', root, ...args], {encoding: 'utf8'});
function snapshot(root) {
  const rows = {};
  function walk(dir) { for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, ent.name);
    rows[path.relative(root, full)] = ent.isDirectory() ? 'directory' : fs.readFileSync(full).toString('base64');
    if (ent.isDirectory()) walk(full);
  }} walk(root); return rows;
}
for (const [args, channel] of [[[], 'direct'], [['--confirmed-via', 'ask-user'], 'agent-ask-user']]) {
  for (const action of [['--approve'], ['--request-changes', 'PO supplied request']]) test(`decision ${action[0]} stores ${channel} with its audit witness`, t => {
    const p = projectFixture(t); assert.equal(p.run().code, 2);
    const r = call('decide.mjs', p.root, ['--stage', 'prd', '--as', 'po@example.test', ...action, ...args]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const event = auditEvents(p.root).filter(row => row.type === 'decision').at(-1);
    const record = JSON.parse(fs.readFileSync(path.join(p.root, `review/decisions/${event.id}.json`)));
    assert.equal(record.channel, channel); assert.equal(event.channel, channel);
  });
}
for (const args of [['--confirmed-via', 'chat'], ['--confirmed-via', 'ask-user', '--confirmed-via', 'ask-user'], ['--confirmed-via']]) test(`invalid confirmation ${args.join(' ')} refuses without writes`, t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2); const before = snapshot(p.root);
  const r = call('decide.mjs', p.root, ['--stage', 'prd', '--as', 'po@example.test', '--approve', ...args]);
  assert.equal(r.status, 3, r.stdout); assert.deepEqual(snapshot(p.root), before);
});
test('status reads fresh and pending stages without locks or mutations', t => {
  const p = projectFixture(t, ['prd', 'us']); const before = snapshot(p.root);
  let r = call('status.mjs', p.root, ['--json']); assert.equal(r.status, 0, r.stdout + r.stderr);
  let value = JSON.parse(r.stdout); assert.deepEqual(value.stages.map(row => row.stage), ['prd', 'us']);
  assert.equal(value.stages[0].gate, 'none'); assert.equal(value.stages[0].fix.used, 0); assert.equal(value.stages[0].review.cap, 3);
  assert.match(value.next_command, /run.mjs .*--head fresh-source --build not-built/);
  assert.deepEqual(snapshot(p.root), before); assert.equal(p.run().code, 2);
  const pending = snapshot(p.root); r = call('status.mjs', p.root, ['--json']); assert.equal(r.status, 0, r.stdout + r.stderr);
  value = JSON.parse(r.stdout); assert.equal(value.stages[0].gate, 'PENDING'); assert.match(value.next_command, /decide.mjs .*--stage prd/);
  assert.deepEqual(snapshot(p.root), pending);
});
test('status reports exhausted caps and preserves original runtime pins in recovery', t => {
  const p = projectFixture(t, ['prd'], {writer: {unchanged: true}});
  p.config.limits.max_fix_rounds = 1; p.save();
  p.write('review/runtime/prd.json', {phase: 'repair', rounds: {cycle: 'prd-lineage', eval_fix: 1, review: 0, max_fix: 1, max_review: 3, continuation: null}, pins: {head: 'original-head', build: 'original-build'}});
  const before = snapshot(p.root); const r = call('status.mjs', p.root, ['--json']); assert.equal(r.status, 0, r.stdout + r.stderr);
  const value = JSON.parse(r.stdout); assert.equal(value.stages[0].continuation_possible, true);
  assert.match(value.next_command, /--continue --reason/); assert.deepEqual(snapshot(p.root), before);
});
test('status subtracts answered ids, joins clarify records and ignores quoted examples', t => {
  const p = projectFixture(t, ['clarify']);
  p.write('spec/decisions/decisions.md', '| Id | Question | Dependencies | Asked round | Answer / source | Disposition |\n|---|---|---|---|---|---|\n| Q-001 | First? | | 1 | OPEN | open |\n| Q-002 | Second? | Q-001 | 1 | OPEN | open |\n<!-- | Q-999 | Example | | 1 | OPEN | open | -->\n');
  p.write('review/clarify/Q-003.json', {id: 'Q-003', status: 'open', question: 'Third?', options: ['A', 'B'], recommended: 1});
  p.write('input/answers.md', '# PO answers\n\n| Q | Answer | Decided by | Date | Note |\n|---|---|---|---|---|\n| Q-001 | First \\| answer | po@example.test | 2026-10-13 | Provided in session |\n');
  const r = call('status.mjs', p.root, ['--json']); assert.equal(r.status, 0, r.stdout + r.stderr);
  const value = JSON.parse(r.stdout); assert.deepEqual(value.open_questions.map(row => row.id), ['Q-002', 'Q-003']);
  assert.deepEqual(value.open_questions[1].options, ['A', 'B']); assert.equal(value.open_questions[1].recommended, 1);
});
test('init creates answer source for decision-reading stages but excludes intake', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-answers-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const r = call('init.mjs', root, ['--name', 'Fixture', '--lang', 'en']); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(fs.readFileSync(path.join(root, 'input/answers.md'), 'utf8'), /\| Q \| Answer \| Decided by \| Date \| Note \|/);
  const config = loadConfig(root); assert.ok(!config.stages.intake.context.includes('input/answers.md'));
  for (const stage of STAGES.filter(s => s !== 'intake' && config.stages[s].context.includes('spec/decisions/decisions.md'))) assert.ok(config.stages[stage].context.includes('input/answers.md'), stage);
});
test('PO answer append preserves literal pipes, newlines, markup and prior source bytes', t => {
  const p = projectFixture(t); p.write('input/answers.md', emptyAnswers + '\nOwner note after table.\n');
  const before = fs.readFileSync(path.join(p.root, 'input/answers.md'), 'utf8');
  const row = {id: 'Q-001', answer: 'a \\| b\nLiteral <br> &amp; text', decided_by: 'po@example.test', date: '2026-10-13'};
  appendAnswer(p.root, row, 'ask-user');
  assert.equal(readAnswers(p.root)[0].answer, row.answer);
  assert.ok(fs.readFileSync(path.join(p.root, 'input/answers.md'), 'utf8').endsWith('Owner note after table.\n'));
  const recorded = snapshot(p.root);
  for (const [data, via] of [[row, 'ask-user'], [{...row, id: 'Q-002'}, 'chat'], [{...row, id: 'Q-002', date: '2026-02-30'}, 'ask-user'], [{...row, id: 'Q-002', decided_by: 'agent@example.test'}, 'ask-user']]) {
    assert.throws(() => appendAnswer(p.root, data, via)); assert.deepEqual(snapshot(p.root), recorded);
  }
  assert.ok(before.includes('| Q | Answer |'));
});
test('continuation stores the same asserted channel as approval without resetting caps', t => {
  const p = projectFixture(t); p.config.limits.max_fix_rounds = 1; p.save();
  p.write('review/runtime/prd.json', {phase: 'repair', rounds: {cycle: 'prd-lineage', eval_fix: 1, review: 0, max_fix: 1, max_review: 3, continuation: null}, pins: {head: 'original-head', build: 'original-build'}});
  const r = call('decide.mjs', p.root, ['--stage', 'prd', '--as', 'po@example.test', '--confirmed-via', 'ask-user', '--continue', '--reason', 'PO gave one more round']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const event = auditEvents(p.root).filter(e => e.type === 'decision').at(-1);
  assert.equal(event.channel, 'agent-ask-user');
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, `review/decisions/${event.id}.json`))).channel, event.channel);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'))).rounds.eval_fix, 1);
});
test('legacy audit replay treats an absent channel as direct without rewriting history', t => {
  const p = projectFixture(t);
  const event = {id: 'legacy-channel', type: 'decision', scope: p.definitions.prd.scope, refs: ['legacy'], actor: 'po@example.test', reason: 'PO decided directly'};
  appendAudit(p.root, event); const before = snapshot(p.root);
  assert.doesNotThrow(() => appendAudit(p.root, {...event, channel: 'direct'})); assert.deepEqual(snapshot(p.root), before);
});
test('status routes a stale pending gate back to the runner without mutating the gate', t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2);
  fs.appendFileSync(path.join(p.root, 'input/po-spec.txt'), '\nPO changed the source.\n');
  const before = snapshot(p.root), r = call('status.mjs', p.root, ['--json']); assert.equal(r.status, 0, r.stdout + r.stderr);
  const value = JSON.parse(r.stdout); assert.equal(value.stages[0].freshness, 'STALE'); assert.match(value.next_command, /run.mjs/);
  assert.deepEqual(snapshot(p.root), before);
});
test('status reads manifest-declared clarification projections and canonical records win over stale copies', t => {
  const p = projectFixture(t, ['clarify']);
  p.write('spec/spec.manifest.json', {gate_model: {records: 'assets/records'}});
  p.write('spec/assets/records/clarify/Q-001.json', {id: 'Q-001', status: 'answered', question: 'Old projection'});
  p.write('spec/assets/records/clarify/Q-002.json', {id: 'Q-002', status: 'open', question: 'Exported question', options: ['A', 'B'], recommended: 0});
  p.write('review/clarify/Q-001.json', {id: 'Q-001', status: 'open', question: 'Current question', options: ['A', 'B'], recommended: 0});
  const r = call('status.mjs', p.root, ['--json']); assert.equal(r.status, 0, r.stdout + r.stderr);
  const value = JSON.parse(r.stdout); assert.deepEqual(value.open_questions.map(q => [q.id, q.question]), [['Q-001', 'Current question'], ['Q-002', 'Exported question']]);
});
test('ask-user channel does not authorize an unrecognized PO', t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2); const before = snapshot(p.root);
  const r = call('decide.mjs', p.root, ['--stage', 'prd', '--as', 'agent@example.test', '--confirmed-via', 'ask-user', '--approve']);
  assert.equal(r.status, 3); assert.deepEqual(snapshot(p.root), before);
});

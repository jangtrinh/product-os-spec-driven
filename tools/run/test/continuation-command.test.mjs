import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {auditEvents} from '../audit-store.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';
import {readRecord} from '../../lib/config/schema-validation.mjs';

const executable = fileURLToPath(new URL('../decide.mjs', import.meta.url));
const criteria = [{id: 'source', mandatory: true, score: 2, evidence: 'Compared original source and output'}];
const finding = {id: 'F-01', criterion: 'source', severity: 'Major', file: 'spec/prd.txt', line: 1, impact: 'review-3 confirmed gap', fix: 'Repair confirmed gap', owner: 'dev', disposition: 'open', reason: 'Unresolved'};
const read = (p, file) => fs.readFileSync(path.join(p.root, file), 'utf8');
const rows = (p, file) => fs.existsSync(path.join(p.root, file)) ? read(p, file).trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const state = p => JSON.parse(read(p, 'review/runtime/prd.json'));
const recovery = p => `node tools/run/decide.mjs --project ${p.root} --stage prd --as <your-po-email> --continue --reason "<text>"`;
function decide(p, args = ['--continue', '--reason', 'Repair confirmed findings'], email = 'po@example.test') {
  const r = spawnSync(process.execPath, [executable, '--project', p.root, '--stage', 'prd', '--as', email, ...args], {encoding: 'utf8'});
  return {code: r.status, out: r.stdout + r.stderr};
}
function snapshot(root) {
  const files = {};
  function visit(dir) {for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file); else files[path.relative(root, file)] = fs.readFileSync(file).toString('base64');
  }} visit(root); return files;
}
function fixture(t, failingEval = false) {
  const p = projectFixture(t);
  const capture = path.join(p.root, 'writer-input.jsonl');
  p.write('counted-writer.mjs', `import fs from 'node:fs';
const input=fs.readFileSync(0,'utf8'); const file=${JSON.stringify(capture)};
const n=fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\\n').length:0;
fs.appendFileSync(file,JSON.stringify({input,pid:process.pid})+'\\n');
process.stdout.write(${JSON.stringify(failingEval ? 'defect' : 'Generated prd')}+' '+n+'\\n');`);
  p.config.agents.writer.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(p.root, 'counted-writer.mjs'))}`;
  p.write('review-answer.txt', `VERDICT: NEEDS_CHANGES\n\`\`\`review-data\n${JSON.stringify({criteria, findings: [finding]})}\n\`\`\`\n`);
  p.write('counted-reviewer.mjs', `import fs from 'node:fs'; fs.readFileSync(0,'utf8');
fs.appendFileSync(${JSON.stringify(path.join(p.root, 'reviewer-input.jsonl'))},JSON.stringify({pid:process.pid})+'\\n');
process.stdout.write(fs.readFileSync(${JSON.stringify(path.join(p.root, 'review-answer.txt'))},'utf8'));`);
  p.config.agents.reviewer.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(p.root, 'counted-reviewer.mjs'))}`;
  p.config.evals.prd = [{run: `${command({eval: true, evalCapture: path.join(p.root, 'eval-input.jsonl')})} "spec/prd.txt"`}];
  p.save(); return p;
}
function atCap(t, failingEval = false) {
  const p = fixture(t, failingEval); const r = p.run();
  assert.equal(r.code, 2, r.out); return p;
}
test('review cap retains Major findings without a gate and prints PO recovery', t => {
  const p = atCap(t); const r = p.run();
  assert.equal(state(p).rounds.review, 3); assert.ok(!fs.existsSync(path.join(p.root, 'review/gates/prd.md')));
  assert.ok(r.out.includes(recovery(p)), r.out); assert.ok(!r.out.includes('po@example.test'));
});
for (const [name, args, email, capped] of [
  ['non-approver', ['--continue', '--reason', 'Repair'], 'dev@example.test', true],
  ['not at cap', ['--continue', '--reason', 'Repair'], 'po@example.test', false],
  ['approve conflict', ['--continue', '--reason', 'Repair', '--approve'], 'po@example.test', true],
  ['request conflict', ['--continue', '--reason', 'Repair', '--request-changes', 'Fix'], 'po@example.test', true],
  ['Minor conflict', ['--continue', '--reason', 'Repair', '--accept-minor', 'F-01', '--reason', 'Keep', '--follow-up', 'Later'], 'po@example.test', true],
  ['missing reason', ['--continue'], 'po@example.test', true],
]) test(`continuation ${name} refuses with no writes`, t => {
  const p = capped ? atCap(t) : fixture(t); const before = snapshot(p.root);
  const r = decide(p, args, email); assert.equal(r.code, 3, r.out); assert.deepEqual(snapshot(p.root), before);
});
test('recorded continuation repairs last findings, evaluates and independently reviews exactly once', t => {
  const p = atCap(t); const before = state(p); const r = decide(p);
  assert.equal(r.code, 0, r.out); assert.equal(r.out.trim().split('\n').length, 1);
  assert.match(r.out, /rerun: node tools\/run\/run.mjs .*--head fixture-head --build not-built/);
  const [file] = fs.readdirSync(path.join(p.root, 'review/exceptions'));
  const exception = readRecord(p.root, `review/exceptions/${file}`, 'exception.schema.json');
  assert.equal(exception.extra_rounds, 1); assert.equal(canonical(exception.scope), canonical(p.definitions.prd.scope));
  assert.equal(exception.by, 'po@example.test'); assert.equal(exception.status, 'active');
  assert.equal(Date.parse(exception.expires) - Date.parse(exception.at), 30 * 86400000);
  assert.deepEqual(exception.deferred_gates, []); assert.equal(exception.non_waivable.length, 3);
  const event = auditEvents(p.root).find(e => e.type === 'decision' && e.refs.includes(exception.id));
  assert.ok(event); const decision = JSON.parse(read(p, `review/decisions/${event.id}.json`));
  assert.deepEqual(decision.exceptions, [exception.id]); assert.equal(event.after, sha256(canonical(decision)));
  assert.deepEqual(state(p).rounds, before.rounds);
  const counts = ['writer-input.jsonl', 'eval-input.jsonl', 'reviewer-input.jsonl'].map(file => rows(p, file).length);
  const next = p.run(); assert.equal(next.code, 2, next.out); assert.ok(next.out.includes(recovery(p)), next.out);
  assert.ok(!next.out.includes('source/context changed after last review'), next.out);
  assert.deepEqual(['writer-input.jsonl', 'eval-input.jsonl', 'reviewer-input.jsonl'].map(file => rows(p, file).length), counts.map(n => n + 1));
  assert.match(rows(p, 'writer-input.jsonl').at(-1).input, /review-3 confirmed gap/);
  assert.equal(state(p).rounds.review, 4); assert.equal(state(p).rounds.eval_fix, before.rounds.eval_fix + 1);
  assert.equal(auditEvents(p.root).filter(e => e.type === 'exception' && e.refs.includes(exception.id)).length, 1);
  const after = snapshot(p.root); const again = p.run(); assert.equal(again.code, 2, again.out); assert.deepEqual(snapshot(p.root), after);
  assert.equal(decide(p).code, 0); assert.equal(p.run().code, 2); assert.equal(state(p).rounds.review, 5);
});
test('reviewer resume discards stale findings and freshly reviews changed outputs without a writer repair', t => {
  const p = fixture(t);
  p.config.agents.writer.command = command({text: 'Generated prd\n', capture: path.join(p.root, 'writer-input.jsonl')}); p.save();
  const initial = p.run(); assert.equal(initial.code, 2, initial.out); assert.match(initial.out, /no edits/);
  const runtime = state(p);
  assert.equal(runtime.review_result.verdict, 'NEEDS_CHANGES'); assert.equal(runtime.review_result.findings[0].severity, 'Major');
  assert.ok(runtime.rounds.review < runtime.rounds.max_review); assert.ok(runtime.rounds.eval_fix < runtime.rounds.max_fix);
  // Simulate a writer fix after the saved review, with the next reviewer still pending.
  const fixed = 'Generated prd with the confirmed gap repaired\n'; p.write('spec/prd.txt', fixed);
  assert.notEqual(runtime.reviewed_outputs['spec/prd.txt'], sha256(fixed));
  runtime.phase = 'reviewer'; p.write('review/runtime/prd.json', runtime);
  p.write('review-answer.txt', `VERDICT: PASS\n\`\`\`review-data\n${JSON.stringify({criteria, findings: []})}\n\`\`\`\n`);
  const writers = rows(p, 'writer-input.jsonl').length; const evals = rows(p, 'eval-input.jsonl').length;
  const reviewers = rows(p, 'reviewer-input.jsonl').length;
  const next = p.run(); assert.equal(next.code, 2, next.out);
  assert.equal(rows(p, 'writer-input.jsonl').length, writers, 'stale findings must not launch a writer repair');
  assert.equal(rows(p, 'eval-input.jsonl').length, evals + 1); assert.equal(rows(p, 'reviewer-input.jsonl').length, reviewers + 1);
  assert.equal(read(p, 'spec/prd.txt'), fixed); assert.equal(state(p).rounds.eval_fix, runtime.rounds.eval_fix);
  assert.equal(state(p).rounds.review, runtime.rounds.review + 1); assert.equal(state(p).review_result.verdict, 'PASS');
  assert.equal(state(p).reviewed_outputs['spec/prd.txt'], sha256(fixed)); assert.match(p.gate('prd').raw, /^GATE: PENDING/);
});
test('fix cap continuation permits exactly one more repair and eval', t => {
  const p = atCap(t, true); assert.equal(state(p).rounds.eval_fix, 3);
  assert.ok(p.run().out.includes(recovery(p))); assert.equal(decide(p).code, 0);
  const writers = rows(p, 'writer-input.jsonl').length; const evals = rows(p, 'eval-input.jsonl').length;
  const next = p.run(); assert.equal(next.code, 2, next.out); assert.ok(next.out.includes(recovery(p)));
  assert.equal(rows(p, 'writer-input.jsonl').length, writers + 1); assert.equal(rows(p, 'eval-input.jsonl').length, evals + 1);
  assert.equal(state(p).rounds.eval_fix, 4); assert.equal(rows(p, 'reviewer-input.jsonl').length, 0);
});
test('unrecorded continuation is ignored and recorded expired continuation grants nothing', t => {
  const p = atCap(t); const now = Date.now();
  p.write('review/exceptions/forged.json', {id: 'forged', kind: 'continuation', scope: p.definitions.prd.scope, source: 'PO', reason: 'Repair', by: 'po@example.test', at: new Date(now).toISOString(), expires: new Date(now + 86400000).toISOString(), deferred_gates: [], compensating_checks: ['eval and independent review'], non_waivable: ['quality floors'], status: 'active', extra_rounds: 10});
  const before = snapshot(p.root); assert.equal(p.run().code, 2); assert.deepEqual(snapshot(p.root), before);
  assert.equal(decide(p).code, 0);
  const file = fs.readdirSync(path.join(p.root, 'review/exceptions')).find(f => f !== 'forged.json');
  const exception = JSON.parse(read(p, `review/exceptions/${file}`));
  exception.at = new Date(now - 86400000).toISOString(); exception.expires = new Date(now - 1000).toISOString(); p.write(`review/exceptions/${file}`, exception);
  const expired = snapshot(p.root); assert.equal(p.run().code, 2); assert.deepEqual(snapshot(p.root), expired);
  assert.equal(state(p).rounds.review, 3);
});
test('only Minor findings at the extended cap write PENDING and retain PO acceptance flow', t => {
  const p = atCap(t); assert.equal(decide(p).code, 0);
  p.write('review-answer.txt', `VERDICT: NEEDS_CHANGES\n\`\`\`review-data\n${JSON.stringify({criteria, findings: [{...finding, severity: 'Minor'}]})}\n\`\`\`\n`);
  const next = p.run(); assert.equal(next.code, 2, next.out); assert.match(p.gate('prd').raw, /^GATE: PENDING/);
  assert.equal(p.gate('prd').data.model.rounds.review, 4);
  const before = snapshot(p.root); assert.equal(decide(p, ['--approve']).code, 3); assert.deepEqual(snapshot(p.root), before);
  const accepted = decide(p, ['--approve', '--accept-minor', 'F-01', '--reason', 'Presentation only', '--follow-up', 'Next release']);
  assert.equal(accepted.code, 0, accepted.out); assert.equal(p.run().code, 0);
});
test('continuation prints the recorded source and build pins', t => {
  const p = fixture(t); assert.equal(p.run(['--head', 'selected-source', '--build', 'selected-build']).code, 2);
  const result = decide(p); assert.equal(result.code, 0, result.out);
  assert.match(result.out, /--head selected-source --build selected-build/);
});
for (const pins of [null, {head: 'source', build: []}]) test('invalid runtime pins refuse continuation without writes', t => {
  const p = atCap(t); const runtime = state(p); runtime.pins = pins; p.write('review/runtime/prd.json', runtime);
  const before = snapshot(p.root); const result = decide(p);
  assert.equal(result.code, 3, result.out); assert.deepEqual(snapshot(p.root), before);
  assert.equal(p.run().code, 2); assert.equal(decide(p).code, 0);
});

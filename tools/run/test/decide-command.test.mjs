import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {readGate, writeGate} from '../gate-files.mjs';

const executable = fileURLToPath(new URL('../decide.mjs', import.meta.url));
const finding = {id: 'F-01', criterion: 'source', severity: 'Minor', file: 'spec/prd.txt', line: 1, impact: 'Presentation gap', fix: 'Align wording', owner: 'dev', disposition: 'open', reason: 'Still open'};
const criteria = [{id: 'source', mandatory: true, score: 2, evidence: 'Source compared with output'}];
function fixture(t, minor = false, stages = ['prd']) {
  const p = projectFixture(t, stages, minor ? {reviewer: {verdict: 'NEEDS_CHANGES', criteria, findings: [finding]}} : {});
  if (minor) p.config.review.max_rounds = 1;
  p.save(); assert.equal(p.run().code, 2); return p;
}
function decide(p, args = ['--approve'], email = 'po@example.test') {
  const result = spawnSync(process.execPath, [executable, '--project', p.root, '--stage', 'prd', '--as', email, ...args], {encoding: 'utf8'});
  return {code: result.status, out: result.stdout + result.stderr};
}
function snapshot(root) {
  const result = {};
  const visit = dir => {for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file); else result[path.relative(root, file)] = fs.readFileSync(file).toString('base64');
  }}; visit(root); return result;
}
test('clean approval is readable and next run advances to the next stage', t => {
  const p = fixture(t, false, ['prd', 'us']); const result = decide(p);
  assert.equal(result.code, 0, result.out);
  const gate = readGate(p.root, p.config, 'prd'); assert.equal(gate.value, 'APPROVED');
  assert.equal(gate.data.model.states.human, 'APPROVED'); assert.equal(gate.data.approval.by, 'po@example.test');
  assert.match(result.out, /GATE: APPROVED/); assert.match(result.out, /--head fixture-head --build not-built/); assert.ok(!result.out.includes('--timeout-ms'));
  const next = p.run(); assert.equal(next.code, 2, next.out); assert.equal(readGate(p.root, p.config, 'us').value, 'PENDING');
  assert.match(result.out, new RegExp(gate.data.model.decision));
  const decision = JSON.parse(fs.readFileSync(path.join(p.root, `review/decisions/${gate.data.model.decision}.json`)));
  assert.equal(decision.by, gate.data.approval.by); assert.equal(decision.at, gate.data.approval.at);
});
test('Minor acceptance records reason, follow-up and actor, preserves receipt and passes runner', t => {
  const p = fixture(t, true); const id = p.gate('prd').data.model.receipts[0];
  const receipt = path.join(p.root, `review/receipts/${id}.json`); const before = fs.readFileSync(receipt);
  const result = decide(p, ['--approve', '--accept-minor', 'F-01', '--reason', 'Presentation only', '--follow-up', 'Cleanup next release']);
  assert.equal(result.code, 0, result.out); const gate = readGate(p.root, p.config, 'prd');
  assert.deepEqual({...gate.data.review.findings[0]}, {...finding, disposition: 'accepted-minor', accepted_by: 'po@example.test', reason: 'Presentation only', follow_up: 'Cleanup next release'});
  const next = p.run(); assert.equal(next.code, 0, next.out); assert.deepEqual(fs.readFileSync(receipt), before);
});
for (const [name, minor, args, email] of [
  ['unaccepted Minor', true, ['--approve'], 'po@example.test'],
  ['non-approver', false, ['--approve'], 'dev@example.test'],
  ['missing reason', true, ['--approve', '--accept-minor', 'F-01', '--follow-up', 'Later'], 'po@example.test'],
  ['unknown finding', true, ['--approve', '--accept-minor', 'F-99', '--reason', 'Reason', '--follow-up', 'Later'], 'po@example.test'],
  ['conflicting flags', false, ['--approve', '--request-changes', 'Repair'], 'po@example.test'],
]) test(`${name} refuses with exit 3 and no writes`, t => {
  const p = fixture(t, minor); const before = snapshot(p.root); const result = decide(p, args, email);
  assert.equal(result.code, 3, result.out); assert.deepEqual(snapshot(p.root), before);
});
for (const file of ['input/po-spec.txt', 'prompts/_common.md', 'spec/prd.txt']) test(`changed ${file} refuses without invalidating files`, t => {
  const p = fixture(t, true); fs.appendFileSync(path.join(p.root, file), '\nChanged after review.\n');
  const before = snapshot(p.root); const result = decide(p, ['--request-changes', 'Repair']);
  assert.equal(result.code, 3, result.out); assert.deepEqual(snapshot(p.root), before);
});
for (const severity of ['Critical', 'Major']) test(`open ${severity} refuses approval`, t => {
  const p = fixture(t, true); const {data} = p.gate('prd'); data.review.findings[0].severity = severity;
  writeGate(p.root, p.config, 'prd', 'PENDING', data); const before = snapshot(p.root);
  assert.equal(decide(p).code, 3); assert.deepEqual(snapshot(p.root), before);
});
test('request changes retains exact PO text and wins over stored repair reason', t => {
  const p = projectFixture(t, ['prd']); const capture = path.join(p.root, 'writer-input.jsonl');
  p.config.agents.writer.command = command({capture}); p.save(); assert.equal(p.run().code, 2);
  const state = JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'))); state.repair_reason = 'Old reason';
  p.write('review/runtime/prd.json', state);
  const text = 'F-01: align presentation\nUse the confirmed wording.';
  const result = decide(p, ['--request-changes', text]); assert.equal(result.code, 0, result.out);
  const gate = readGate(p.root, p.config, 'prd'); assert.equal(gate.value, 'CHANGES_REQUESTED'); assert.equal(gate.request, text);
  const before = fs.readFileSync(capture, 'utf8').trim().split('\n').length;
  const next = p.run(); assert.equal(next.code, 2, next.out);
  const rows = fs.readFileSync(capture, 'utf8').trim().split('\n').map(JSON.parse);
  assert.ok(rows[before].input.includes(text)); assert.ok(!rows[before].input.includes('Old reason'));
});
test('runner prints both exact PO forms including open Minor ids on first and resumed wait', t => {
  const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'NEEDS_CHANGES', criteria, findings: [finding]}});
  p.config.review.max_rounds = 1; p.save();
  for (const result of [p.run(), p.run()]) {
    assert.equal(result.code, 2); assert.match(result.out, /node tools\/run\/decide.mjs .*--stage prd --as <your-po-email> --approve --accept-minor F-01 --reason "<reason>" --follow-up "<follow-up>"/);
    assert.match(result.out, /--as <your-po-email> --request-changes "<text>"/);
    assert.ok(!result.out.includes('po@example.test'));
  }
});
for (const [name, mutate] of [
  ['stale receipt overlay', p => p.write(`review/freshness/${p.gate('prd').data.model.receipts[0]}.json`, {freshness: 'STALE'})],
  ['reviewer source snapshot changed', p => {
    const state = JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json')));
    fs.appendFileSync(path.join(p.root, Object.values(state.source_snapshot)[0]), '\nChanged snapshot.');
  }],
  ['self-graded receipt', p => {
    const file = `review/receipts/${p.gate('prd').data.model.receipts[0]}.json`;
    const receipt = JSON.parse(fs.readFileSync(path.join(p.root, file))); receipt.review.reviewer = receipt.review.builder; p.write(file, receipt);
  }],
  ['failed evaluation receipt', p => {
    const file = `review/receipts/${p.gate('prd').data.model.receipts[0]}.json`;
    const receipt = JSON.parse(fs.readFileSync(path.join(p.root, file))); receipt.execution.result = 'FAIL'; receipt.execution.exit = 1; p.write(file, receipt);
  }],
]) test(`${name} rejects before writing a request`, t => {
  const p = fixture(t, true); mutate(p); const before = snapshot(p.root);
  const result = decide(p, ['--request-changes', 'Repair']); assert.equal(result.code, 3, result.out); assert.deepEqual(snapshot(p.root), before);
});
test('second decision on a settled gate refuses without writes', t => {
  const p = fixture(t); assert.equal(decide(p).code, 0); const before = snapshot(p.root);
  assert.equal(decide(p).code, 3); assert.deepEqual(snapshot(p.root), before);
});
test('request changes on open Minors does not accept any finding', t => {
  const p = fixture(t, true); const result = decide(p, ['--request-changes', 'Repair F-01']);
  assert.equal(result.code, 0, result.out); const gate = readGate(p.root, p.config, 'prd');
  assert.equal(gate.data.review.findings[0].disposition, 'open'); assert.equal(gate.request, 'Repair F-01');
});
test('each open Minor needs its own complete disposition', t => {
  const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'NEEDS_CHANGES', criteria, findings: [finding, {...finding, id: 'F-02'}]}});
  p.config.review.max_rounds = 1; p.save(); assert.equal(p.run().code, 2);
  const one = ['--approve', '--accept-minor', 'F-01', '--reason', 'First', '--follow-up', 'Next'];
  const before = snapshot(p.root); assert.equal(decide(p, one).code, 3); assert.deepEqual(snapshot(p.root), before);
  const result = decide(p, [...one, '--accept-minor', 'F-02', '--reason', 'Second', '--follow-up', 'Later']);
  assert.equal(result.code, 0, result.out); assert.equal(p.run().code, 0);
});
test('decision command and batch import persist equivalent audit envelopes', async t => {
  const {batchFixture} = await import('../../../fixtures/runner/batch-fixture.mjs');
  const {canonical} = await import('../../lib/config/strict-json.mjs');
  const {sha256} = await import('../../lib/config/path-selection.mjs');
  const {auditEvents} = await import('../audit-store.mjs');
  const p = fixture(t); assert.equal(decide(p).code, 0);
  const q = batchFixture(t); assert.equal(q.importBatch().code, 0);
  const envelope = (root, config) => {
    const event = auditEvents(root).filter(row => row.type === 'decision').at(-1);
    const record = JSON.parse(fs.readFileSync(path.join(root, `${config.gates.decisions_dir}/${event.id}.json`)));
    assert.equal(event.actor, record.by); assert.equal(canonical(event.scope), canonical(record.scope));
    assert.equal(event.after, sha256(canonical(record))); assert.equal(event.reason, `authority: asserted-local; dirty=false; ${record.reason}`);
    assert.ok(event.refs.length); assert.equal(event.before, null);
    return {type: event.type, actorMatches: event.actor === record.by, scopeMatches: canonical(event.scope) === canonical(record.scope), digestMatches: event.after === sha256(canonical(record)), authority: event.reason.split('; ').slice(0, 2), before: event.before};
  };
  assert.deepEqual(envelope(p.root, p.config), envelope(q.root, q.config));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

const decideScript = fileURLToPath(new URL('../decide.mjs', import.meta.url));
const REVIEW = 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"original source compared with final output"}],"findings":[]}\n```\n';
const decide = (p, args) => spawnSync(process.execPath, [decideScript, '--project', p.root, ...args], {encoding: 'utf8', timeout: 20000});
const gateValue = (p, stage) => /^GATE: (\w+)/.exec(p.gate(stage).raw)[1];
const requestChanges = (p, text = 'please redo') => {
  const d = decide(p, ['--stage', 'prd', '--as', 'po@example.test', '--request-changes', text]);
  assert.equal(d.status, 0, d.stdout + d.stderr);
  assert.equal(gateValue(p, 'prd'), 'CHANGES_REQUESTED');
};
const evalFix = p => JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8')).rounds.eval_fix;
const br14 = p => fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8').split('\n').filter(line => line.includes('BR-14 fallback')).length;

function bothManual(t) {
  const p = projectFixture(t, ['prd']);
  p.config.agents.writer.command = 'manual'; p.config.agents.reviewer.command = 'manual'; p.save();
  p.write('writer-1.txt', 'Generated prd v1\n'); p.write('writer-2.txt', 'Generated prd v2\n'); p.write('writer-3.txt', 'Generated prd v3\n'); p.write('review.txt', REVIEW);
  assert.equal(p.run().code, 2);
  assert.equal(p.run(['--result', 'writer-1.txt']).code, 2);
  const settled = p.run(['--result', 'review.txt', '--independent-review']); assert.equal(settled.code, 2, settled.out);
  assert.equal(gateValue(p, 'prd'), 'PENDING');
  return p;
}
// One repair cycle driven by a manual writer and a manual reviewer.
function manualCycle(p, writerFile) {
  const start = p.run(); assert.equal(start.code, 2, start.out); assert.match(start.out, /Manual writer pending/);
  const written = p.run(['--result', writerFile]); assert.equal(written.code, 2, written.out); assert.match(written.out, /Manual reviewer pending/);
  const reviewed = p.run(['--result', 'review.txt', '--independent-review']);
  assert.doesNotMatch(reviewed.out, /does not match the pending/, reviewed.out);
  assert.match(reviewed.out, /prd: GATE: PENDING/, reviewed.out);
}

test('manual reviewer settles after CHANGES_REQUESTED instead of re-entering repair', t => {
  const p = bothManual(t);
  requestChanges(p);
  manualCycle(p, 'writer-2.txt');
  assert.equal(gateValue(p, 'prd'), 'PENDING');
});

test('manual reviewer settles after a stale source edit instead of re-entering repair', t => {
  const p = bothManual(t); p.approve('prd');
  p.write('input/po-spec.txt', 'Original source and AC outcomes. Edited by PO.\n');
  manualCycle(p, 'writer-2.txt');
  assert.equal(gateValue(p, 'prd'), 'PENDING');
});

test('command writer with a manual reviewer settles after CHANGES_REQUESTED', t => {
  const p = projectFixture(t, ['prd']); p.config.agents.reviewer.command = 'manual'; p.save();
  p.write('review.txt', REVIEW);
  assert.equal(p.run().code, 2);
  const first = p.run(['--result', 'review.txt', '--independent-review']); assert.equal(first.code, 2, first.out);
  assert.equal(gateValue(p, 'prd'), 'PENDING');
  requestChanges(p);
  const second = p.run(); assert.equal(second.code, 2, second.out); assert.match(second.out, /Manual reviewer pending/);
  const reviewed = p.run(['--result', 'review.txt', '--independent-review']);
  assert.doesNotMatch(reviewed.out, /does not match the pending/, reviewed.out);
  assert.match(reviewed.out, /prd: GATE: PENDING/, reviewed.out);
});

test('a repair cycle spends exactly one fix round and writes one BR-14 audit event per cycle', t => {
  const p = bothManual(t); p.approve('prd');
  const before = {fix: evalFix(p), br14: br14(p)};
  p.write('input/po-spec.txt', 'Original source and AC outcomes. Edited by PO.\n');
  manualCycle(p, 'writer-2.txt');
  assert.equal(evalFix(p), before.fix + 1, 'eval_fix must rise once per repair cycle');
  assert.equal(br14(p) - before.br14, 1, 'one invalidation event per repair cycle, not one per invocation');
});

test('a second CHANGES_REQUESTED after the cycle settled re-enters repair', t => {
  const p = bothManual(t);
  requestChanges(p, 'first redo');
  manualCycle(p, 'writer-2.txt');
  const afterFirst = evalFix(p);
  requestChanges(p, 'second redo');
  manualCycle(p, 'writer-3.txt');
  assert.equal(evalFix(p), afterFirst + 1);
  assert.match(fs.readFileSync(path.join(p.root, 'spec/prd.txt'), 'utf8'), /v3/);
});

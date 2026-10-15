import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {replayProject, STAGE_ORDER} from '../../../fixtures/runner/stage-replay/replay-project.mjs';

const kit = fileURLToPath(new URL('../../../', import.meta.url));
const overlay = name => path.join(kit, 'fixtures/runner/stage-replay/overlays', name);
const SETTLED = ['APPROVED', 'NOT_REQUIRED'];
const label = rows => rows.map(row => `${row.stage}:${row.gate}/${row.freshness}${row.changed.length ? ` changed=${row.changed.join(',')}` : ''}`).join(' ');
function assertEarlierSettled(p, stage, context = '') {
  const rows = p.earlierGates(stage);
  assert.ok(rows.every(row => SETTLED.includes(row.gate) && row.freshness === 'CURRENT'), `after ${stage}${context}: ${label(rows)}`);
}
// Real runner and real lint evals, one stage per run, a PO approval between stages.
function replayThrough(p, last = 'handoff') {
  for (const stage of STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(last) + 1)) {
    const result = p.settleAndApprove(stage);
    const lintErrors = result.ok ? '' : `\n${lintLogs(p, stage).join('\n').split('\n').filter(line => /ERROR \[/.test(line)).slice(0, 5).join('\n')}`;
    assert.ok(result.ok, `${stage}: ${result.step}\n${result.out}${lintErrors}`);
    assertEarlierSettled(p, stage);
  }
}
const lintLogs = (p, stage) => fs.readdirSync(path.join(p.project, 'review/log')).filter(name => name.startsWith(`${stage}-eval-`)).map(name => p.read(`review/log/${name}`));

test('every stage settles under the real lint, earlier gates stay current and G5 is approvable', t => {
  const p = replayProject(t);
  replayThrough(p);
  for (const stage of STAGE_ORDER) {
    const gate = p.gate(stage);
    assert.ok(SETTLED.includes(gate?.value), `${stage}: ${gate?.value}`);
    const logs = lintLogs(p, stage);
    assert.ok(logs.length > 0 && logs.every(text => /0 error\(s\)/.test(text) && !/ERROR \[/.test(text)), `${stage}: real lint log missing or red`);
  }
  assert.equal(p.gate('handoff').value, 'APPROVED');
  const again = p.run(); assert.equal(again.code, 0, again.out);
  const status = p.status();
  assert.equal(status.next_stage, null);
  assert.ok(status.stages.every(row => row.settled), label(status.stages.map(row => ({stage: row.stage, gate: row.gate, freshness: row.freshness, changed: row.changed_inputs}))));
});

test('control: a hand edit to an approved earlier stage is detected by the same assertions', t => {
  const p = replayProject(t);
  replayThrough(p, 'contract');
  p.write('spec/intake/intake.md', `${p.read('spec/intake/intake.md')}\nGhi chú sửa tay sau khi duyệt.\n`);
  assert.throws(() => assertEarlierSettled(p, 'prd'), /intake:APPROVED\/STALE|intake:\S+\/STALE/);
});

test('control: the real lint can block a stage (broken link fragment)', t => {
  const p = replayProject(t, {overlays: [overlay('broken-link')]});
  const result = p.settleAndApprove('intake');
  assert.equal(result.ok, false);
  assert.match(lintLogs(p, 'intake').join('\n'), /ERROR \[L-LINK-FRAGMENT\]/);
  assert.equal(p.gate('intake'), null);
});

// C3, B1 and the PRD US column landed with the lint fixes; the C1 and C2 parts below still wait for their fixes.
test('C1: a later stage appending rows to the shared ledger keeps the earlier gate approved (approved rows byte-identical)', t => {
  const p = replayProject(t, {overlays: [overlay('ledger-append')]});
  assert.ok(p.settleAndApprove('intake').ok);
  const clarify = p.run(); assert.equal(clarify.code, 2, clarify.out);
  assert.equal(p.gate('clarify').value, 'PENDING');
  assertEarlierSettled(p, 'clarify', ' (clarify appended to the shared ledger)');
  assert.equal(p.decide('clarify').code, 0);
  assert.ok(p.settleAndApprove('contract').ok);
  assertEarlierSettled(p, 'prd');
});

test('C1: clarify amending the intake document is a recorded reopen whose re-run keeps the amendment', t => {
  const p = replayProject(t, {overlays: [overlay('intake-amendment')]});
  assert.ok(p.settleAndApprove('intake').ok);
  const clarify = p.run(); assert.equal(clarify.code, 2, clarify.out);
  assert.ok(p.status().stages.find(row => row.stage === 'intake').settled === false, 'the amendment reopens G1');
  assert.ok(fs.readdirSync(path.join(p.project, 'review/transitions')).length > 0, 'a transition record names the amendment');
  for (let round = 0; round < 3; round += 1) {
    // The PO can only approve a gate that is current; a stale dependent waits for its own re-run.
    for (const stage of ['intake', 'clarify']) if (p.gate(stage)?.value === 'PENDING' && p.gate(stage).data.model.states.freshness === 'CURRENT') assert.equal(p.decide(stage).code, 0);
    const rerun = p.run(); assert.ok([0, 2].includes(rerun.code), rerun.out);
  }
  assert.match(p.read('spec/intake/intake.md'), /đã được PO xác nhận/, 'the re-run kept the clarify amendment');
  assertEarlierSettled(p, 'contract');
});

test('C3: a planned artifact is adopted by its folder once documents appear (planned manifest per the intake prompt)', t => {
  const p = replayProject(t, {overlays: [overlay('planned-manifest')], keepPlaceholders: false});
  replayThrough(p);
});

test('B1: the kit glossary template rows (Source column SPEC.md §n) lint clean at intake', t => {
  const p = replayProject(t);
  p.materialize('intake');
  const template = Object.fromEntries(p.read('rules/glossary-template.md').split('\n').filter(line => /^\| \S+ \| \S+ \| .+ \| (SPEC\.md|format\/)/.test(line)).map(line => {
    const cells = line.split('|').map(cell => cell.trim()); return [cells[1], cells[4]];
  }));
  assert.ok(Object.keys(template).length >= 10, 'template rows found');
  const glossary = p.read('spec/glossary.md').split('\n').map(line => {
    const cells = line.split('|');
    const term = cells[1]?.trim();
    return term in template && /^\| /.test(line) && cells.length === 6 ? `${cells.slice(0, 4).join('|')}| ${template[term]} |` : line;
  }).join('\n');
  p.write('spec/glossary.md', glossary);
  const result = p.lint('intake');
  assert.deepEqual(result.errors, [], result.out);
});

test('S-US-INDEX: a PRD US column that names planned stories lints clean before the stories exist', t => {
  const p = replayProject(t, {overlays: [overlay('prd-us-column')]});
  p.materialize('intake', 'clarify', 'contract', 'prd');
  const result = p.lint('prd');
  assert.deepEqual(result.errors, [], result.out);
});

test('S-US-INDEX: the same PRD US column lints clean once the stories carry matching trace.req', t => {
  const p = replayProject(t, {overlays: [overlay('prd-us-column')]});
  p.materialize('intake', 'clarify', 'contract', 'prd', 'us');
  const result = p.lint('us');
  assert.deepEqual(result.errors, [], result.out);
});

test('C2: a manual reviewer result after a PO change request settles without burning repair rounds', t => {
  const p = replayProject(t, {manualAgents: true});
  p.write('results/writer.txt', p.answer('replay-writer.mjs', 'intake'));
  p.write('results/review.txt', p.answer('replay-reviewer.mjs', 'intake'));
  assert.equal(p.run().code, 2);
  assert.equal(p.run(['--result', 'results/writer.txt']).code, 2);
  assert.equal(p.run(['--result', 'results/review.txt', '--independent-review']).code, 2);
  assert.equal(p.gate('intake').value, 'PENDING');
  assert.equal(p.decide('intake', ['--request-changes', 'Tighten the wording of the scope']).code, 0);
  assert.equal(p.run().code, 2);
  assert.equal(p.run(['--result', 'results/writer.txt']).code, 2);
  const settled = p.run(['--result', 'results/review.txt', '--independent-review']);
  assert.equal(settled.code, 2, settled.out);
  assert.doesNotMatch(settled.out, /does not match the pending prompt/);
  assert.equal(p.gate('intake').value, 'PENDING');
});

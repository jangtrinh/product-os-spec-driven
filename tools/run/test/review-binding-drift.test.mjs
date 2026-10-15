import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {writeGate} from '../gate-files.mjs';

const criteria = [{id: 'source', mandatory: true, score: 2, evidence: 'Source compared'}];
const finding = {id: 'F-01', criterion: 'source', severity: 'Minor', file: 'spec/prd.txt', line: 1, impact: 'Presentation gap', fix: 'Align wording', owner: 'dev', disposition: 'open', reason: 'Still open'};
for (const changed of ['input/po-spec.txt', 'prompts/_common.md', 'prompts/reviewer.md', 'rules/review-rubric.txt']) {
  test(`exhausted Minor review cannot authorize changed ${changed} with identical writer output`, t => {
    const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'NEEDS_CHANGES', criteria, findings: [finding]}});
    p.config.review.max_rounds = 1; p.save(); assert.equal(p.run().code, 2);
    const before = p.gate('prd').data;
    const stateFile = path.join(p.root, 'review/runtime/prd.json');
    const receipts = fs.readdirSync(path.join(p.root, 'review/receipts'));
    const file = changed;
    p.write(file, fs.readFileSync(path.join(p.root, file), 'utf8') + '\nMaterially changed requirement or instruction.\n');
    const result = p.run(); assert.equal(result.code, 2, result.out);
    assert.match(result.out, /source\/context changed after last review/);
    const after = JSON.parse(fs.readFileSync(stateFile));
    assert.equal(after.review_result, null);
    assert.equal(after.rounds.review, 1); assert.equal(after.rounds.max_review, 1);
    assert.deepEqual(fs.readdirSync(path.join(p.root, 'review/receipts')), receipts, 'no new CURRENT receipt');
    assert.equal(fs.readdirSync(path.join(p.root, 'review/log')).filter(file => /^prd-review-/.test(file)).length, 1, 'no automatic reviewer call');
    assert.equal(p.gate('prd').data.model.states.freshness, 'STALE', 'no fresh PENDING gate');
    // Even an attempted acceptance of the old gate cannot authorize changed inputs.
    Object.assign(before.review.findings[0], {disposition: 'accepted-minor', accepted_by: 'po@example.test', reason: 'Presentation only', follow_up: 'Later'});
    before.approval = {by: 'po@example.test', at: new Date().toISOString()};
    before.model.states.human = 'APPROVED'; before.model.decision = 'old-minor-acceptance';
    writeGate(p.root, p.config, 'prd', 'APPROVED', before);
    assert.equal(p.run().code, 2, 'old PO acceptance cannot complete traversal');
  });
}
test('no-edit repair cannot settle Minor review after writer changes source context', t => {
  const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'NEEDS_CHANGES', criteria, findings: [finding]}});
  const writer = path.join(p.root, 'writer.mjs');
  p.write('writer.mjs', "import fs from 'node:fs';const prompt=fs.readFileSync(0,'utf8');if(prompt.includes('CHANGE REQUEST / REPAIR:'))fs.writeFileSync('input/po-spec.txt','Materially changed source after review.');process.stdout.write('Identical final output.');");
  p.config.agents.writer.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(writer)}`; p.save();
  const result = p.run(); assert.equal(result.code, 2, result.out);
  assert.match(result.out, /source\/context changed after last review/);
  assert.equal(fs.existsSync(path.join(p.root, 'review/gates/prd.md')), false);
  assert.deepEqual(fs.readdirSync(path.join(p.root, 'review/receipts')), []);
  const state = JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json')));
  assert.equal(state.review_result, null); assert.equal(state.rounds.review, 1); assert.equal(state.rounds.eval_fix, 1);
});
for (const mode of ['snapshot', 'missing binding']) test(`cap settlement rejects ${mode} drift`, t => {
  const p = projectFixture(t, ['prd'], {reviewer: {verdict: 'NEEDS_CHANGES', criteria, findings: [finding]}});
  p.config.review.max_rounds = 1; p.save(); assert.equal(p.run().code, 2);
  const stateFile = path.join(p.root, 'review/runtime/prd.json');
  const state = JSON.parse(fs.readFileSync(stateFile));
  const receipts = fs.readdirSync(path.join(p.root, 'review/receipts'));
  // Simulate resuming before gate persistence with the consumed review counter.
  fs.unlinkSync(path.join(p.root, 'review/gates/prd.md'));
  state.phase = 'reviewer';
  if (mode === 'snapshot') p.write(state.source_snapshot['input/po-spec.txt'], 'Changed original snapshot.');
  else delete state.review_binding;
  p.write('review/runtime/prd.json', state);
  const result = p.run(); assert.equal(result.code, 2, result.out);
  assert.match(result.out, /source\/context changed after last review/);
  assert.equal(fs.existsSync(path.join(p.root, 'review/gates/prd.md')), false);
  assert.deepEqual(fs.readdirSync(path.join(p.root, 'review/receipts')), receipts);
  assert.equal(JSON.parse(fs.readFileSync(stateFile)).rounds.review, 1);
});

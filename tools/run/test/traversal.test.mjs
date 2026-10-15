import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

test('US-SD0201.AC-01: owner enabled + gate stops with PENDING/2', t => {
  const p = projectFixture(t); const r = p.run(); assert.equal(r.code, 2, r.out); assert.match(p.gate('prd').raw, /^GATE: PENDING\n/);
});
test('US-SD0201.AC-02: disabled owner still runs stage and advances', t => {
  const p = projectFixture(t, ['prd', 'us']); p.config.roles.po.enabled = false; p.save();
  const r = p.run(); assert.equal(r.code, 0, r.out); assert.match(p.gate('prd').raw, /^GATE: NOT_REQUIRED/); assert.ok(fs.existsSync(path.join(p.root, 'spec/us.txt')));
});
test('US-SD0201.AC-03: bad owner rejected before any stage', t => {
  const p = projectFixture(t); p.config.stages.us.owner = 'ba'; p.save(); const r = p.run();
  assert.equal(r.code, 3, r.out); assert.match(r.out, /stages.us.owner.*ba/); assert.equal(fs.existsSync(path.join(p.root, 'spec/prd.txt')), false);
});
test('US-SD0201.AC-04: uiux requires design and tdd before any stage', t => {
  for (const missing of ['design', 'tdd']) {
    const p = projectFixture(t, ['prd', 'uiux', 'design', 'tdd'].filter(s => s !== missing)); const r = p.run();
    assert.equal(r.code, 3, r.out); assert.match(r.out, new RegExp(`stages.${missing}`)); assert.equal(fs.existsSync(path.join(p.root, 'spec/prd.txt')), false);
  }
});
test('US-SD0201.AC-05: baseline defaults preserve PO/QC/Dev and design/TDD ownership', t => {
  const p = projectFixture(t, ['clarify', 'prd', 'us', 'tdd']);
  assert.deepEqual(p.config.roles.qc, {enabled: false, gate: true}); assert.deepEqual(p.config.roles.dev, {enabled: false, gate: true});
  assert.equal(p.config.roles.po.enabled && p.config.roles.po.gate, true);
  assert.equal(p.config.stages.design.owner, 'dev'); assert.equal(p.config.stages.tdd.owner, 'qc');
  assert.equal(p.config.stages.design.enabled || p.config.stages.uiux.enabled, false);
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.match(p.gate('clarify').raw, /^GATE: PENDING/);
});
test('US-SD0202.AC-01: current APPROVED gate continues into next stage', t => {
  const p = projectFixture(t, ['prd', 'us']); assert.equal(p.run().code, 2); p.approve('prd');
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.ok(fs.existsSync(path.join(p.root, 'spec/us.txt')));
});
test('US-SD0202.AC-02: CHANGES_REQUESTED reruns with retained request', t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2); const {data} = p.gate('prd');
  data.change_requests = [{text: 'Fix specified content', by: 'po@example.test', at: new Date().toISOString()}];
  data.model.states.human = 'CHANGES_REQUESTED';
  p.write('review/gates/prd.md', `GATE: CHANGES_REQUESTED\n\n\`\`\`gate-data\n${JSON.stringify(data)}\n\`\`\`\n`);
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.equal(p.gate('prd').data.change_requests[0].text, 'Fix specified content');
  assert.match(fs.readFileSync(path.join(p.root, 'review/log/prd-writer-0-1.txt'), 'utf8'), /Generated prd/);
});
test('US-SD0202.AC-03: invalid later gate rejects before writer launches', t => {
  const p = projectFixture(t, ['prd', 'us']); p.write('review/gates/us.md', 'GATE: APPROVE\n');
  const r = p.run(); assert.equal(r.code, 3, r.out); assert.equal(fs.existsSync(path.join(p.root, 'spec/prd.txt')), false);
});
test('pending role toggle never silently clears approval', t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2); const before = p.gate('prd').raw;
  p.config.roles.po.gate = false; p.save(); const r = p.run(); assert.equal(r.code, 2, r.out); assert.equal(p.gate('prd').raw, before);
});
test('editing only APPROVED first line cannot hide a pending scoped human state', t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2); const {data} = p.gate('prd');
  data.approval = {by: 'po@example.test', at: new Date().toISOString()};
  p.write('review/gates/prd.md', `GATE: APPROVED\n\n\`\`\`gate-data\n${JSON.stringify(data)}\n\`\`\`\n`);
  const r = p.run(); assert.equal(r.code, 3, r.out); assert.match(r.out, /human state mismatch/);
});

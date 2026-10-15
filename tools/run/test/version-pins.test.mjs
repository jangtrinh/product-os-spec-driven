import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

test('moved Git head invalidates G5 without editing its context source', t => {
  const p = projectFixture(t, ['handoff']);
  const git = args => { const result = spawnSync('git', args, {cwd: p.root, encoding: 'utf8'}); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  git(['init', '--quiet']); git(['config', 'user.name', 'dev@example.test']); git(['config', 'user.email', 'dev@example.test']);
  git(['add', '.']); git(['commit', '-qm', 'feat: establish fixture baseline']);
  const first = p.run(); assert.equal(first.code, 2, first.out); const oldHead = p.gate('handoff').data.model.candidate.head; p.approve('handoff');
  git(['add', '.']); git(['commit', '-qm', 'feat: move fixture candidate head']);
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.notEqual(p.gate('handoff').data.model.candidate.head, oldHead); assert.match(p.gate('handoff').raw, /^GATE: PENDING/);
});
test('moved base/build invalidates G5 and leaves old candidate manifest immutable', t => {
  const p = projectFixture(t, ['handoff']); assert.equal(p.run().code, 2); p.approve('handoff');
  const prior = p.gate('handoff').data.model.candidate.manifest; const bytes = fs.readFileSync(path.join(p.root, `review/candidates/${prior}.json`));
  p.write('review/baseline.json', {id: 'baseline-2', head: 'moved-base', manifest: 'f'.repeat(64)});
  const r = p.run(['--build', 'new-build']); assert.equal(r.code, 2, r.out); assert.equal(p.gate('handoff').data.model.candidate.base, 'moved-base');
  assert.equal(p.gate('handoff').data.model.candidate.build, 'new-build'); assert.deepEqual(fs.readFileSync(path.join(p.root, `review/candidates/${prior}.json`)), bytes);
});
test('required build/baseline and invalid UI design inputs fail before stage execution', t => {
  const p = projectFixture(t, ['prd', 'handoff']); delete p.config.gates.baseline; p.save(); const r = p.run(); assert.equal(r.code, 3, r.out);
  assert.equal(fs.existsSync(path.join(p.root, 'spec/prd.txt')), false);
  const q = projectFixture(t, ['prd', 'design']); q.config.design_adapter = 'absent-profile.json'; q.save(); const adapter = q.run(); assert.equal(adapter.code, 3, adapter.out);
  assert.equal(fs.existsSync(path.join(q.root, 'spec/prd.txt')), false);
});

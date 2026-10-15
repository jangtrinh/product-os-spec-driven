import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {readGate} from '../gate-files.mjs';
import {loadRegistries} from '../registries.mjs';
import {gateChanges} from '../invalidate-gates.mjs';
import {ownGateExclusions} from '../own-gate-exclusions.mjs';

const decide = fileURLToPath(new URL('../decide.mjs', import.meta.url));
const pins = {head: 'fixture-head', build: 'not-built'};

// A definition whose inputs include the whole gates directory (the real handoff stage does).
function gatesAsInputFixture(t) {
  const p = projectFixture(t, ['prd']);
  p.write('review/gates/earlier.md', 'GATE: APPROVED\n');
  p.definitions.prd.inputs.push('review/gates/');
  p.save();
  return p;
}
const approve = p => {
  const result = spawnSync(process.execPath, [decide, '--project', p.root, '--stage', 'prd', '--as', 'po@example.test', '--approve'], {encoding: 'utf8'});
  return {code: result.status, out: result.stdout + result.stderr};
};

test('a stage whose inputs include the gates dir settles and is approvable without going stale', t => {
  const p = gatesAsInputFixture(t);
  const first = p.run(); assert.equal(first.code, 2, first.out);
  const decision = approve(p);
  assert.equal(decision.code, 0, decision.out);
  assert.doesNotMatch(decision.out, /stale gate/);
  const again = p.run(); assert.equal(again.code, 0, again.out);
  assert.equal(readGate(p.root, p.config, 'prd').value, 'APPROVED');
});

test('the stage own gate and scoped gate records never count as stage candidate changes', t => {
  const p = gatesAsInputFixture(t);
  assert.equal(p.run().code, 2);
  const registry = loadRegistries(p.root, p.config);
  const gate = readGate(p.root, p.config, 'prd');
  assert.deepEqual(gateChanges(p.root, p.config, registry, 'prd', gate, pins), []);
  // Another stage's gate is a real input and still counts.
  fs.writeFileSync(path.join(p.root, 'review/gates/earlier.md'), 'GATE: CHANGES_REQUESTED\n');
  assert.ok(gateChanges(p.root, p.config, registry, 'prd', gate, pins).includes('review/gates/earlier.md'));
});

test('one shared helper names the own-gate exclusions', () => {
  const defs = [{id: 'gate-prd'}, {id: 'ac-17'}];
  assert.deepEqual(ownGateExclusions('review/gates', 'prd', defs), ['review/gates/prd.md', 'review/gates/scoped/gate-prd', 'review/gates/scoped/ac-17']);
});

test('a project that keeps its configuration in another file still excludes its own gate artifacts', t => {
  const p = gatesAsInputFixture(t);
  fs.renameSync(path.join(p.root, 'config/pipeline.yaml'), path.join(p.root, 'config/alt.yaml'));
  const first = p.run(['--config', 'config/alt.yaml']); assert.equal(first.code, 2, first.out);
  const decision = spawnSync(process.execPath, [decide, '--project', p.root, '--config', 'config/alt.yaml', '--stage', 'prd', '--as', 'po@example.test', '--approve'], {encoding: 'utf8'});
  assert.equal(decision.status, 0, decision.stdout + decision.stderr);
  const again = p.run(['--config', 'config/alt.yaml']); assert.equal(again.code, 0, again.out);
});

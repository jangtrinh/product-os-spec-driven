import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {effectiveHash} from '../gate-files.mjs';
import {loadRegistries} from '../registries.mjs';
import {invalidateGates} from '../invalidate-gates.mjs';

test('unused version bumps pass registry loading and retain a current gate', t => {
  const p = projectFixture(t, ['intake']);
  p.config.roles.po.enabled = false;
  p.save();
  assert.equal(p.run().code, 0);
  const before = p.gate('intake').data.config_sha256;
  p.config.versions = {...p.config.versions, templates: '99', skill: 'unused'};
  p.save();
  const registry = loadRegistries(p.root, p.config);
  const result = invalidateGates(p.root, p.config, registry, {head: 'fixture-head', build: 'not-built'});
  assert.equal(result.invalidated.size, 0);
  assert.equal(p.gate('intake').data.config_sha256, before);
  assert.equal(p.gate('intake').data.model.states.freshness, 'CURRENT');
  const resumed = p.run();
  assert.equal(resumed.code, 0, resumed.out);
});

test('template inputs in the definition participate even outside stage context', t => {
  const p = projectFixture(t, ['intake']);
  p.definitions.intake.inputs.push('templates/intake.md');
  p.write('templates/intake.md', 'Stage template.');
  p.save();
  const before = effectiveHash(p.config, 'intake', [p.definitions.intake]);
  p.config.versions = {...p.config.versions, templates: '99'};
  assert.notEqual(effectiveHash(p.config, 'intake', [p.definitions.intake]), before);
  assert.throws(() => loadRegistries(p.root, p.config), /Definition binding\/version mismatch/);
});

test('the reviewer rubric ruleset is a shared input even outside stage context', t => {
  const p = projectFixture(t, ['intake']);
  const before = effectiveHash(p.config, 'intake', [p.definitions.intake]);
  p.config.versions = {...p.config.versions, ruleset: '99'};
  assert.notEqual(effectiveHash(p.config, 'intake', [p.definitions.intake]), before);
  assert.throws(() => loadRegistries(p.root, p.config), /Definition binding\/version mismatch/);
});

test('definition used versions are hashed rather than replaced with config versions', t => {
  const p = projectFixture(t, ['intake']);
  p.config.stages.intake.context.push('templates/intake.md');
  const before = effectiveHash(p.config, 'intake', [p.definitions.intake]);
  p.definitions.intake.versions = {...p.definitions.intake.versions, templates: '99'};
  assert.notEqual(effectiveHash(p.config, 'intake', [p.definitions.intake]), before);
});

test('shared gate storage and graph configuration remain effective inputs', t => {
  const p = projectFixture(t, ['intake']);
  const before = effectiveHash(p.config, 'intake', [p.definitions.intake]);
  p.config.gates.graph = 'review/other-graph.json';
  assert.notEqual(effectiveHash(p.config, 'intake', [p.definitions.intake]), before);
});

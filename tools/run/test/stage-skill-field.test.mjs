import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig} from '../../lib/config/config-loader.mjs';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

const skill = (skills = ['es-designer'], capability = 'design') => ({capability, skills});
const withSkill = (t, stage, value) => {
  const p = projectFixture(t);
  const config = structuredClone(p.config);
  if (value === undefined) delete config.stages[stage].skill;
  else config.stages[stage].skill = value;
  return config;
};

test('accepts a per-stage skill object with capability and skill ids on design and uiux', t => {
  const config = withSkill(t, 'design', skill(['es-designer', 'design']));
  config.stages.uiux.skill = skill(['es-designer'], 'uiux');
  assert.doesNotThrow(() => validateConfig(config));
});

test('requires a skill object on enabled design and uiux stages', t => {
  const withoutDesign = withSkill(t, 'design', undefined);
  withoutDesign.stages.design.enabled = true;
  withoutDesign.stages.uiux.skill = skill(['es-designer'], 'uiux');
  assert.throws(() => validateConfig(withoutDesign), /Bad config stages\.design\.skill/);
  const withoutUiux = withSkill(t, 'uiux', undefined);
  withoutUiux.stages.design.enabled = true;
  withoutUiux.stages.tdd.enabled = true;
  withoutUiux.stages.uiux.enabled = true;
  assert.throws(() => validateConfig(withoutUiux), /Bad config stages\.uiux\.skill/);
});

test('disabled design stage without skill → valid', t => {
  const config = withSkill(t, 'design', undefined);
  assert.equal(config.stages.design.enabled, false);
  assert.doesNotThrow(() => validateConfig(config));
  const uiux = withSkill(t, 'uiux', undefined);
  assert.equal(uiux.stages.uiux.enabled, false);
  assert.doesNotThrow(() => validateConfig(uiux));
});

test('disabled design stage that declares a vendor skill is still refused', t => {
  const config = withSkill(t, 'design', skill(['claude-sonnet-5-5']));
  assert.equal(config.stages.design.enabled, false);
  assert.throws(() => validateConfig(config), /Bad config stages\.design\.skill\.skills/);
});

test('keeps skill optional on stages that do not need it', t => {
  const config = withSkill(t, 'intake', undefined);
  assert.doesNotThrow(() => validateConfig(config));
  config.stages.intake.skill = skill(['brainstorm'], 'brainstorm');
  assert.doesNotThrow(() => validateConfig(config));
});

test('rejects vendor or model names in skill ids and capability', t => {
  for (const bad of ['claude-sonnet-5-5', 'opus', 'gpt-5.6-sol', 'gemini-3.8-flash', 'codex:rescue', 'Fable']) {
    assert.throws(() => validateConfig(withSkill(t, 'design', skill([bad]))), /Bad config stages\.design\.skill/, bad);
  }
  assert.throws(() => validateConfig(withSkill(t, 'design', skill(['es-designer'], 'claude-opus'))), /Bad config stages\.design\.skill/);
});

test('rejects unknown keys, empty skill lists, duplicate ids and malformed ids', t => {
  assert.throws(() => validateConfig(withSkill(t, 'design', {...skill(), model: 'opus'})), /Bad config stages\.design\.skill\.model/);
  assert.throws(() => validateConfig(withSkill(t, 'design', skill([]))), /Bad config stages\.design\.skill\.skills/);
  assert.throws(() => validateConfig(withSkill(t, 'design', skill(['es-designer', 'es-designer']))), /Bad config stages\.design\.skill\.skills/);
  assert.throws(() => validateConfig(withSkill(t, 'design', skill(['Es Designer']))), /Bad config stages\.design\.skill\.skills/);
  assert.throws(() => validateConfig(withSkill(t, 'design', {capability: 'design'})), /Bad config stages\.design\.skill\.skills/);
});

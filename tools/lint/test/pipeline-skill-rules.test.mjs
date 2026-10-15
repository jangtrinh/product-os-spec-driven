import test from 'node:test';
import assert from 'node:assert/strict';
import {Problems} from '../problems.mjs';
import {pipelineSkillRules} from '../rules-pipeline-skill.mjs';

const stage = (skills, capability = 'design') => ({enabled: true, owner: 'dev', context: [], skill: {capability, skills}});
const run = pipelineConfig => {
  const P = new Problems();
  pipelineSkillRules({options: {pipelineConfig}}, P);
  return P.errors;
};
const base = () => ({
  stages: {
    design: stage(['es-designer']),
    uiux: stage(['es-designer'], 'uiux'),
  },
});

test('design and uiux stages with es-designer pass without an adapter', () => {
  assert.deepEqual(run(base()), []);
});

test('a design stage without es-designer is an error that names the stage', () => {
  const config = base();
  config.stages.design = stage(['design']);
  const errors = run(config);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'E-PIPELINE-SKILL');
  assert.match(errors[0].message, /stages\.design/);
  assert.match(errors[0].message, /es-designer/);
});

test('an enabled design stage without es-designer → E-PIPELINE-SKILL', () => {
  const config = base();
  config.stages.design = {...stage(['design']), enabled: true};
  const errors = run(config);
  assert.deepEqual(errors.map(e => e.code), ['E-PIPELINE-SKILL']);
  assert.match(errors[0].message, /stages\.design/);
});

test('a disabled design stage is not checked for es-designer', () => {
  const config = base();
  config.stages.design = {...stage(['design']), enabled: false};
  assert.deepEqual(run(config), []);
});

test('a uiux stage without es-designer is an error that names the stage', () => {
  const config = base();
  config.stages.uiux = stage(['brainstorm'], 'uiux');
  const errors = run(config);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /stages\.uiux/);
});

test('a missing skill object on a design stage is an error, not a silent pass', () => {
  const config = base();
  delete config.stages.design.skill;
  const errors = run(config);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /stages\.design/);
});

test('with a design adapter enabled, design and uiux also require design', () => {
  const config = base();
  config.design_adapter = 'adapters/project/design-adapter.yaml';
  const errors = run(config);
  assert.deepEqual(errors.map(e => e.code), ['E-PIPELINE-SKILL', 'E-PIPELINE-SKILL']);
  assert.match(errors[0].message, /stages\.design.*design/);
  assert.match(errors[1].message, /stages\.uiux.*design/);

  config.stages.design = stage(['es-designer', 'design']);
  config.stages.uiux = stage(['es-designer', 'design'], 'uiux');
  assert.deepEqual(run(config), []);
});

test('without an adapter, design is not required', () => {
  const config = base();
  config.design_adapter = '';
  assert.deepEqual(run(config), []);
});

test('a legacy vsf skill id is refused with its namespace-free replacement in any stage', () => {
  const config = base();
  config.stages.intake = stage(['vsf:spec'], 'spec');
  const errors = run(config);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /legacy vsf:spec/);
  assert.match(errors[0].message, /replace it with spec-structure/);
});

test('a pipeline that declares no design or uiux stage has nothing to check', () => {
  assert.deepEqual(run({roles: {po: {enabled: true}}, gates: {baseline: 'config/baseline.json'}}), []);
});

test('no pipeline config means the rule has nothing to check', () => {
  const P = new Problems();
  pipelineSkillRules({options: {}}, P);
  assert.deepEqual(P.errors, []);
});

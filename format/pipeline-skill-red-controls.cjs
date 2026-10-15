'use strict';
// RED controls for the per-stage skill field. Each broken pipeline must be refused;
// a control that passes validation is a leak and fails the run. Temp fixtures are removed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');
const moduleUrl = file => pathToFileURL(path.join(root, file)).href;
const controls = [
  ['missing-es-designer-on-design-stage', {stage: 'design', skills: ['brainstorm'], expect: 'lint', pattern: /stages\.design\.skill\.skills lacks es-designer/}],
  ['legacy-namespaced-skill-id', {stage: 'design', skills: ['es-designer', 'vs' + 'f:design'], expect: 'lint', pattern: new RegExp(`legacy ${'vs' + 'f:design'}; replace it with design`)}],
  ['vendor-model-name-in-skills', {stage: 'design', skills: ['es-designer', 'claude-sonnet-5-5'], expect: 'loader', pattern: /Bad config stages\.design\.skill\.skills/}],
];
(async () => {
  const {validateConfig} = await import(moduleUrl('tools/lib/config/config-loader.mjs'));
  const {pipelineSkillRules} = await import(moduleUrl('tools/lint/rules-pipeline-skill.mjs'));
  const {Problems} = await import(moduleUrl('tools/lint/problems.mjs'));
  const {projectFixture} = await import(moduleUrl('fixtures/runner/project-fixture.mjs'));
  let failed = 0;
  for (const [name, control] of controls) {
    const fixture = projectFixture(undefined);
    try {
      const config = structuredClone(fixture.config);
      // Enabled, so the es-designer requirement applies; a disabled stage is not linted.
      config.stages[control.stage].enabled = true;
      config.stages[control.stage].skill = {capability: control.stage, skills: control.skills};
      let refusal = null;
      if (control.expect === 'loader') {
        try { validateConfig(config); } catch (error) { refusal = error.message; }
      } else {
        const P = new Problems();
        pipelineSkillRules({options: {pipelineConfig: config}}, P);
        refusal = P.errors.map(p => p.message).find(message => control.pattern.test(message)) ?? null;
      }
      if (refusal && control.pattern.test(refusal)) {
        console.log(`PASS red control ${name} refused: ${refusal}`);
      } else {
        failed += 1;
        console.error(`RED red control ${name} leaked: expected ${control.expect} refusal ${control.pattern}, got ${refusal ?? 'no refusal'}`);
      }
    } finally {
      fs.rmSync(fixture.root, {recursive: true, force: true});
    }
  }
  if (failed) process.exit(1);
})().catch(error => {
  console.error('RED red control harness failed: ' + error.message);
  process.exit(1);
});

import fs from 'node:fs';
import path from 'node:path';
import {STAGES} from '../lib/config/config-loader.mjs';
import {sha256} from '../lib/config/path-selection.mjs';
import {nodeCommand} from './process-observation.mjs';

const {projectFixture}=await import('../../fixtures/runner/project-fixture.mjs');   // kit-only fixtures/: run-evals loads this module only after confirming the kit checkout

export function createCaseProject(repo, directory, meta, options) {
  const enabled = STAGES.filter(stage => meta.ui || !['design', 'uiux'].includes(stage));
  const p = projectFixture(null, enabled);
  try {
    fs.cpSync(path.join(directory, 'candidate'), path.join(p.root, 'spec'), {recursive: true});
    fs.cpSync(path.join(directory, 'candidate'), path.join(p.root, 'eval-candidate'), {recursive: true});
    for (const folder of ['templates', 'rules', 'prompts']) fs.cpSync(path.join(repo, folder), path.join(p.root, folder), {recursive: true});
    const source = fs.readFileSync(path.join(directory, 'po-spec.md'), 'utf8');
    p.write('input/po-spec.md', source);
    p.config.project.name = meta.title;
    p.config.agents.writer.command = options.fake ? nodeCommand(path.join(repo, 'tools/evals/fake-bundle-agent.mjs')) : options.agent ?? 'manual';
    p.config.agents.reviewer.command = options.agent ?? 'manual';
    p.config.review.rubric = 'rules/review-rubric.md';
    p.config.review.enabled = !options.fake;
    if (options.fake) for (const role of Object.values(p.config.roles)) role.gate = false;
    for (const stage of STAGES) {
      const checkpoint = `checkpoints/${stage}.txt`;
      p.write(`eval-candidate/${checkpoint}`, `Deterministic ${meta.name} ${stage} checkpoint; no model or browser observation.\n`);
      p.write(`spec/${checkpoint}`, fs.readFileSync(path.join(p.root, 'eval-candidate', checkpoint), 'utf8'));
      const contentFiles = stage === 'prd' ? [meta.ui ? 'prd/PRD.md' : 'prd/prd.md'] : stage === 'us' ? ['us/US-01.md'] : [];
      p.definitions[stage].outputs = [...contentFiles.map(file => `spec/${file}`), `spec/${checkpoint}`];
      p.definitions[stage].inputs = ['input/po-spec.md'];
      p.config.stages[stage].context = ['input/po-spec.md', 'rules/writing-rules.md', `templates/${stage === 'clarify' ? 'decisions' : stage === 'uiux' ? 'review' : stage === 'design' ? 'ux' : stage === 'tdd' ? 'scenario-case' : stage}.md`];
      p.config.evals[stage] = [{run: nodeCommand(path.join(repo, 'tools/lint/lint.mjs'), 'spec', '--json')}];

    }
    if (meta.ui) {
      p.config.design_adapter = 'assets/profile.json'; p.config.stages.uiux.design_system = 'example';
      const profile = JSON.parse(fs.readFileSync(path.join(p.root, 'spec/assets/profile.json'), 'utf8'));
      const needed = [...new Set([...profile.authority.map(row => row.path), profile.tokens.source, ...profile.catalogs.map(row => row.path), profile.rubrics.core, ...profile.rubrics.adapter, ...profile.inputs])];
      for (const file of [...needed, p.config.design_adapter]) p.write(file, fs.readFileSync(path.join(p.root, 'spec', file), 'utf8'));
      for (const stage of ['design', 'uiux']) p.config.stages[stage].context.push(...needed);
    }
    p.save();
    return {...p, enabled, pins: {source: sha256(source), config: sha256(fs.readFileSync(path.join(p.root, 'config/pipeline.yaml')))},
      provenance: {candidate: 'Authored synthetic bundle seeded before traversal; fake agent replays declared outputs only', quality: 'Not a product build or semantic/model observation'}};
  } catch (error) { fs.rmSync(p.root, {recursive: true, force: true}); throw error; }
}

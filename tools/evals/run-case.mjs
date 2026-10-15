import fs from 'node:fs';
import path from 'node:path';
import {createCaseProject} from './case-project.mjs';
import {observe, nodeCommand} from './process-observation.mjs';
import {loadExpected, checkExpected} from './expected-checks.mjs';
import {caseCoverage} from './result-accounting.mjs';
import {behaviorChecks} from './behavior-checks.mjs';

export async function runCase(repo, directory, options) {
  const meta = JSON.parse(fs.readFileSync(path.join(directory, 'case.json'), 'utf8'));
  if(meta.name!==path.basename(directory))throw new Error('Selected project identity differs from case metadata');
  const expected = loadExpected(path.join(directory, 'expected.md'));
  const p = createCaseProject(repo, directory, meta, options);
  try {
    const pipeline = await observe(nodeCommand(path.join(repo, 'tools/run/run.mjs'), '--project', p.root, '--head', options.head, '--build', 'not-built'), p.root);
    const lint = await observe(nodeCommand(path.join(repo, 'tools/lint/lint.mjs'), path.join(p.root, 'spec'), '--json'), p.root);
    const checks = checkExpected(path.join(p.root, 'spec'), expected);
    const scopes = [], reviews = [], gates = [];
    for (const stage of p.enabled) {
      if (!fs.existsSync(path.join(p.root, `review/gates/${stage}.md`))) continue;
      const gate = p.gate(stage).data;
      scopes.push(...gate.model.scope.ids.map(id => `${gate.model.scope.kind}:${id}`));
      gates.push({stage, states: gate.model.states, rounds: gate.model.rounds});
      reviews.push({stage, ...gate.review});
    }
    const modelReview = {status: options.fake || !options.agent ? 'NOT_RUN' : reviews.length ? reviews.at(-1).verdict ?? 'NOT_RUN' : 'BLOCKED',
      command: options.agent ?? null, observations: options.fake ? [] : reviews,
      capability_limits: ['Fake results never establish model rubric quality', 'Configured CLI provider/model identity is unverified', 'Manual review independence requires external confirmation', 'Current product build/scenario coverage is not established']};
    const missing = await observe('absent-eval-negative-control-command', p.root);
    const failing = await observe(nodeCommand('-e', 'console.log("negative control: child failed");process.exit(7)'), p.root);
    const planted = checkExpected(path.join(p.root, 'spec'), {must_have: [{file: expected.must_have[0].file, text: 'PLANTED_UNMET_EXPECTED_ITEM_d44c59'}], must_not_have: []});
    const controls = [
      {id:'missing-child', status:missing.status==='BLOCKED' && missing.exit===null ? 'PASS':'FAIL', observation:missing},
      {id:'failing-child', status:failing.status==='FAIL' && failing.exit===7 ? 'PASS':'FAIL', observation:failing},
      {id:'planted-unmet-expected', status:planted.status==='FAIL' ? 'PASS':'FAIL', observation:planted},
    ];
    const requestedScopes = p.enabled.flatMap(stage => p.definitions[stage].scope.ids.map(id => `${p.definitions[stage].scope.kind}:${id}`));
    const coverage=caseCoverage(p.root,requestedScopes);
    const behavior = await behaviorChecks(repo,p,meta,options);
    const blocked = pipeline.exit === 2 || pipeline.status === 'BLOCKED' || pipeline.exit === 4;
    const checksPass = lint.status === 'PASS' && checks.status === 'PASS' && controls.every(row=>row.status==='PASS') && ['PASS','NOT_RUN'].includes(behavior.status);
    const pass = pipeline.status === 'PASS' && checksPass;
    const expectedRefusal = options.fake && meta.ui && pipeline.exit === 2 && gates.some(row => row.stage === 'uiux' && row.states.human === 'PENDING');
    const harnessPass = checksPass && (pass || expectedRefusal);
    return {id:meta.name, status:pass?'PASS':blocked?'BLOCKED':'FAIL', mode:options.fake?'deterministic-fixture':options.agent?'configured-agent':'manual',
      harness: {status:harnessPass?'PASS':'FAIL', expected_refusal:expectedRefusal, reason:expectedRefusal?'Observed not-built G4 refusal, never completed UI pipeline':'Require pipeline, lint, expected and negative controls'},
      pipeline: {status:pipeline.exit===0?'PASS':blocked?'BLOCKED':'FAIL', completed:pipeline.exit===0, exit:pipeline.exit, requested_stages:p.enabled, observed_scopes:scopes},
      quality: {status:meta.ui?'BLOCKED':'NOT_RUN', reason:meta.ui?'not-built; model and browser acceptance unavailable':'No independently qualified semantic/model review supplied'},
      scope: 'Harness result only; seeded documents and case-bound owner operations; no quality approval',
      provenance:p.provenance, pins:p.pins, pin_freshness:'CURRENT', commands:[pipeline,lint], gates,
      expected:checks, review:modelReview, browser:{status:'NOT_RUN',exit:null,reason:'No final product/browser build or executed visual matrix supplied'},
      behavior, red_controls:controls, coverage};
  } finally { fs.rmSync(p.root,{recursive:true,force:true}); }
}

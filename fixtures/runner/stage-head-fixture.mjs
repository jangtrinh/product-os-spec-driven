import {contentScope} from '../../tools/lib/definition-scope.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from './project-fixture.mjs';
import {candidateFor, livePins} from '../../tools/run/registries.mjs';
import {hashes} from '../../tools/lib/config/path-selection.mjs';
import {put, copy} from './evidence-head-controls.mjs';
import {composedPromptFiles} from '../../tools/run/composed-prompt-files.mjs';

export function stageHeadFixture(t, {manual = false, reviewed = true} = {}) {
  const p = projectFixture(t); p.config.roles.po.enabled = false; p.config.review.enabled = reviewed;
  if (manual) p.config.agents.reviewer.command = 'manual';
  p.save(); p.write('spec/prd.txt', 'Generated prd\n');
  const candidate = candidateFor(p.root, p.definitions.prd);
  p.write(`review/candidates/${candidate.digest}.json`, candidate.manifest);
  const template = JSON.parse(fs.readFileSync(new URL('../../format/fixtures/review-packet/packet-data.json', import.meta.url)));
  const receipt = copy(template.evidence[0]);
  receipt.id = 'migrated-current-fail'; receipt.scope = contentScope(candidate.scope,candidate.manifest); receipt.domain = 'spec';
  const pins = livePins(p.root, {head: 'fixture-head', build: 'not-built'}, null); delete pins.dirty;
  receipt.pins = {...pins, manifest: candidate.digest, rules: p.config.versions.ruleset, evaluator: p.config.agents.reviewer.command};
  receipt.artifacts = hashes(p.root, ['input/po-spec.txt', 'spec/prd.txt', p.config.review.rubric, ...composedPromptFiles('reviewer')]);
  receipt.review.ruleset_version = p.config.versions.ruleset; receipt.review.prompt_version = p.config.versions.templates; receipt.review.evaluator_version = p.config.agents.reviewer.command;
  receipt.review.inputs = ['input/po-spec.txt', 'spec/prd.txt'];
  receipt.coverage = {ac: [], passed: [], scenarios: [], na: []};
  receipt.execution.result = 'FAIL'; receipt.execution.exit = 1; receipt.review.verdict = 'FAIL'; receipt.review.criteria[0].score = 0;
  put(p, receipt);
  p.write('manual-review.txt', 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"Original source and final output checked independently"}],"findings":[]}\n```\n');
  return {...p, receipt, candidate, read: file => JSON.parse(fs.readFileSync(path.join(p.root, file), 'utf8'))};
}

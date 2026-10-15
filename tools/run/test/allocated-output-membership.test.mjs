import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {candidateFor, loadRegistries} from '../registries.mjs';
import {invalidateGates, passedGateEligible} from '../invalidate-gates.mjs';

const story = 'spec/us/(?:US-[0-9]+|US-P[0-9]+|NF-[0-9]+)[.]md';
const pins = {head: 'fixture-head', build: 'not-built'};

for (const change of ['add', 'remove']) test(`${change} an allocated story clears approval and binds the changed concrete membership`, t => {
  const p = projectFixture(t, ['us']);
  const files = {'spec/us/INDEX.md': 'Index.', 'spec/us/US-1.md': 'First story.', 'spec/us/US-2.md': 'Second story.'};
  p.write('writer-files.json', files);
  p.write('writer.cjs', "const fs=require('node:fs');fs.readFileSync(0,'utf8');process.stdout.write('```files\\n'+fs.readFileSync('writer-files.json','utf8')+'\\n```\\n');");
  p.definitions.us.outputs = ['spec/us/INDEX.md', story];
  p.config.agents.writer.command = `${JSON.stringify(process.execPath)} writer.cjs`;
  p.config.evals.us = [{run: `${command({eval: true})} 'spec/us/INDEX.md'`}];
  p.save();
  const initial = p.run();
  assert.equal(initial.code, 2, initial.out);
  assert.match(initial.out, /us: GATE: PENDING/);
  p.approve('us');
  const approved = p.gate('us');
  const oldDigest = approved.data.model.candidate.manifest;
  const oldManifest = fs.readFileSync(path.join(p.root, `review/candidates/${oldDigest}.json`));
  const scope = canonical(p.definitions.us.scope);
  const file = change === 'add' ? 'spec/us/US-3.md' : 'spec/us/US-2.md';
  if (change === 'add') { files[file] = 'Third story.'; p.write(file, files[file]); }
  else { delete files[file]; fs.unlinkSync(path.join(p.root, file)); }
  p.write('writer-files.json', files);
  const registry = loadRegistries(p.root, p.config);
  const stale = invalidateGates(p.root, p.config, registry, pins);
  assert.equal(stale.invalidated.has('us'), true);
  assert.equal(p.gate('us').data.model.states.freshness, 'STALE');
  assert.equal(p.gate('us').data.approval, undefined);
  assert.equal(p.gate('us').data.model.decision, null);
  assert.equal(passedGateEligible(p.root, p.config, registry, 'us', {...p.gate('us'), value: 'APPROVED'}, pins), false);
  const candidate = candidateFor(p.root, p.definitions.us);
  assert.notEqual(candidate.digest, oldDigest);
  assert.equal(Object.hasOwn(candidate.manifest.members[0].artifacts, file), change === 'add');
  const rerun = p.run();
  assert.equal(rerun.code, 2, rerun.out);
  assert.match(rerun.out, /us: GATE: PENDING/);
  const pending = p.gate('us');
  assert.equal(pending.data.approval, undefined);
  assert.equal(pending.data.model.candidate.manifest, candidate.digest);
  assert.equal(pending.data.model.states.freshness, 'CURRENT');
  assert.equal(pending.data.model.states.human, 'PENDING');
  assert.equal(canonical(p.definitions.us.scope), scope);
  assert.deepEqual(fs.readFileSync(path.join(p.root, `review/candidates/${oldDigest}.json`)), oldManifest);
});

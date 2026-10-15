import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {definitionRevision} from '../../lib/definition-scope.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {declaredOutputs} from '../project-registries.mjs';
import {materialize, WriterFailure} from '../materialize-output.mjs';
import {effectiveHash} from '../gate-files.mjs';
import {candidateFor, loadRegistries} from '../registries.mjs';
import {invalidateGates} from '../invalidate-gates.mjs';

const kit = fileURLToPath(new URL('../../../', import.meta.url));
const story = 'spec/us/(?:US-[0-9]+|US-P[0-9]+|NF-[0-9]+)[.]md';
const epic = 'spec/readable/epic-[0-9]+[.]md';
const literals = ['spec/us/INDEX.md', 'spec/readable/release.md', 'spec/readable/epic-map.json'];
const fence = files => `\`\`\`files\n${JSON.stringify(files)}\n\`\`\`\n`;
const matches = (pattern, file) => new RegExp(`^${pattern}$`).test(file);

test('prompt placeholders become strict allocated output patterns', () => {
  const us = declaredOutputs(kit, 'us');
  const tdd = declaredOutputs(kit, 'tdd');
  for (const literal of literals) assert.ok(us.includes(literal), literal);
  const usStory = us.find(entry => entry.startsWith('spec/us/') && entry.includes('US-'));
  const usEpic = us.find(entry => entry.startsWith('spec/readable/epic-') && entry !== 'spec/readable/epic-map.json');
  assert.equal(usStory, story);
  assert.equal(usEpic, epic);
  for (const file of ['spec/us/US-1.md', 'spec/us/US-P4.md', 'spec/us/NF-9.md', 'spec/readable/epic-3.md']) {
    assert.ok(us.some(entry => matches(entry, file)), file);
  }
  for (const file of ['spec/us/evil.md', 'spec/us/US-1.md.bak', 'spec/readable/epic-1-reuse.md']) {
    assert.equal(us.some(entry => matches(entry, file)), false, file);
  }
  assert.ok(tdd.includes('review/evidence/tdd.json'));
  assert.ok(tdd.some(entry => matches(entry, 'spec/tests/cases/US-1.md')));
  assert.ok(tdd.some(entry => matches(entry, 'spec/us/NF-2.md')));
  assert.ok(tdd.some(entry => matches(entry, 'spec/tests/save.spec.js')));
  assert.equal(tdd.some(entry => matches(entry, 'spec/tests/../secret.js')), false);
});

test('pattern materialization accepts allocated ids and rejects escapes', t => {
  const p = projectFixture(t);
  const declared = [...literals, story, epic];
  const good = {'spec/us/INDEX.md': 'index', 'spec/readable/release.md': 'release', 'spec/readable/epic-map.json': '{}', 'spec/us/US-1.md': 'one', 'spec/us/US-2.md': 'two', 'spec/readable/epic-3.md': 'epic'};
  assert.deepEqual(materialize(p.root, declared, fence(good)), Object.keys(good).sort());
  for (const [file, text] of Object.entries(good)) assert.equal(fs.readFileSync(path.join(p.root, file), 'utf8'), text);
  for (const bad of ['spec/us/../../x.md', 'spec/us/evil.md', 'spec/us/US-1.md.bak', 'spec/us/US-1.md\n', '/spec/us/US-1.md', 'spec/us/./US-1.md', 'spec/us//US-1.md']) {
    assert.throws(() => materialize(p.root, declared, fence({...good, [bad]: 'no'})), WriterFailure);
    assert.equal(fs.readFileSync(path.join(p.root, 'spec/us/US-1.md'), 'utf8'), 'one');
    assert.equal(fs.existsSync(path.join(p.root, 'x.md')), false);
  }
  assert.throws(() => materialize(p.root, [story], 'plain story\n'), WriterFailure);
  assert.throws(() => materialize(p.root, [story], '```files\n{}\n```\n'), /Missing declared writer output/);
  assert.equal(fs.existsSync(path.join(p.root, story)), false);
  assert.throws(() => materialize(p.root, [story], '```files\n{"spec/us/US-1.md":"one","spec/us/US-1.md":"two"}\n```\n'), /duplicate key/);
  assert.throws(() => materialize(p.root, declared, fence({'spec/us/US-1.md': 'one'})), /Missing declared writer output/);
});

test('effectiveHash follows one stage gate entry and the versions that stage uses', t => {
  const p = projectFixture(t, ['intake', 'us']);
  const intakeBefore = effectiveHash(p.config, 'intake', [p.definitions.intake]);
  const usBefore = effectiveHash(p.config, 'us', [p.definitions.us]);
  p.config.gates.stage_definitions.us.version = '9';
  assert.equal(effectiveHash(p.config, 'intake', [p.definitions.intake]), intakeBefore);
  assert.notEqual(effectiveHash(p.config, 'us', [p.definitions.us]), usBefore);
  p.config.gates.stage_definitions.us.version = '1';
  p.definitions.us.versions = {...p.definitions.us.versions, templates: '99'};
  assert.equal(effectiveHash(p.config, 'us', [p.definitions.us]), usBefore);
  p.config.versions = {...p.config.versions, templates: '9'};
  assert.equal(effectiveHash(p.config, 'us', [p.definitions.us]), usBefore);
  p.config.stages.us.context = ['templates/us.md'];
  const templatesBefore = effectiveHash(p.config, 'us', [p.definitions.us]);
  p.config.versions = {...p.config.versions, templates: '10'};
  assert.notEqual(effectiveHash(p.config, 'us', [p.definitions.us]), templatesBefore);
  p.config.versions = {...p.config.versions, workflow: '9'};
  assert.notEqual(effectiveHash(p.config, 'intake', [p.definitions.intake]), intakeBefore);
});

test('bumping the us gate version leaves earlier gates current and stales us onward', t => {
  const p = projectFixture(t, ['intake', 'contract', 'us', 'tdd']);
  p.config.roles.po.enabled = false;
  p.save();
  const first = p.run();
  assert.equal(first.code, 0, first.out);
  const intakeHash = p.gate('intake').data.config_sha256;
  const contractHash = p.gate('contract').data.config_sha256;
  p.definitions.us.version = '2';
  p.config.gates.stage_definitions.us.version = '2';
  p.definitions.us.scope.revision = definitionRevision(p.definitions.us);
  p.save();
  const result = invalidateGates(p.root, p.config, loadRegistries(p.root, p.config), {head: 'fixture-head', build: 'not-built'});
  assert.equal(result.invalidated.has('intake'), false);
  assert.equal(result.invalidated.has('contract'), false);
  assert.equal(p.gate('intake').data.model.states.freshness, 'CURRENT');
  assert.equal(p.gate('contract').data.model.states.freshness, 'CURRENT');
  assert.equal(p.gate('intake').data.config_sha256, intakeHash);
  assert.equal(p.gate('contract').data.config_sha256, contractHash);
  assert.equal(result.invalidated.has('us'), true);
  assert.equal(result.invalidated.has('tdd'), true);
  assert.equal(p.gate('us').data.model.states.freshness, 'STALE');
  assert.equal(p.gate('tdd').data.model.states.freshness, 'STALE');
});

test('a new allocated file after approval changes candidate membership without rebinding', t => {
  const p = projectFixture(t, ['us']);
  p.config.roles.po.enabled = false;
  p.definitions.us.outputs = ['spec/us/INDEX.md', story];
  p.config.agents.writer.command = command({rawResult: fence({'spec/us/INDEX.md': '# index\n', 'spec/us/US-1.md': '# one\n'})});
  p.config.evals.us = [{run: `${command({eval: true})} ${JSON.stringify('spec/us/INDEX.md')}`}];
  p.save();
  const run = p.run();
  assert.equal(run.code, 0, run.out);
  p.approve('us');
  const scope = canonical(p.definitions.us.scope);
  const manifest = p.gate('us').data.model.candidate.manifest;
  p.write('spec/us/US-2.md', '# two\n');
  const result = invalidateGates(p.root, p.config, loadRegistries(p.root, p.config), {head: 'fixture-head', build: 'not-built'});
  assert.equal(result.invalidated.has('us'), true);
  assert.ok(p.gate('us').data.invalidation.changed.includes('spec/us/US-2.md'));
  const current = candidateFor(p.root, p.definitions.us);
  assert.equal(current.manifest.members[0].artifacts['spec/us/US-2.md'] !== undefined, true);
  assert.notEqual(current.digest, manifest);
  assert.equal(canonical(current.scope), scope);
  assert.equal(canonical(p.definitions.us.scope), scope);
  assert.equal(fs.existsSync(path.join(p.root, 'review/gates/us.md')), true);
});

test('fresh init us stage materializes allocated stories and stops at GATE PENDING', {timeout: 120000}, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-allocated-us-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const stage = path.join(root, 'stage-spec');
  fs.cpSync(path.join(kit, 'fixtures/v2/full'), stage, {recursive: true});
  for (const [from, to] of [['us/US-03.md', 'us/US-3.md'], ['us/US-02.md', 'us/US-2.md'], ['us/US-01.md', 'us/US-1.md'], ['readable/epic-1-reuse-my-filters.md', 'readable/epic-1.md']]) {
    fs.renameSync(path.join(stage, from), path.join(stage, to));
  }
  const rewrite = directory => {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name);
      if (fs.statSync(file).isDirectory()) rewrite(file);
      else if (/\.(md|json|txt|html|css|ya?ml)$/i.test(name)) {
        let text = fs.readFileSync(file, 'utf8').replaceAll('US-03', 'US-3').replaceAll('US-02', 'US-2').replaceAll('US-01', 'US-1').replaceAll('epic-1-reuse-my-filters.md', 'epic-1.md');
        if (name === 'PRD.md') text = text.replace(/\| ([123]) \|$/gm, (_, digit) => `| US-${digit} |`);
        fs.writeFileSync(file, text);
      }
    }
  };
  rewrite(stage);
  const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'spec.manifest.json'), 'utf8'));
  delete manifest.design;
  delete manifest.gate_model;
  fs.writeFileSync(path.join(stage, 'spec.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const inventory = JSON.parse(fs.readFileSync(path.join(stage, 'assets/inventory.json'), 'utf8'));
  for (const screen of inventory.screens) { screen.components = []; screen.patterns = []; }
  fs.writeFileSync(path.join(stage, 'assets/inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  const overview = fs.readFileSync(path.join(stage, 'readable/00-overview.md'), 'utf8').replace('id: readable-overview', 'id: readable-release');
  fs.writeFileSync(path.join(stage, 'readable/release.md'), overview);
  fs.writeFileSync(path.join(stage, 'glossary.md'), '---\nid: stage-context-glossary\ntype: note\ntitle: "Stage glossary context"\nupdated: 2026-10-07\nstatus: draft\n---\n\nGlossary: decisions/glossary.md\n');
  fs.writeFileSync(path.join(stage, 'decisions/decisions.md'), '---\nid: stage-context-decisions\ntype: note\ntitle: "Stage decision context"\nupdated: 2026-10-07\nstatus: draft\n---\n\nLedger: decision-log.md\n');
  const emitted = ['spec/us/US-1.md', 'spec/us/US-2.md', 'spec/us/US-3.md', 'spec/us/INDEX.md', 'spec/readable/release.md', 'spec/readable/epic-1.md', 'spec/readable/epic-map.json'];
  const files = Object.fromEntries(emitted.map(file => [file, fs.readFileSync(path.join(stage, file.slice('spec/'.length)), 'utf8')]));
  const capture = path.join(root, 'calls.jsonl');
  const payload = path.join(root, 'files.json');
  const agent = path.join(root, 'double.cjs');
  fs.writeFileSync(payload, JSON.stringify(files));
  fs.writeFileSync(agent, `const fs=require('node:fs');const input=fs.readFileSync(0,'utf8');const review=input.includes('READ-ONLY INDEPENDENT REVIEW');fs.appendFileSync(${JSON.stringify(capture)},JSON.stringify({review,pid:process.pid,cwd:process.cwd()})+'\\n');if(review){process.stdout.write('VERDICT: PASS\\n'+String.fromCharCode(96).repeat(3)+'review-data\\n'+JSON.stringify({criteria:[{id:'source',mandatory:true,score:2,evidence:'Test double compared supplied source and outputs'}],findings:[]})+'\\n'+String.fromCharCode(96).repeat(3)+'\\n');}else{const files=JSON.parse(fs.readFileSync(${JSON.stringify(payload)},'utf8'));process.stdout.write(String.fromCharCode(96).repeat(3)+'files\\n'+JSON.stringify(files)+'\\n'+String.fromCharCode(96).repeat(3)+'\\n');}`);
  const project = path.join(root, 'project');
  const init = spawnSync(process.execPath, [path.join(kit, 'tools/run/init.mjs'), '--project', project, '--name', 'Allocated outputs', '--lang', 'en', '--agent', `node ${JSON.stringify(agent)}`], {encoding: 'utf8'});
  assert.equal(init.status, 0, init.stdout + init.stderr);
  fs.cpSync(stage, path.join(project, 'spec'), {recursive: true});
  const run = spawnSync(process.execPath, [path.join(project, 'tools/run/run.mjs'), '--project', project, '--stage', 'us', '--head', 'allocated-source', '--build', 'not-built'], {encoding: 'utf8', timeout: 60000});
  const logDir = path.join(project, 'review/log');
  const diagnostics = [
    fs.existsSync(logDir) ? fs.readdirSync(logDir).map(file => {
      const lines = fs.readFileSync(path.join(logDir, file), 'utf8').split('\n').filter(line => /ERROR|error\(s\)|WriterFailure|Missing declared/.test(line));
      return `--- ${file} ---\n${lines.join('\n')}`;
    }).join('\n') : '',
    fs.existsSync(path.join(project, 'review/runtime/us.json')) ? fs.readFileSync(path.join(project, 'review/runtime/us.json'), 'utf8') : '',
  ].join('\n');
  assert.equal(run.status, 2, `${run.stdout}${run.stderr}\n${diagnostics}`);
  assert.match(run.stdout, /us: GATE: PENDING/, `${run.stdout}${run.stderr}\n${diagnostics}`);
  for (const file of emitted) assert.equal(fs.readFileSync(path.join(project, file), 'utf8'), files[file], file);
  const calls = fs.readFileSync(capture, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.map(call => call.review), [false, true]);
  assert.notEqual(calls[0].pid, calls[1].pid);
  assert.notEqual(calls[0].cwd, calls[1].cwd);
  const state = JSON.parse(fs.readFileSync(path.join(project, 'review/runtime/us.json'), 'utf8'));
  assert.deepEqual(state.last_evals.map(row => row.exit_code), [0]);
  assert.equal(state.review_result.verdict, 'PASS');
  assert.match(fs.readFileSync(path.join(project, 'review/gates/us.md'), 'utf8'), /^GATE: PENDING/);
  const gate = JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(fs.readFileSync(path.join(project, 'review/gates/us.md'), 'utf8'))[1]);
  assert.deepEqual(Object.keys(gate.outputs), [...emitted].sort());
  const receipt = JSON.parse(fs.readFileSync(path.join(project, 'review/receipts', `${gate.model.receipts[0]}.json`), 'utf8'));
  for (const file of emitted) { assert.equal(receipt.artifacts[file], gate.outputs[file]); assert.ok(receipt.review.inputs.includes(file)); }
});

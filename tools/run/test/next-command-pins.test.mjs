import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {loadConfig} from '../../lib/config/config-loader.mjs';
import {loadRegistries, definitionsFor} from '../registries.mjs';
import {appendAudit} from '../audit-store.mjs';

const tool = name => fileURLToPath(new URL(`../${name}`, import.meta.url));
const decide = p => spawnSync(process.execPath, [tool('decide.mjs'), '--project', p.root, '--stage', 'prd', '--as', 'po@example.test', '--approve'], {encoding: 'utf8'});
const status = p => JSON.parse(spawnSync(process.execPath, [tool('status.mjs'), '--project', p.root, '--json'], {encoding: 'utf8'}).stdout);

test('decide prints the next run command with the pins the project actually runs with', t => {
  const p = projectFixture(t, ['prd', 'us']);
  assert.equal(p.run(['--head', 'release 7', '--build', 'build-42']).code, 2);
  const r = decide(p); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /run\.mjs .*--head 'release 7' --build build-42\n/);
  assert.doesNotMatch(r.stdout, /fresh-source/);
});
test('the printed command reruns without invalidating the approved gate', t => {
  const p = projectFixture(t, ['prd', 'us']);
  assert.equal(p.run(['--head', 'release-7', '--build', 'build-42']).code, 2);
  const decided = decide(p); assert.equal(decided.status, 0, decided.stdout + decided.stderr);
  const printed = /--head (\S+) --build (\S+)\n/.exec(decided.stdout);
  const next = p.run(['--head', printed[1], '--build', printed[2]]);
  assert.equal(next.code, 2, next.out); assert.equal(p.gate('prd').raw.startsWith('GATE: APPROVED'), true);
});
test('status next command for a stage that has not run yet reuses the project pins', t => {
  const p = projectFixture(t, ['prd', 'us']);
  assert.equal(p.run(['--head', 'release-7', '--build', 'build-42']).code, 2);
  assert.equal(decide(p).status, 0);
  const value = status(p);
  assert.equal(value.next_stage, 'us');
  assert.match(value.next_command, /run\.mjs .*--head release-7 --build build-42$/);
});
test('without any recorded pins the documented defaults remain', t => {
  const p = projectFixture(t, ['prd', 'us']);
  assert.match(status(p).next_command, /--head fresh-source --build not-built$/);
});

// Runtime records written the way the runner writes them (only pins matter to status).
const runtime = (p, stage, pins) => p.write(`review/runtime/${stage}.json`, JSON.stringify({phase: 'writer', rounds: {cycle: `${stage}-lineage`, eval_fix: 0, review: 0, max_fix: 3, max_review: 3, continuation: null}, pins: {...pins, base: pins.head, dirty: false}}));
const nextRun = (p, stage) => status(p).stages.find(row => row.stage === stage).next_command;
const pinsOf = command => /--head (\S+) --build (\S+)$/.exec(command).slice(1);

test('a newly enabled middle stage takes the pins of the nearest earlier stage, not of a later one', t => {
  const p = projectFixture(t, ['intake', 'clarify', 'prd']);
  runtime(p, 'intake', {head: 'head-early', build: 'build-early'});
  runtime(p, 'prd', {head: 'head-late', build: 'build-late'});
  assert.deepEqual(pinsOf(nextRun(p, 'clarify')), ['head-early', 'build-early']);
  assert.deepEqual(pinsOf(nextRun(p, 'prd')), ['head-late', 'build-late'], 'a stage keeps its own pins');
});

// Rule: nearest earlier pinned stage; with none, the pinned stage whose latest audited event is newest;
// with no audited time at all, the first pinned stage in pipeline order.
async function auditedFirstStage(t, newest) {
  const p = projectFixture(t, ['intake', 'prd', 'us']);
  runtime(p, 'prd', {head: 'head-prd', build: 'build-prd'});
  runtime(p, 'us', {head: 'head-us', build: 'build-us'});
  const config = loadConfig(p.root); const registry = loadRegistries(p.root, config);
  for (const stage of newest === 'us' ? ['prd', 'us'] : ['us', 'prd']) {
    appendAudit(p.root, {type: 'change', scope: definitionsFor(config, registry, stage)[0].scope, after: 'settled', refs: [`gate-${stage}`], reason: `Stage settled test ${stage}`});
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  return p;
}
test('with no earlier pinned stage, the pins come from the stage with the newest audited run', async t => {
  assert.deepEqual(pinsOf(nextRun(await auditedFirstStage(t, 'us'), 'intake')), ['head-us', 'build-us']);
  assert.deepEqual(pinsOf(nextRun(await auditedFirstStage(t, 'prd'), 'intake')), ['head-prd', 'build-prd']);
});
test('with no audited time at all, the first pinned stage in pipeline order supplies the pins', t => {
  const p = projectFixture(t, ['intake', 'prd', 'us']);
  runtime(p, 'prd', {head: 'head-prd', build: 'build-prd'});
  runtime(p, 'us', {head: 'head-us', build: 'build-us'});
  assert.deepEqual(pinsOf(nextRun(p, 'intake')), ['head-prd', 'build-prd']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {writeGate} from '../../run/gate-files.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';

const cli = path.resolve('tools/evals/promote-case.mjs');
const run = (...args) => spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8'});
const treeHash = root => {
  const rows = [];
  const walk = (dir = '') => {
    for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(relative);
      else rows.push(`${relative}:${sha256(fs.readFileSync(path.join(root, relative)))}`);
    }
  };
  walk();
  return createHash('sha256').update(rows.join('\n')).digest('hex');
};

function approvedProject(t, {complete = true} = {}) {
  const p = projectFixture(t, ['us']);
  fs.cpSync('evals/cases/baseline/candidate', path.join(p.root, 'spec'), {recursive: true});
  p.write('input/po-spec.md', fs.readFileSync('evals/cases/baseline/po-spec.md'));
  assert.equal(p.run().code, 2);
  if (!complete) p.write('spec/only.md', '# Incomplete candidate\n');
  const gate = p.gate('us');
  const files = complete ? ['glossary.md', 'prd/prd.md', 'spec.manifest.json', 'us/US-01.md'] : ['only.md'];
  gate.data.outputs = Object.fromEntries(files.map(file => [`spec/${file}`, sha256(fs.readFileSync(path.join(p.root, 'spec', file)))]));
  const receipt = path.join(p.root, 'review/receipts', `${gate.data.model.receipts[0]}.json`);
  const receiptData = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  Object.assign(receiptData.artifacts, gate.data.outputs);
  fs.writeFileSync(receipt, canonical(receiptData) + '\n');
  gate.data.approval = {by: 'po@example.test', at: '2026-10-16T00:00:00Z'};
  gate.data.model.states.human = 'APPROVED';
  gate.data.model.decision = 'fixture-us-decision';
  writeGate(p.root, p.config, 'us', 'APPROVED', gate.data);
  return p;
}

test('T3: promote-case creates a private case from an APPROVED us gate and its fake eval is green', t => {
  const p = approvedProject(t);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'promoted-cases-'));
  t.after(() => fs.rmSync(out, {recursive: true, force: true}));
  const result = run('--project', p.root, '--stage', 'us', '--name', 'approved-us', '--out', out);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const root = path.join(out, 'approved-us');
  assert.deepEqual(fs.readdirSync(root).sort(), ['candidate', 'case.json', 'expected.md', 'po-spec.md', 'provenance.json']);
  assert.deepEqual(fs.readFileSync(path.join(root, 'po-spec.md')), fs.readFileSync(path.join(p.root, 'input/po-spec.md')));
  const provenance = JSON.parse(fs.readFileSync(path.join(root, 'provenance.json')));
  assert.equal(provenance.gate.id, p.gate('us').data.model.definition.id);
  assert.equal(provenance.approval.at, '2026-10-16T00:00:00Z');
  assert.match(result.stdout, /fake eval: green/i);
});

test('T4: promote-case refuses pending gate, hash mismatch, empty approvers, and removes a red case', t => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'promoted-refusals-'));
  t.after(() => fs.rmSync(out, {recursive: true, force: true}));

  const pending = approvedProject(t); const pendingGate = pending.gate('us');
  pendingGate.data.model.states.human = 'PENDING'; pendingGate.data.model.decision = null; delete pendingGate.data.approval;
  writeGate(pending.root, pending.config, 'us', 'PENDING', pendingGate.data);
  let result = run('--project', pending.root, '--stage', 'us', '--name', 'pending', '--out', out);
  assert.equal(result.status, 3); assert.match(result.stderr, /gate not approved/i);

  const changed = approvedProject(t); fs.appendFileSync(path.join(changed.root, 'spec/us/US-01.md'), 'changed after approval\n');
  result = run('--project', changed.root, '--stage', 'us', '--name', 'changed', '--out', out);
  assert.equal(result.status, 3); assert.match(result.stderr, /hash mismatch/i);

  const noApprovers = approvedProject(t); noApprovers.config.roles.po.approvers = []; noApprovers.save();
  result = run('--project', noApprovers.root, '--stage', 'us', '--name', 'no-approvers', '--out', out);
  assert.equal(result.status, 3); assert.match(result.stderr, /approvers/i);

  const existing = approvedProject(t); fs.mkdirSync(path.join(out, 'existing'));
  fs.writeFileSync(path.join(out, 'existing', 'po-spec.md'), 'earlier promoted case\n');
  result = run('--project', existing.root, '--stage', 'us', '--name', 'existing', '--out', out);
  assert.equal(result.status, 3); assert.match(result.stderr, /already exists/i);
  assert.equal(fs.readFileSync(path.join(out, 'existing', 'po-spec.md'), 'utf8'), 'earlier promoted case\n', 'refusing an existing case keeps it intact');

  const red = approvedProject(t, {complete: false}); const before = treeHash(out);
  result = run('--project', red.root, '--stage', 'us', '--name', 'red-case', '--out', out);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(treeHash(out), before, 'a failed fake eval leaves the output tree unchanged');
});

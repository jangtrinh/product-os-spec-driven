import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {packetProject} from '../../../fixtures/reader/packet-project.mjs';
import {generate} from '../../reader/packet.mjs';
import {canonical} from '../../lib/config/strict-json.mjs';
import {sha256, inventory, hashes} from '../../lib/config/path-selection.mjs';

function prepared(t, {committed = false} = {}) {
  const p = packetProject(t, {exception: true});
  if (committed) {
    const git = args => { const r = spawnSync('git', args, {cwd: p.root, encoding: 'utf8'}); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
    git(['init', '-q']); git(['add', 'spec']);
    git(['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'test: pin original spec']);
    const head = git(['rev-parse', 'HEAD']);
    p.changeSet.candidate.head = head; p.receipt.pins.head = head;
    p.write(`review/changes/${p.changeSet.id}.json`, p.changeSet); p.write('review/receipts/fixture-receipt.json', p.receipt);
    for (const f of inventory(p.root).filter(f => f.startsWith('review/gates/scoped/'))) {
      const record = JSON.parse(fs.readFileSync(path.join(p.root, f))); record.candidate.head = head; p.write(f, record);
    }
  }
  const out = path.join(p.root, 'generated');
  generate({spec: p.spec, project: p.root, config: 'config/pipeline.yaml', changeSet: p.changeSet.id, out});
  const packet = JSON.parse(fs.readFileSync(path.join(out, 'packet-data.json')));
  const save = () => {
    p.save();
    const digest = sha256(canonical(packet));
    p.write('packet-data.json', packet);
    p.write('decision.json', {id: 'source-checked', packet_id: `packet-${digest}`, data_sha256: digest, scope: packet.scope, pins: packet.candidate,
      by: 'po@example.test', at: new Date().toISOString(), default: 'approve', reason: 'Review the current source', overrides: [], exceptions: []});
  };
  save();
  return {...p, packet, save, importBatch: () => p.run(['--import-decision', 'decision.json', '--packet-data', 'packet-data.json', '--as', 'po@example.test'])};
}
const store = p => hashes(p.root, inventory(p.root).filter(f => f.startsWith('review/')));

test('canonical packet built from current source imports with existing authority checks', t => {
  const p = prepared(t); const result = p.importBatch(); assert.equal(result.code, 0, result.out);
});
for (const [field, mutate] of [
  ['screen route', p => {p.screens[0].route = '/filters/alternate';}],
  ['decision ruling', p => {p.decisions[0].text = 'Alternate review wording';}],
  ['before-and-after wording', p => {p.change.rules[0].after = 'Alternate rule wording';}],
  ['evidence display', p => {p.evidence[0].execution.command = 'Alternate execution description';}],
  ['exception reason', p => {p.exceptions[0].reason = 'Alternate applicability wording';}],
  ['requested reason', p => {p.requests[0].reason = 'Alternate request wording';}],
]) test(`recomputed digest cannot authorize a packet with changed ${field}; store stays unchanged`, t => {
  const p = prepared(t); mutate(p.packet); p.save(); const before = store(p);
  const result = p.importBatch(); assert.equal(result.code, 3, result.out);
  assert.match(result.out, /rebuilt|authoritative|source/i); assert.deepEqual(store(p), before);
});
test('stale original spec bytes refuse import before any store mutation', t => {
  const p = prepared(t); fs.appendFileSync(path.join(p.spec, 'us/US-01.md'), '\nChanged source wording.\n');
  const before = store(p); const result = p.importBatch(); assert.equal(result.code, 3, result.out); assert.deepEqual(store(p), before);
});
test('missing configured spec refuses import before any store mutation', t => {
  const p = prepared(t); p.config.project.spec_root = 'missing-spec'; p.save(); const before = store(p);
  const result = p.importBatch(); assert.equal(result.code, 3, result.out); assert.deepEqual(store(p), before);
});

test('committed HEAD spec imports while unrelated dirty files are recorded without claiming handoff', t => {
  const p = prepared(t, {committed: true}); p.write('unrelated.txt', 'Uncommitted unrelated content');
  const result = p.importBatch(); assert.equal(result.code, 0, result.out);
  assert.match(fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8'), /dirty=true/);
});
test('updated working-tree pins cannot substitute uncommitted spec wording for HEAD', t => {
  const p = prepared(t, {committed: true});
  fs.appendFileSync(path.join(p.spec, 'us/US-01.md'), '\nUncommitted alternative wording.\n');
  const key = 'spec/us/US-01.md', digest = sha256(fs.readFileSync(path.join(p.root, key)));
  for (const member of p.packet.membership.members) { member.artifacts[key] = digest; member.revision = sha256(canonical(member.artifacts)); }
  p.packet.candidate.manifest = sha256(canonical(p.packet.membership)); p.packet.scope.revision = sha256(canonical(p.packet.membership.members));
  p.write(`review/candidates/${p.packet.candidate.manifest}.json`, p.packet.membership);
  p.changeSet.candidate = p.packet.candidate; p.changeSet.scope = p.packet.scope; p.write(`review/changes/${p.changeSet.id}.json`, p.changeSet); p.save();
  const before = store(p), result = p.importBatch(); assert.equal(result.code, 3, result.out);
  assert.match(result.out, /not the bytes|HEAD|source/i); assert.deepEqual(store(p), before);
});

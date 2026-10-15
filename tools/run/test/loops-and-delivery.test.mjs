import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {appendAudit, auditEvents} from '../audit-store.mjs';
import {recordDeliveryEvent} from '../delivery-state.mjs';

test('deleted runtime state cannot reset unresolved persisted caps', t => {
  const p = projectFixture(t, ['prd'], {writer: {text: 'defect'}}); p.config.limits.max_fix_rounds = 1;
  p.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/prd.txt'}]; p.save(); assert.equal(p.run().code, 2);
  fs.rmSync(path.join(p.root, 'review/runtime/prd.json')); const r = p.run(); assert.equal(r.code, 2, r.out);
  assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8')).rounds.eval_fix, 1);
});
test('scoped PO continuation adds explicit rounds, retains counters and rejects expiry', t => {
  const p = projectFixture(t, ['prd'], {writer: {text: 'defect'}}); p.config.limits.max_fix_rounds = 0;
  p.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/prd.txt'}]; p.save(); assert.equal(p.run().code, 2);
  const exception = {id: 'extra-round', kind: 'continuation', scope: p.definitions.prd.scope, source: 'PO approved one additional round', reason: 'Repair one demonstrated content defect', by: 'po@example.test', at: new Date(Date.now() - 1000).toISOString(), expires: new Date(Date.now() + 60000).toISOString(), deferred_gates: [], compensating_checks: ['rerun eval and independent review'], non_waivable: ['mandatory criteria 2', 'independence'], status: 'active', extra_rounds: 1};
  p.write('review/exceptions/extra-round.json', exception);
  appendAudit(p.root, {type: 'decision', scope: exception.scope, actor: exception.by, refs: [exception.id], reason: 'authority: asserted-local; PO continuation'});
  p.definitions.prd.exceptions = [exception.id]; p.write('review/definitions/gate-prd/1.json', p.definitions.prd);
  const r = p.run(); assert.equal(r.code, 2, r.out);
  const state = JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8'));
  assert.equal(state.rounds.eval_fix, 1); assert.equal(state.rounds.max_fix, 1); assert.equal(state.rounds.continuation, exception.id);
  assert.equal(p.run().code, 2); assert.equal(JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8')).rounds.max_fix, 1);
  exception.expires = new Date(Date.now() - 1000).toISOString(); p.write('review/exceptions/extra-round.json', exception);
  const expired = p.run(); assert.equal(expired.code, 2, expired.out);
  const afterExpiry = JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8'));
  assert.equal(afterExpiry.effective_max_fix, 0); assert.equal(afterExpiry.rounds.eval_fix, 1);
});
test('backward/expected-result re-entry requires recorded PO decision', t => {
  const p = projectFixture(t); assert.equal(p.run().code, 2);
  const r = p.run(['--stage', 'prd']); assert.equal(r.code, 2, r.out); assert.match(r.out, /requires --transition/);
  const record = {id: 'transition-prd', kind: 'backward', opener: 'qc', at: new Date().toISOString(), source: 'Expected outcome changed', reason: 'Return expected-result change to source AC and PO', from: {stage: 'tdd', scope: p.definitions.prd.scope, revision: 'before'}, to: {stage: 'prd', scope: p.definitions.prd.scope, revision: 'after'}, impact: [{node: 'ac:US-16.AC-01', domain: 'spec', classification: 'direct', reason: 'Expected outcome', path: ['ac:US-16.AC-01']}], authority: 'po', decision: null, regates: ['gate-prd']};
  p.write('transition.json', record); const proposed = p.run(['--stage', 'prd', '--transition', 'transition.json']); assert.equal(proposed.code, 2, proposed.out);
  const event = appendAudit(p.root, {type: 'decision', scope: record.to.scope, actor: 'po@example.test', refs: [record.id], reason: 'PO authorizes changed AC'});
  record.decision = event.id; p.write('transition.json', record); const authorized = p.run(['--stage', 'prd', '--transition', 'transition.json']);
  assert.equal(authorized.code, 2, authorized.out); assert.ok(auditEvents(p.root).some(row => row.type === 'transition'));
});
test('publication, acknowledgment and switch are separate, immutable and idempotent', t => {
  const p = batchFixture(t); assert.equal(p.importBatch().code, 0); p.changeSet.state = 'Approved'; p.changeSet.po_decision = p.decision.id;
  p.changeSet.receivers = [{receiver: 'dev@example.test', baseline: p.packet.baseline.manifest, acknowledgment: null, switch: null}]; p.write(`review/changes/${p.changeSet.id}.json`, p.changeSet);
  const publication = {id: 'publish-fixture', type: 'publication', actor: 'po@example.test'};
  const receipt = recordDeliveryEvent(p.root, p.config, p.changeSet.id, publication, p.packet.candidate);
  const snapshot = path.join(p.root, p.config.project.spec_root, `delivery/baselines/${p.changeSet.id}/files/us/US-16.md`);
  const oldBytes = fs.readFileSync(snapshot); assert.equal(recordDeliveryEvent(p.root, p.config, p.changeSet.id, publication, p.packet.candidate).id, receipt.id);
  let state = JSON.parse(fs.readFileSync(path.join(p.root, `review/changes/${p.changeSet.id}.json`), 'utf8')); assert.equal(state.state, 'Published'); assert.equal(state.receivers[0].switch, null);
  assert.throws(() => recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'switch-early', type: 'switch', actor: 'dev@example.test'}, p.packet.candidate), /acknowledgment/);
  recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'ack-fixture', type: 'acknowledgment', actor: 'dev@example.test'}, p.packet.candidate);
  state = JSON.parse(fs.readFileSync(path.join(p.root, `review/changes/${p.changeSet.id}.json`), 'utf8')); assert.equal(state.state, 'Acknowledged'); assert.equal(state.receivers[0].baseline, p.packet.baseline.manifest);
  recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'switch-fixture', type: 'switch', actor: 'dev@example.test'}, p.packet.candidate);
  p.write('us/US-16.md', 'New incompatible draft'); assert.deepEqual(fs.readFileSync(snapshot), oldBytes);
  assert.throws(() => recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'publish-again', type: 'publication', actor: 'po@example.test'}, {...p.packet.candidate, head: 'moved-head'}), /Moved/);
});

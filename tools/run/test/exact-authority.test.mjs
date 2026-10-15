import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {appendAudit} from '../audit-store.mjs';
import {recordDeliveryEvent} from '../delivery-state.mjs';
import {requireTransition} from '../runtime-state.mjs';

const read = (p, file) => fs.readFileSync(path.join(p.root, file), 'utf8');
test('cross-scope or wrong-revision continuation leaves persisted counters and audit unchanged', t => {
  for (const wrong of [{kind: 'stage', ids: ['us'], revision: 'unrelated'}, {revision: 'unrelated'}]) {
    const p = projectFixture(t, ['prd'], {writer: {text: 'defect'}}); p.config.limits.max_fix_rounds = 0;
    p.config.evals.prd = [{run: command({eval: true}), per_file: 'spec/prd.txt'}]; p.save(); assert.equal(p.run().code, 2);
    const exception = {id: 'extra', kind: 'continuation', scope: p.definitions.prd.scope, source: 'PO continuation', reason: 'Repair defect', by: 'po@example.test', at: new Date(Date.now() - 1000).toISOString(), expires: new Date(Date.now() + 60000).toISOString(), deferred_gates: [], compensating_checks: ['rerun'], non_waivable: ['independence'], status: 'active', extra_rounds: 1};
    p.write('review/exceptions/extra.json', exception);
    appendAudit(p.root, {type: 'decision', scope: {...exception.scope, ...wrong}, actor: exception.by, refs: [exception.id], reason: 'PO continuation'});
    p.definitions.prd.exceptions = [exception.id]; p.save();
    const state = read(p, 'review/runtime/prd.json'); const audit = read(p, 'review/audit.jsonl');
    const result = p.run(); assert.equal(result.code, 2, result.out);
    assert.equal(read(p, 'review/runtime/prd.json'), state); assert.equal(read(p, 'review/audit.jsonl'), audit);
  }
});

test('cross-scope publication rejects before any snapshot, audit or Change Set write', t => {
  const p = batchFixture(t); assert.equal(p.importBatch().code, 0);
  const file = `review/changes/${p.changeSet.id}.json`;
  const change = JSON.parse(read(p, file)); change.scope = {kind: 'stage', ids: ['us'], revision: 'unapproved'};
  p.write(file, change); const audit = read(p, 'review/audit.jsonl'); const bytes = read(p, file);
  assert.throws(() => recordDeliveryEvent(p.root, p.config, change.id, {id: 'wrong-scope', type: 'publication', actor: 'po@example.test'}, p.packet.candidate), error => error.code === 2);
  assert.equal(read(p, 'review/audit.jsonl'), audit); assert.equal(read(p, file), bytes);
  assert.equal(fs.existsSync(path.join(p.root, `spec/delivery/baselines/${change.id}`)), false);
});

test('publication rejects candidate, revision, decision bytes and Change Set identity substitution', t => {
  const cases = [
    (p, change) => {change.scope.revision = 'unapproved-revision';},
    (p, change) => {change.candidate.head = 'different-candidate';},
    (p, change) => {change.id = 'CS-substituted';},
    p => {p.decision.reason = 'Rewritten immutable approval'; p.write(`review/decisions/${p.decision.id}.json`, p.decision);},
  ];
  for (const mutate of cases) {
    const p = batchFixture(t); assert.equal(p.importBatch().code, 0);
    const file = `review/changes/${p.changeSet.id}.json`; const change = JSON.parse(read(p, file));
    mutate(p, change); p.write(file, change);
    const audit = read(p, 'review/audit.jsonl'); const bytes = read(p, file);
    assert.throws(() => recordDeliveryEvent(p.root, p.config, p.changeSet.id, {id: 'substitution', type: 'publication', actor: 'po@example.test'}, change.candidate), error => error.code === 2);
    assert.equal(read(p, 'review/audit.jsonl'), audit); assert.equal(read(p, file), bytes);
    assert.equal(fs.existsSync(path.join(p.root, `spec/delivery/baselines/${p.changeSet.id}`)), false);
  }
});

test('batch exception import rejects cross-scope authority without approval or audit mutation', t => {
  const p = batchFixture(t);
  const exception = {id: 'unrelated', kind: 'applicability', scope: {kind: 'stage', ids: ['us'], revision: 'other'}, source: 'PO applicability', reason: 'No UI', by: p.decision.by, at: p.decision.at, expires: new Date(Date.now() + 60000).toISOString(), deferred_gates: [], compensating_checks: ['spec review'], non_waivable: ['independence'], status: 'active'};
  p.write('review/exceptions/unrelated.json', exception); p.packet.exceptions = [exception]; p.decision.exceptions = [exception.id]; p.saveBatch();
  const audit = read(p, 'review/audit.jsonl'); const file = `review/changes/${p.changeSet.id}.json`; const bytes = read(p, file);
  const result = p.importBatch(); assert.equal(result.code, 3, result.out); assert.match(result.out, /scope-mismatched exception/);
  assert.equal(read(p, 'review/audit.jsonl'), audit); assert.equal(read(p, file), bytes);
  assert.equal(fs.existsSync(path.join(p.root, `review/decisions/${p.decision.id}.json`)), false);
});

test('publication retry cannot hide a changed scope behind its old event id', t => {
  const p = batchFixture(t); assert.equal(p.importBatch().code, 0);
  const event = {id: 'published', type: 'publication', actor: 'po@example.test'};
  recordDeliveryEvent(p.root, p.config, p.changeSet.id, event, p.packet.candidate);
  const file = `review/changes/${p.changeSet.id}.json`; const change = JSON.parse(read(p, file));
  change.scope.revision = 'other'; p.write(file, change); const audit = read(p, 'review/audit.jsonl');
  assert.throws(() => recordDeliveryEvent(p.root, p.config, p.changeSet.id, event, p.packet.candidate), error => error.code === 2);
  assert.equal(read(p, 'review/audit.jsonl'), audit);
});

test('prototype-first transition rejects an unrelated exception before appending its audit event', t => {
  const p = projectFixture(t); const scope = p.definitions.prd.scope;
  const at = new Date().toISOString();
  const exception = {id: 'prototype', kind: 'prototype-first', scope: {...scope, ids: ['us']}, source: 'PO prototype', reason: 'Explore prototype', by: 'po@example.test', at: new Date(Date.now() - 1000).toISOString(), expires: new Date(Date.now() + 60000).toISOString(), deferred_gates: [], compensating_checks: ['combined review'], non_waivable: ['independence'], status: 'active', combined_checkpoint: 'gate-prd'};
  p.write('review/exceptions/prototype.json', exception); p.definitions.prd.exceptions = [exception.id];
  const transition = {id: 'prototype-transition', kind: 'exception', opener: 'dev', at, source: exception.id, reason: 'PO prototype-first', from: {stage: 'prd', scope, revision: 'before'}, to: {stage: 'prd', scope, revision: 'after'}, impact: [{node: 'ac:US-16.AC-01', domain: 'spec', classification: 'direct', reason: 'Prototype', path: ['ac:US-16.AC-01']}], authority: 'po', decision: null, regates: ['gate-prd']};
  const decision = appendAudit(p.root, {type: 'decision', scope, actor: exception.by, refs: [transition.id, exception.id], reason: 'PO prototype'});
  transition.decision = decision.id; p.write('transition.json', transition); const audit = read(p, 'review/audit.jsonl');
  const registry = {definitions: new Map([['gate-prd', p.definitions.prd]])};
  assert.throws(() => requireTransition(p.root, {transition: 'transition.json'}, p.config, registry, 'prd', true), error => error.code === 2);
  assert.equal(read(p, 'review/audit.jsonl'), audit);
});

test('switch rejects an acknowledgment from a different scope and preserves delivery audit', t => {
  const p = batchFixture(t); assert.equal(p.importBatch().code, 0);
  const file = `review/changes/${p.changeSet.id}.json`; const change = JSON.parse(read(p, file));
  change.receivers = [{receiver: 'dev@example.test', baseline: change.baseline.manifest, acknowledgment: null, switch: null}]; p.write(file, change);
  recordDeliveryEvent(p.root, p.config, change.id, {id: 'publish', type: 'publication', actor: 'po@example.test'}, p.packet.candidate);
  appendAudit(p.root, {id: 'other-ack', type: 'acknowledgment', scope: {...change.scope, revision: 'other'}, actor: 'dev@example.test', after: change.candidate.manifest, refs: [change.id], reason: 'Different scope'});
  const published = JSON.parse(read(p, file)); published.receivers[0].acknowledgment = 'other-ack'; p.write(file, published);
  const audit = read(p, 'review/audit.jsonl'); const bytes = read(p, file);
  assert.throws(() => recordDeliveryEvent(p.root, p.config, change.id, {id: 'switch', type: 'switch', actor: 'dev@example.test'}, p.packet.candidate), error => error.code === 2);
  assert.equal(read(p, 'review/audit.jsonl'), audit); assert.equal(read(p, file), bytes);
});

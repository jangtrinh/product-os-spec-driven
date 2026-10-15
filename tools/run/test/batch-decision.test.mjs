import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {resolveOverrides} from '../import-decision.mjs';

test('batch import validates full membership/pins/authority and is idempotent', t => {
  const p = batchFixture(t); const r = p.importBatch(); assert.equal(r.code, 0, r.out);
  const before = fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8');
  assert.equal(p.importBatch().code, 0); assert.equal(fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8'), before);
  assert.match(before, /authority: asserted-local/);
  const change = JSON.parse(fs.readFileSync(path.join(p.root, `review/changes/${p.changeSet.id}.json`), 'utf8'));
  assert.equal(change.state, 'Approved'); assert.equal(change.po_decision, p.decision.id);
});
test('stale packet, unknown scope, changed bytes and conflicting overrides mutate no decision/audit', t => {
  const cases = [p => {p.packet.candidate.head = 'old-head'; p.decision.pins = p.packet.candidate; p.saveBatch();}, p => {p.decision.scope.ids = ['US-999.AC-01']; p.write('decision.json', p.decision);}, p => {p.packet.change.reason = 'tampered bytes'; p.write('packet-data.json', p.packet);}, p => {p.decision.overrides = [{id: 'US-999', decision: 'approve', reason: 'unknown'}]; p.saveBatch();}];
  for (const mutate of cases) {
    const p = batchFixture(t); const before = fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8'); mutate(p);
    const r = p.importBatch(); assert.equal(r.code, 3, r.out); assert.equal(fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8'), before);
    assert.equal(fs.existsSync(path.join(p.root, 'review/decisions/fixture-decision.json')), false);
  }
});
test('per-AC override precedes per-US then default; requested/deferred remains pending', t => {
  const p = batchFixture(t); p.decision.default = 'defer'; p.decision.overrides = [{id: 'US-16', decision: 'approve', reason: 'Approve story'}, {id: 'US-16.AC-02', decision: 'changes-requested', reason: 'Clarify second outcome'}]; p.saveBatch();
  const r = p.importBatch(); assert.equal(r.code, 0, r.out);
  const definitions = p.config.gates.scoped_definitions.map(binding => JSON.parse(fs.readFileSync(path.join(p.root, `review/definitions/${binding.id}/1.json`), 'utf8')));
  assert.deepEqual(definitions.map(def => JSON.parse(fs.readFileSync(path.join(p.root, `review/gates/scoped/${def.id}/${def.scope.revision}.json`), 'utf8')).states.human), ['APPROVED', 'PENDING']);
  assert.match(p.gate('prd').raw, /^GATE: PENDING/);
});
test('missing authority, NA-only, self-grade and old semantic outcome never waive quality', t => {
  const p = batchFixture(t); const noAuthority = p.run(['--import-decision', 'decision.json', '--packet-data', 'packet-data.json']); assert.equal(noAuthority.code, 2, noAuthority.out);
  for (const mutate of [r => {r.review.independent = false;}, r => {r.review.criteria = [{id: 'tags', mandatory: true, score: 2, evidence: 'A-09 tag only'}];}, r => {r.freshness = 'STALE';}]) {
    const q = batchFixture(t); mutate(q.packet.evidence[0]); q.write('review/receipts/fixture-receipt.json', q.packet.evidence[0]); q.rebuildBatch();
    const r = q.importBatch(); assert.equal(r.code, 2, r.out);
  }
});
test('candidate build/base moves and incompatible drafts reject stale approval', t => {
  const p = batchFixture(t); const build = p.importBatch(['--build', 'new-build']); assert.equal(build.code, 3, build.out);
  const q = batchFixture(t); q.write('review/baseline.json', {id: 'baseline-2', head: 'new-base', manifest: q.packet.baseline.manifest}); const base = q.importBatch(); assert.equal(base.code, 3, base.out);
  const s = batchFixture(t); s.changeSet.candidate = {...s.changeSet.candidate, head: 'incompatible-draft'}; s.write(`review/changes/${s.changeSet.id}.json`, s.changeSet);
  const conflict = s.importBatch(); assert.equal(conflict.code, 3, conflict.out);
});
test('override parser rejects duplicate decisions with the same target', () => {
  assert.throws(() => resolveOverrides({default: 'approve', reason: 'r', overrides: [{id: 'US-16', decision: 'approve'}, {id: 'US-16', decision: 'defer'}]}, ['US-16.AC-01']), /duplicate/);
});
test('malformed aggregate gate blocks batch import before any approval mutation', t => {
  const p = batchFixture(t); const before = fs.readFileSync(path.join(p.root, 'review/audit.jsonl'));
  p.write('review/gates/prd.md', 'GATE: INVALID\n');
  const r = p.importBatch(); assert.equal(r.code, 3, r.out);
  assert.deepEqual(fs.readFileSync(path.join(p.root, 'review/audit.jsonl')), before);
  assert.equal(fs.existsSync(path.join(p.root, 'review/decisions/fixture-decision.json')), false);
});

test('content changed after scoped approval cannot be accepted by its old packet',t=>{
 const p=batchFixture(t);assert.equal(p.importBatch().code,0);
 const before=fs.readFileSync(path.join(p.root,'review/audit.jsonl'));
 p.write('us/US-16.md',fs.readFileSync(path.join(p.root,'us/US-16.md'),'utf8')+'\nChanged approved outcome.\n');
 const result=p.importBatch();assert.equal(result.code,3,result.out);assert.match(result.out,/Stale candidate member|bytes|source|packet/);
 assert.deepEqual(fs.readFileSync(path.join(p.root,'review/audit.jsonl')),before);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {appendAudit} from '../audit-store.mjs';
import {archiveBytes} from '../co-written-archive.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';

const FILE = 'spec/prd.txt';
// An open amendment against prd (a later stage edited prd's output after it settled), then the PO's batch import.
function withOpenAmendment(t, {goneBytes = false} = {}) {
  const p = batchFixture(t); p.config.stages.us.enabled = true; p.save();   // the writer of the edit is a later, enabled stage
  const before = archiveBytes(p.root, p.config, Buffer.from('Earlier prd text that the later stage replaced.\n'));
  const after = goneBytes ? sha256('bytes that are no longer in the file') : sha256(fs.readFileSync(path.join(p.root, FILE)));
  const event = appendAudit(p.root, {type: 'change', scope: {kind: 'artifact', ids: [FILE], revision: after}, before, after,
    refs: [FILE, 'us', 'edit', 'amends:prd'], reason: 'Co-declared output materialized: edit by us'});
  return {p, event};
}

test('the batch import ratifies an open amendment of an approved stage like decide --approve', t => {
  const {p, event} = withOpenAmendment(t);
  const r = p.importBatch(); assert.equal(r.code, 0, r.out);
  assert.equal(p.gate('prd').raw.split('\n')[0], 'GATE: APPROVED');
  const record = JSON.parse(fs.readFileSync(path.join(p.root, `review/transitions/amend-${event.id}.json`), 'utf8'));
  assert.deepEqual([record.kind, record.authority, record.decision, record.to.stage, record.from.stage], ['backward', 'po', 'fixture-decision', 'prd', 'us']);
  const events = fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const decision = events.find(e => e.id === 'fixture-decision');
  assert.equal(decision.actor, 'po@example.test'); assert.ok(decision.refs.includes(record.id));
  assert.deepEqual(events.find(e => e.type === 'transition').refs, [record.id, 'fixture-decision']);
});

test('the batch import refuses when the amended bytes are no longer in the file, like decide --approve', t => {
  const {p} = withOpenAmendment(t, {goneBytes: true});
  const r = p.importBatch(); assert.notEqual(r.code, 0);
  assert.match(r.out, /cannot ratify amendment .* no longer in the file/);
  assert.equal(p.gate('prd').raw.split('\n')[0], 'GATE: PENDING');
  assert.equal(fs.existsSync(path.join(p.root, 'review/transitions')), false);
});

test('the batch import refuses when the gate under approval records other bytes than the amended file', t => {
  const {p} = withOpenAmendment(t);
  const gate = p.gate('prd'); gate.data.outputs[FILE] = 'b'.repeat(64);
  fs.writeFileSync(path.join(p.root, 'review/gates/prd.md'), gate.raw.replace(/```gate-data\n[\s\S]*?\n```/, () => '```gate-data\n' + JSON.stringify(gate.data) + '\n```'));
  const r = p.importBatch(); assert.notEqual(r.code, 0);
  assert.match(r.out, /the gate under approval records bbbbbbbbbbbb, the amended file is/);
  assert.equal(fs.existsSync(path.join(p.root, 'review/transitions')), false);
});

test('decide.mjs and import-decision.mjs ratify through the same two functions', () => {
  for (const file of ['decide.mjs', 'import-decision.mjs']) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /import \{prepareAmendments, sealAmendments\} from '\.\/amendment-records\.mjs'/, file);
  }
});

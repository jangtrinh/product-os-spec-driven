import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadSourceLedger, ledgerMeasures } from '../lib/source-ledger-load.mjs';

const hex = (c) => c.repeat(64);
const item = (id, status, mappings, extra = {}) => ({ id, source: { file: 'src/a.md', line: 3 }, text_sha256: hex('a'), status, mappings, ...(status === 'exact' ? {} : { reason: 'why' }), ...extra });
function spec(t, ledger, crosswalk) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'provenance'), { recursive: true });
  if (ledger) fs.writeFileSync(path.join(root, 'provenance/source-ledger.json'), JSON.stringify(ledger));
  if (crosswalk) fs.writeFileSync(path.join(root, 'provenance/id-crosswalk.json'), JSON.stringify(crosswalk));
  return root;
}
const base = { version: 1, normalization: 'nfc-lf-trim-trailing-v1', crosswalk: 'id-crosswalk.json', summary: { source_preservation: { total: 3, preserved: 3 }, typed_coverage: { total: 3, mapped: 2 }, demo_coverage: { total: 3, passed: 0 } } };

test('no ledger is a disclosed absence, not an error', (t) => {
  const r = loadSourceLedger(spec(t)); assert.equal(r.declared, false); assert.deepEqual(r.errors, []);
});
test('a legacy item joins its crosswalk row and keeps the original spelling beside the immutable key', (t) => {
  const crosswalk = { version: 1, rows: [{ id: 'CW-1', legacy_id: 'SCN-PUB-01-02', family: 'scn-pub', canonical_kind: 'scenario', canonical_id: 'US-01.SCN-01-02', owner: 'US-01', source: { file: 'a.md', line: 1 }, assignment_rule: 'scenario-next' }] };
  const ledger = { ...base, items: [item('CW-1', 'exact', [{ kind: 'scenario', id: 'US-01.SCN-01-02' }], { crosswalk_row: 'CW-1' }), item('S-2', 'partial', [{ kind: 'ac', id: 'US-01.AC-01' }]), item('S-3', 'no-demo', [])] };
  const r = loadSourceLedger(spec(t, ledger, crosswalk));
  assert.deepEqual(r.errors, []); assert.equal(r.ledger.items[0].legacy.legacy_id, 'SCN-PUB-01-02'); assert.equal(r.ledger.items[0].id, 'CW-1');
});
test('an unresolved crosswalk join, a duplicate key and bad status/mapping combinations are errors', (t) => {
  const crosswalk = { version: 1, rows: [] };
  const ledger = { ...base, items: [item('CW-9', 'exact', [{ kind: 'ac', id: 'US-01.AC-01' }], { crosswalk_row: 'CW-9' }), item('D', 'exact', []), item('D', 'no-demo', [{ kind: 'ac', id: 'US-01.AC-01' }]), item('E', 'partial', [{ kind: 'ac', id: 'US-01.AC-01' }], { reason: '' })] };
  const msgs = loadSourceLedger(spec(t, ledger, crosswalk)).errors.map((e) => e.message).join('|');
  for (const needle of ['crosswalk row CW-9 not found', 'duplicate item id D', 'exact needs at least one mapping', 'no-demo cannot carry mappings', 'needs a reason']) assert.ok(msgs.includes(needle), needle);
});
test('the three measures keep their own inventories and are never merged', (t) => {
  const ledger = { ...base, items: [item('A', 'exact', [{ kind: 'ac', id: 'US-01.AC-01' }]), item('B', 'no-demo', []), item('C', 'partial', [{ kind: 'ac', id: 'US-01.AC-02' }])] };
  const m = ledgerMeasures(loadSourceLedger(spec(t, ledger, { version: 1, rows: [] })));
  assert.deepEqual(m.source.recomputed, { total: 3, preserved: 3 }); assert.deepEqual(m.typed.recomputed, { total: 3, mapped: 2 }); assert.equal(m.demo.recomputed, null);
  assert.deepEqual(m.byStatus, { exact: 1, partial: 1, conflicting: 0, 'no-demo': 1 });
});

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {digest, normalize, allocate, crosswalkErrors, ledgerErrors, legacyOutsideCrosswalk} = require('../source-provenance-contract.cjs');
const root = path.join(__dirname, '../fixtures/source-provenance');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const cw = read('crosswalk.json'), ledger = read('source-ledger.json');
const texts = fs.readFileSync(path.join(root, 'source.txt'), 'utf8').trimEnd().split('\n');
const context = {
  sourceItems: cw.rows.map((row, i) => ({id: row.id, ...row.source, text: texts[i]})),
  typedItems: cw.rows.map(row => ({kind: row.canonical_kind, id: row.canonical_kind + ':' + row.canonical_id})),
  demoItems: cw.rows.map(row => row.canonical_id), passedDemoItems: []
};
let count = 0;
const pass = (label, errors, red = false) => {
  assert.equal(errors.length > 0, red, label + ': ' + JSON.stringify(errors));
  console.log((red ? 'RED as expected ' : 'PASS ') + label); count++;
};
const mutate = (value, fn) => { const copy = structuredClone(value); fn(copy); return copy; };
const broad = read('typed-items-ledger.json');
pass('all 20 declared typed kinds', ledgerErrors(broad, cw, {
  sourceItems: [{id: broad.items[0].id, ...broad.items[0].source, text: texts[0]}],
  typedItems: broad.items[0].mappings, demoItems: [], passedDemoItems: []
}));
pass('all families deterministic', crosswalkErrors(cw));
pass('all source statuses preserved with distinct coverage', ledgerErrors(ledger, cw, context));
pass('unknown legacy family', crosswalkErrors(mutate(cw, x => x.rows[0].legacy_id = 'UNKNOWN-01')), true);
pass('duplicate canonical id', crosswalkErrors(mutate(cw, x => x.rows[1].canonical_id = x.rows[0].canonical_id)), true);
pass('duplicate legacy id', crosswalkErrors(mutate(cw, x => x.rows[1].legacy_id = x.rows[0].legacy_id)), true);
pass('wrong family rule', crosswalkErrors(mutate(cw, x => x.rows[0].assignment_rule = 'ac-next')), true);
pass('missing owner', crosswalkErrors(mutate(cw, x => delete x.rows[0].owner)), true);
pass('legacy id in body', legacyOutsideCrosswalk({body: 'See SCN-PUB-01-01.'}), true);
pass('legacy id in object key', legacyOutsideCrosswalk({'CTRL-01': true}), true);
pass('legacy id in ledger source key', ledgerErrors(mutate(ledger, x => x.items[0].id = 'EMAIL-01'), cw, context), true);
pass('non-exact status without reason', ledgerErrors(mutate(ledger, x => delete x.items[1].reason), cw, context), true);
pass('wrong source digest', ledgerErrors(mutate(ledger, x => x.items[0].text_sha256 = '0'.repeat(64)), cw, context), true);
pass('omitted source item', ledgerErrors(mutate(ledger, x => x.items.pop()), cw, context), true);
pass('duplicate source item', ledgerErrors(mutate(ledger, x => x.items.push(x.items[0])), cw, context), true);
pass('unresolved crosswalk row', ledgerErrors(mutate(ledger, x => x.items[0].crosswalk_row = 'CW-999'), cw, context), true);
pass('unresolved typed target', ledgerErrors(mutate(ledger, x => x.items[0].mappings[0].id = 'US-999.AC-01'), cw, context), true);
pass('wrong mapping kind', ledgerErrors(mutate(ledger, x => x.items[0].mappings[0].kind = 'ac'), cw, context), true);
pass('empty source text', ledgerErrors(ledger, cw, {...context, sourceItems: context.sourceItems.map((x, i) => i ? x : {...x, text: ''})}), true);
pass('missing crosswalk join', ledgerErrors(mutate(ledger, x => delete x.items[0].crosswalk_row), cw, context), true);
pass('duplicate typed target', ledgerErrors(mutate(ledger, x => x.items[0].mappings.push(x.items[0].mappings[0])), cw, context), true);
pass('source passed numerator transferred to demo', ledgerErrors(mutate(ledger, x => x.summary.demo_coverage.passed = 5), cw, context), true);
pass('source numerator transferred to typed', ledgerErrors(mutate(ledger, x => x.summary.typed_coverage.mapped = 5), cw, context), true);
assert.equal(normalize('e\u0301 \r\nline\t\r\n'), 'é\nline');
assert.equal(digest('e\u0301 \r\nline\t\r\n'), digest('é\nline'));
assert.notEqual(digest('é\nline'), digest('é\nLine'));
assert.deepEqual([...allocate([...cw.rows].reverse())].sort(), [...allocate(cw.rows)].sort());
assert.deepEqual([...allocate(cw.rows)], [...allocate(cw.rows)]);
const reserved = ['US-16.SCN-16-09', 'us:US-16', 'US-16.AC-10', 'S09', 'FB-08'];
const next = allocate(cw.rows, reserved);
assert.equal(next.get('CW-001'), 'US-16.SCN-16-10');
assert.equal(next.get('CW-003'), 'US-16.AC-11');
assert.equal(next.get('CW-004'), 'US-16.AC-12');
assert.equal(next.get('CW-002'), 'S10');
assert.equal(next.get('CW-005'), 'FB-09');
assert.throws(() => allocate(cw.rows, ['S99']), /namespace exhausted/);
console.log('PASS normalization, deterministic traversal/rerun, reserved/retired ids and exhaustion');
// Real-data read only: the observed source labels are classified; no source file is written.
const live = process.argv.find(arg => arg.startsWith('--source-root='))?.slice(14);
if (live) {
  const rows = [];
  for (const name of fs.readdirSync(path.join(live, 'us')).filter(x => /^US-\d+\.md$/.test(x)).sort()) {
    const text = fs.readFileSync(path.join(live, 'us', name), 'utf8');
    for (const match of text.matchAll(/\|\s*(SCN-PUB-\d{2}-\d{2})\s*\|/gm)) rows.push({
      id: 'CW-' + String(rows.length + 1).padStart(3, '0'), legacy_id: match[1], owner: name.slice(0, -3),
      source: {file: 'us/' + name, line: text.slice(0, match.index).split('\n').length}
    });
  }
  assert(rows.length > 0, 'real input scenario selection must be nonempty');
  const assigned = allocate(rows); assert.equal(new Set(assigned.values()).size, rows.length);
  console.log('PASS real source read only: ' + rows.length + ' scenario rows, unique canonical allocations');
} else console.log('NOT RUN real input: pass --source-root=<read-only source bundle>');
console.log('PASS source provenance semantic controls: ' + count);

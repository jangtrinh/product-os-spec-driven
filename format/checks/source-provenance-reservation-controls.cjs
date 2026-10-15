'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const contractPath = require.resolve('../source-provenance-contract.cjs');
const contract = require(contractPath);
const row = require('../fixtures/source-provenance/crosswalk.json').rows[0];
const candidate = {version: 1, rows: [row]};
const malformed = [
  'scenario:US-16.SCN\u2011ALT\u201109',
  'scenario:US-16.scn-alt-09',
  'scenario:US-16.UNKNOWN-09'
];
const unresolved = 'scenario:US-404.SCN-ALT-09';
if (process.argv.includes('--observe-pre-fix')) {
  for (const id of malformed) console.log(JSON.stringify({id,
    allocated: contract.allocate([row], [id]).get(row.id),
    oracle_errors: contract.crosswalkErrors(candidate, [id])}));
  process.exit(0);
}
for (const id of malformed) {
  assert.throws(() => contract.allocate([row], [id]), /X-CROSSWALK ambiguous occupied scenario/, id);
  assert(contract.crosswalkErrors(candidate, [id]).some(x => /X-CROSSWALK ambiguous occupied scenario/.test(x)),
    'oracle must independently refuse ' + id);
}
assert.throws(() => contract.allocate([row], [unresolved]), /X-CROSSWALK unresolved scenario owner/);
assert(contract.crosswalkErrors(candidate, [unresolved]).some(x => /X-CROSSWALK unresolved scenario owner/.test(x)));
assert.throws(() => contract.allocate([{...row, owner: 'US-404'}], [unresolved]), /unresolved scenario owner/,
  'source row ownership cannot declare an existing spec owner');
// Remove allocation from the oracle in memory; reservation validation must still reject.
const source = fs.readFileSync(contractPath, 'utf8');
const replaced = source.replace('expected = allocate(rows, reserved);',
  'expected = new Map(rows.map(row => [row.id, row.canonical_id]));');
assert.notEqual(replaced, source, 'independence control must disable allocator invocation');
const moduleCopy = {exports: {}};
vm.runInNewContext(replaced, {module: moduleCopy, require: createRequire(contractPath), Buffer},
  {filename: contractPath});
for (const id of [...malformed, unresolved]) assert(moduleCopy.exports.crosswalkErrors(candidate, [id]).length > 0,
  'oracle cannot rely on the allocator parser for ' + id);
assert.equal(contract.allocate([row], ['artifact:US-16.SCN-ALT-99']).get(row.id), row.canonical_id);
assert.deepEqual(contract.crosswalkErrors(candidate, ['artifact:US-16.SCN-ALT-99']), []);
assert.equal(contract.allocate([row], ['scenario:US-99.SCN-16-01', 'us:US-99']).get(row.id), 'US-16.SCN-16-02');
assert.equal(contract.allocate([row], [unresolved, 'us:US-404']).get(row.id), row.canonical_id);
console.log('RED malformed scenario reservations: Unicode dashes, lowercase, unresolved token');
console.log('RED unresolved scenario owner, including matching source owner; GREEN declared cross-owner alias and non-scenario namespace');
console.log('PASS independent oracle refusal with allocator bypassed');

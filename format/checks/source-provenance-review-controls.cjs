'use strict';
const assert = require('node:assert/strict');
const {allocate, crosswalkErrors, legacyOutsideCrosswalk} = require('../source-provenance-contract.cjs');
const row = require('../fixtures/source-provenance/crosswalk.json').rows[0];
const reserved = ['US-16.SCN-ALT-09', 'us:US-16'];
const bad = {version: 1, rows: [{...row, canonical_id: 'US-16.SCN-16-01'}]};
const badErrors = crosswalkErrors(bad, reserved);
if (process.argv.includes('--observe-pre-fix')) {
  console.log('Occupied alternate label: allocated=' + allocate([row], reserved).get(row.id));
  console.log('Wrong candidate errors=' + JSON.stringify(badErrors));
  for (const input of [{body: '<a id="SCN-PUB-01-01_link">x</a>'}, {'SCN-PUB-01-01_link': true}])
    console.log('Legacy leak errors=' + JSON.stringify(legacyOutsideCrosswalk(input)));
  process.exit(0);
}
if (!process.argv.includes('--control=legacy')) {
assert(badErrors.length > 0, 'wrong allocation with an occupied alternate label must be RED');
assert.equal(allocate([row], reserved).get(row.id), 'US-16.SCN-16-10');
assert.equal(allocate([row], ['scenario:US-16.SCN-OTHER-19', 'us:US-16']).get(row.id), 'US-16.SCN-16-20');
assert.equal(allocate([row], ['US-99.SCN-16-01', 'us:US-99']).get(row.id), 'US-16.SCN-16-02');
assert.equal(allocate([row], ['scenario:US-99.SCN-16-01', 'us:US-99']).get(row.id), 'US-16.SCN-16-02');
assert.deepEqual([...allocate([row], [...reserved, 'US-99.SCN-16-10', 'us:US-99'].reverse())],
  [...allocate([row], ['US-99.SCN-16-10', 'us:US-99', ...reserved])]);
assert.equal(allocate([row], [...reserved, 'US-99.SCN-16-10', 'us:US-99']).get(row.id), 'US-16.SCN-16-11');
assert.equal(allocate([row], ['US-16.SCN-ALT-999999999999999999', 'us:US-16']).get(row.id), 'US-16.SCN-16-1000000000000000000');
const feedback = require('../fixtures/source-provenance/crosswalk.json').rows[4];
assert.throws(() => allocate([feedback, {...feedback, id: 'CW-099', legacy_id: 'PD-1'}]), /ambiguous source ordering/);
assert.throws(() => allocate([row], ['SCN-ALT-09']), /ambiguous occupied scenario/);
assert.throws(() => allocate([row], ['US-16.SCN-ALT-09_alias']), /ambiguous occupied scenario/);
console.log('RED as expected wrong candidate for alternate occupied label: ' + JSON.stringify(badErrors));
console.log('PASS owner-wide suffixes, global occupied labels, graph aliases, deterministic order, ambiguity refusal');
}
if (!process.argv.includes('--control=allocation')) {
let attacks = 0;
for (const label of ['SCN-PUB-01-01', 'SCR-PUB-01', 'EMAIL-01', 'CTRL-01', 'PD-01']) {
  for (const suffix of ['_link', '-link', '.png', '.heading']) {
    for (const input of [{body: '<a id="' + label + suffix + '">x</a>'}, {[label + suffix]: true},
      {file: 'assets/' + label + suffix}, {heading: label.toLowerCase() + suffix}]) {
      assert(legacyOutsideCrosswalk(input).length > 0, 'legacy suffix leak ' + JSON.stringify(input)); attacks++;
    }
  }
  for (const prefix of ['prefix_', 'prefix-', 'prefix.']) {
    assert(legacyOutsideCrosswalk({[prefix + label]: true}).length > 0, 'legacy prefix key leak'); attacks++;
    assert(legacyOutsideCrosswalk({body: prefix + label.toLowerCase() + '_anchor'}).length > 0, 'legacy prefix body leak'); attacks++;
  }
}
assert.deepEqual(legacyOutsideCrosswalk({body: 'US-16.SCN-16-01 US-16.AC-01 S01 artifact:FB-01'}), []);
assert.deepEqual(legacyOutsideCrosswalk({body: 'xEMAIL-01 EMAIL-010 EMAIL-01x'}), []);
console.log('RED as expected legacy labels in anchors, JSON keys, filenames and heading slugs: ' + attacks);
}

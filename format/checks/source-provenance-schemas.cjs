'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require(process.env.SPEC_AJV_MODULE || 'ajv/dist/2020').default;
const root = path.resolve(__dirname, '..');
const ajv = new Ajv({strict: true, allErrors: true});
for (const keyword of ['x-spec-ref', 'x-spec-ref-reason', 'x-spec-exclusion'])
  ajv.addKeyword({keyword, valid: true});
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const crosswalk = ajv.compile(read('schema/id-crosswalk.schema.json'));
const ledger = ajv.compile(read('schema/source-ledger.schema.json'));
const controls = read('fixtures/source-provenance/schema-controls.json');
for (const {name, fixture, set, delete: remove, value, valid} of controls) {
  const payload = read("fixtures/source-provenance/" + fixture);
  const keys = set || remove;
  if (keys) {
    const owner = keys.slice(0, -1).reduce((node, key) => node[key], payload);
    if (remove) delete owner[keys.at(-1)]; else owner[keys.at(-1)] = value;
  }
  const check = name.startsWith('crosswalk') ? crosswalk : ledger;
  assert.equal(check(payload), valid, name + ': ' + JSON.stringify(check.errors));
  console.log((valid ? 'PASS ' : 'RED as expected ') + name);
}
console.log('PASS source provenance schema shapes: ' + controls.length);

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const schema = path.join(__dirname, 'schema/id-crosswalk.schema.json');
const shapes = path.join(__dirname, 'reference-registry-new-schema-shapes.json');
const registry = path.join(__dirname, 'reference-registry.json');
const originals = new Map([schema, shapes, registry].map(file => [file, fs.readFileSync(file)]));
const read = file => JSON.parse(originals.get(file));
const cases = [
  ['widen legacy grammar', schema, value => {
    value.properties.rows.items.properties.legacy_id.pattern = '^.*$';
  }, 'unreviewed exclusion shape'],
  ['legacy exemption at an unrelated leaf', schema, value => {
    value.properties.rows.items.properties.family['x-spec-exclusion'].category = 'legacy-id';
  }, 'unrelated legacy literal owner'],
  ['unreviewed literal shape', schema, value => {
    value.properties.rows.items.properties.family.enum.push('unknown');
  }, 'unreviewed exclusion shape'],
  ['tampered new baseline', shapes, value => {
    value['id-crosswalk.schema.json'].properties.rows.items.properties.family.enum.push('unknown');
  }, 'unreviewed new-schema baseline bytes'],
  ['reverse canonical provenance', registry, value => {
    value.entries.find(e => e.id === 'crosswalk-canonical-id').edge = {from: 'source', to: 'target'};
  }, 'source-contract direction'],
  ['causal canonical provenance', registry, value => {
    const entry = value.entries.find(e => e.id === 'crosswalk-canonical-id');
    entry.relation = 'uses'; entry.causal = true; entry.effect = 'edge';
  }, 'source-contract relation'],
  ['missing ledger mapping entry', registry, value => {
    value.entries = value.entries.filter(e => e.id !== 'source-ledger-mapping-id');
  }, 'missing registry entry source-ledger-mapping-id']
];
try {
  for (const [label, file, change, expected] of cases) {
    const value = read(file); change(value);
    fs.writeFileSync(file, JSON.stringify(value));
    const result = spawnSync(process.execPath, ['format/checks/reference-registry-coverage.cjs'], {
      cwd: root, env: process.env, encoding: 'utf8'
    });
    for (const [target, bytes] of originals) fs.writeFileSync(target, bytes);
    assert.equal(result.status, 1, label + ': ' + result.stdout + result.stderr);
    assert((result.stdout + result.stderr).includes(expected), label + ' wrong rejection');
    for (const [target, bytes] of originals) assert(fs.readFileSync(target).equals(bytes), 'restore ' + target);
    console.log('RED as expected ' + label + '; exit=1; bytes restored');
  }
} finally {
  for (const [target, bytes] of originals) fs.writeFileSync(target, bytes);
}
console.log('PASS 7/7 new registry attacks rejected; all bytes restored');

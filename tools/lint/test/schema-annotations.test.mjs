import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkSchemas, validate} from '../../lib/schema-lite.mjs';
import {lintSpec} from '../index.mjs';
import {EXAMPLE} from '../self-test.mjs';

const installed = fileURLToPath(new URL('../../../format/schema/', import.meta.url));
function schemaFixture(t, edit) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-schema-annotations-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  fs.cpSync(installed, directory, {recursive: true});
  const file = path.join(directory, 'manifest.schema.json');
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(schema);
  fs.writeFileSync(file, JSON.stringify(schema));
  return directory;
}

test('registry schema annotations compile without imposing payload assertions', t => {
  const directory = schemaFixture(t, schema => {
    schema['x-spec-ref'] = false;
    schema['x-spec-ref-reason'] = 'Fixture annotation without an assertion.';
    schema['x-spec-exclusion'] = {type: 'unknown-schema-type', properties: {payload: {unsupportedKeyword: true}}};
    schema['x-spec-review-note'] = {not: {}, type: 'unknown-schema-type'};
  });
  const registry = checkSchemas(directory);
  const schema = registry['manifest.schema.json'];
  const original = JSON.parse(fs.readFileSync(path.join(installed, 'manifest.schema.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(EXAMPLE, 'spec.manifest.json'), 'utf8'));
  assert.deepEqual(validate(manifest, schema, '', [], schema, registry), []);
  for (const value of [manifest, {format: '2'}, {format: '1'}, null]) {
    assert.deepEqual(validate(value, schema, '', [], schema, registry), validate(value, original, '', [], original, registry));
  }
  const result = lintSpec(EXAMPLE, {schemaDir: directory});
  assert.equal(result.problems.errors.some(p => p.code === 'E-SCHEMA'), false, JSON.stringify(result.problems.list));
});

test('an unknown non-annotation schema keyword still fails E-SCHEMA', t => {
  const directory = schemaFixture(t, schema => {schema.properties.format.unknownValidationKeyword = true;});
  const result = lintSpec(EXAMPLE, {schemaDir: directory});
  assert.equal(result.exitCode, 2);
  assert.ok(result.problems.errors.some(p => p.code === 'E-SCHEMA' && p.message.includes('unknownValidationKeyword')), JSON.stringify(result.problems.list));
});

for (const [keyword, value] of [['x-spec-ref', 3], ['x-spec-ref-reason', false], ['x-spec-exclusion', []]]) {
  test(`registered annotation ${keyword} retains its declared schema value type`, t => {
    const directory = schemaFixture(t, schema => {schema[keyword] = value;});
    const result = lintSpec(EXAMPLE, {schemaDir: directory});
    assert.equal(result.exitCode, 2);
    assert.ok(result.problems.errors.some(p => p.code === 'E-SCHEMA' && p.message.includes(keyword)), JSON.stringify(result.problems.list));
  });
}

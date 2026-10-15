import test from 'node:test';
import assert from 'node:assert/strict';
import {parseYaml} from '../../lib/config/yaml-parser.mjs';
import {parseJson, canonical} from '../../lib/config/strict-json.mjs';
import {validateConfig} from '../../lib/config/config-loader.mjs';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

test('YAML block and flow maps/sequences preserve boolean types and command quotes', () => {
  const config = parseYaml(`roles:\n  po: {enabled: true, gate: false}\nevals:\n  us:\n    - run: node check.mjs --name "a:b # c"\n      per_file: us/US-*.md\ncontext: [input/a.md, 'input/b.md']\n`);
  assert.equal(config.roles.po.enabled, true);
  assert.equal(config.evals.us[0].run, 'node check.mjs --name "a:b # c"');
  assert.equal(config.evals.us[0].per_file, 'us/US-*.md');
  assert.deepEqual(config.context, ['input/a.md', 'input/b.md']);
});
test('duplicate JSON/YAML keys and unsupported YAML constructs fail closed', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":{"x":1,"x":2}}']) assert.throws(() => parseJson(text), /duplicate/);
  for (const text of ['a: 1\na: 2', 'a: {x: 1, x: 2}', 'a: &anchor']) assert.throws(() => parseYaml(text), /duplicate|unsupported/);
  assert.throws(() => parseJson('{"a":1e999}'), /non-finite/);
  assert.equal(canonical({z: 1, a: {b: 2, a: 1}}), '{"a":{"a":1,"b":2},"z":1}');
});
test('malformed config names the bad key rather than coercing booleans', t => {
  assert.throws(() => validateConfig({version: 2, project: {name: 'x', doc_language: 'en', spec_root: 'spec', us_prefix: ''}, roles: {po: {enabled: 'on', gate: true}, qc: {enabled: false, gate: true}, dev: {enabled: false, gate: true}}}), /roles.po.enabled/);
  const p = projectFixture(t); p.config.gates.scoped_definitions = {invalid: true};
  assert.throws(() => validateConfig(p.config), /Bad config gates.scoped_definitions/);
});

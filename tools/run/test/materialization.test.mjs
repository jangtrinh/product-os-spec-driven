import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {materialize, WriterFailure} from '../materialize-output.mjs';
import {localPath, selectFiles, writeLocal} from '../../lib/config/path-selection.mjs';
import {schema, validateSchema} from '../../lib/config/schema-validation.mjs';
import {candidateFor} from '../registries.mjs';

test('multi-output writer materializes complete files JSON atomically', t => {
  const p = projectFixture(t); const outputs = ['spec/a.txt', 'spec/b.txt'];
  materialize(p.root, outputs, 'Explanation\n```files\n{"spec/a.txt":"a","spec/b.txt":"b"}\n```\n');
  assert.equal(fs.readFileSync(path.join(p.root, outputs[0]), 'utf8'), 'a'); assert.equal(fs.readFileSync(path.join(p.root, outputs[1]), 'utf8'), 'b');
  for (const malformed of ['```files\n{"spec/a.txt":"new"}\n```\n', '```files\n{"spec/a.txt":"new","spec/a.txt":"dup","spec/b.txt":"b"}\n```\n', '```files\n{"spec/a.txt":"new","../escape":"x"}\n```\n', '```files\n{}\n```\n```files\n{}\n```\n']) {
    assert.throws(() => materialize(p.root, outputs, malformed), WriterFailure);
    assert.equal(fs.readFileSync(path.join(p.root, outputs[0]), 'utf8'), 'a');
  }
});
test('path traversal, absolute and symlink escapes fail before writing', t => {
  const p = projectFixture(t); fs.symlinkSync('/tmp', path.join(p.root, 'outside'));
  for (const file of ['/tmp/a', '../a', 'a/../../b', 'outside/escape.txt']) assert.throws(() => localPath(p.root, file), /Invalid|escapes/);
});
test('directory/glob selection sorted with negative controls', t => {
  const p = projectFixture(t); p.write('source/b.txt', 'b'); p.write('source/a.txt', 'a'); p.write('source/nested/c.txt', 'c');
  assert.deepEqual(selectFiles(p.root, 'source/**/*.txt'), ['source/a.txt', 'source/b.txt', 'source/nested/c.txt']);
  assert.throws(() => selectFiles(p.root, 'source/missing-*'), /empty/);
  const candidate = candidateFor(p.root, {scope: {kind: 'artifact', ids: ['source'], revision: 'before'}, inputs: ['source/**/*.txt'], outputs: []});
  assert.deepEqual(Object.keys(candidate.manifest.members[0].artifacts), ['source/a.txt', 'source/b.txt', 'source/nested/c.txt']);
});
test('schema validator rejects unexecuted CURRENT, impossible UTC and unknown fields', () => {
  const defs = schema('model-common.schema.json').$defs;
  assert.throws(() => validateSchema('2026-02-30T00:00:00Z', defs.utc), /UTC/);
  assert.throws(() => validateSchema({id: 'x', mandatory: true, score: 2, evidence: 'x', surprise: true}, defs.criterion), /unknown/);
  assert.throws(() => validateSchema({id: 'x', mandatory: true, applicability: 'na', score: 2, evidence: 'x', reason: 'r', confirmer: 'po'}, defs.criterion), /null/);
});
test('manual --paste first invocation yields gate PENDING and exit 2', t => {
  const p = projectFixture(t); p.config.agents.writer.command = 'manual'; p.save(); p.write('pasted.txt', 'Generated prd\n');
  const r = p.run(['--paste', 'pasted.txt']); assert.equal(r.code, 2, r.out); assert.match(r.out, /Fixture stage prd/); assert.match(p.gate('prd').raw, /^GATE: PENDING/);
});
test('malformed multi-output writer consumes persisted fix cap without partial files', t => {
  const p = projectFixture(t); p.definitions.prd.outputs = ['spec/a.txt', 'spec/b.txt'];
  p.config.agents.writer.command = command({rawResult: '```files\n{"spec/a.txt":"partial"}\n```\n'}); p.save();
  const r = p.run(); assert.equal(r.code, 2, r.out); assert.match(r.out, /Fix cap exhausted/);
  assert.equal(fs.existsSync(path.join(p.root, 'spec/a.txt')), false);
  const state = JSON.parse(fs.readFileSync(path.join(p.root, 'review/runtime/prd.json'), 'utf8'));
  assert.equal(state.rounds.eval_fix, 3); assert.equal(state.rounds.review, 0);
});

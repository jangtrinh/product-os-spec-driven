import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {clarifyExpectedRules} from '../rules-clarify-expected.mjs';
import {emptyAnswers} from '../../run/answer-source.mjs';
import {loadReferenceRegistry} from '../../lib/census-registry.mjs';
import {endpointContext} from '../../lib/census-endpoint-context.mjs';
import {qualifyEndpoint} from '../../lib/census-reference-resolution.mjs';
import {checkSchemas, validate} from '../../lib/schema-lite.mjs';

test('answered clarification joins the exact PO source row and rejects changed answer, identity, date or question', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'answer-join-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.mkdirSync(path.join(root, 'input')); fs.writeFileSync(path.join(root, 'input/answers.md'), emptyAnswers + '| Q-001 | Personal | po@example.test | 2026-10-13 | PO choice |\n');
  const q = {id: 'Q-001', question: 'Personal or shared?', options: ['Personal', 'Shared'], recommended: 0, depends_on: [], status: 'answered', answer: 'Personal', decided_by: 'po@example.test', decided_at: '2026-10-13T00:00:00Z', decision_ref: 'input/answers.md#Q-001'};
  const check = record => {
    const problems = [];
    clarifyExpectedRules({decisions: [], options: {projectRoot: root}}, {add: (...args) => problems.push(args)}, {clarify: [{file: 'records/clarify/Q-001.json', value: record}], expected: []});
    return problems;
  };
  assert.deepEqual(check(q), []);
  for (const mutate of [r => r.answer = 'Shared', r => r.decided_by = 'dev@example.test', r => r.decided_at = '2026-10-14T00:00:00Z', r => r.decision_ref = 'input/answers.md#Q-999', r => r.id = 'Q-002']) {
    const bad = structuredClone(q); mutate(bad); assert.ok(check(bad).some(p => p[0] === 'Q-CLARIFY'));
  }
  fs.unlinkSync(path.join(root, 'input/answers.md')); assert.ok(check(q).some(p => p[0] === 'Q-CLARIFY'));
});
for (const decided_at of ['2026-10-13T00:00:00.000Z', '2026-10-13T00:00:00+00:00']) {
  test(`answered clarification joins the PO source at the same UTC instant: ${decided_at}`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'answer-instant-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.mkdirSync(path.join(root, 'input')); fs.writeFileSync(path.join(root, 'input/answers.md'), emptyAnswers + '| Q-001 | Personal | po@example.test | 2026-10-13 | PO choice |\n');
    const q = {id: 'Q-001', stage: 'clarify', round: 1, asked_at: '2026-10-12T00:00:00Z', question: 'Personal or shared?', options: ['Personal', 'Shared'], recommended: 0, depends_on: [], status: 'answered', answer: 'Personal', decided_by: 'po@example.test', decided_at, decision_ref: 'input/answers.md#Q-001'};
    const registry = checkSchemas(), schema = registry['clarify-record.schema.json'];
    assert.deepEqual(validate(q, schema, '', [], schema, registry), []);
    for (const invalid of ['2026-02-30T00:00:00+00:00', '2026-10-13T24:00:00+00:00', '2026-10-13T00:60:00+00:00', '2026-10-13T00:00:00+01:00']) {
      assert.ok(validate({...q, decided_at: invalid}, schema, '', [], schema, registry).length > 0, `reject invalid/non-UTC timestamp: ${invalid}`);
    }
    assert.ok(validate(decided_at, registry['model-common.schema.json'].$defs.utc).length === (decided_at.endsWith('Z') ? 0 : 1), 'explicit Z-only schema pattern remains enforced');
    const check = record => {
      const problems = [];
      clarifyExpectedRules({decisions: [], options: {projectRoot: root}}, {add: (...args) => problems.push(args)}, {clarify: [{file: 'records/clarify/Q-001.json', value: record}], expected: []});
      return problems;
    };
    assert.deepEqual(check(q), []);
    for (const changed of ['2026-10-13T00:00:00.001Z', '2026-10-13T00:00:00+01:00', '2026-10-14T00:00:00+00:00', 'invalid', undefined]) {
      assert.ok(check({...q, decided_at: changed}).some(p => p[0] === 'Q-CLARIFY'), `reject changed or invalid instant: ${changed}`);
    }
  });
}
test('clarification census keeps legacy ruling IDs and uses the project-relative PO source as an artifact prerequisite', () => {
  const entry = loadReferenceRegistry().entries.find(e => e.id === 'clarify-record-decision-ref');
  const resolve = value => {
    const context = {root: null, specBase: 'spec', pathBase: 'spec', docs: [], identities: new Map(), data: {id: 'Q-001'}, file: 'spec/records/clarify/Q-001.json'};
    const tokens = endpointContext(entry, {value, owner: context.data}, context)[0];
    return qualifyEndpoint(entry.target.id, tokens);
  };
  assert.equal(resolve('D1'), 'decision:D1');
  assert.equal(resolve('input/answers.md#Q-001'), 'artifact:input/answers.md#Q-001');
});

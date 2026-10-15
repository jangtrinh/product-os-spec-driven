import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {outputPatternFromToken, concreteOutputs} from '../../lib/output-patterns.mjs';
import {materialize, WriterFailure} from '../materialize-output.mjs';
import {declaredOutputs} from '../project-registries.mjs';
import {loadRegistries} from '../registries.mjs';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';
import {init} from '../init.mjs';
import {fileURLToPath} from 'node:url';

const fence = files => '```files\n' + JSON.stringify(files) + '\n```\n';

// Expected filenames are literal independent observations, never conversions
// made by the helper under test.
for (const [suffix, unrelated] of [
  ['(.md', 'US-1.md'], ['[.md', 'US-1.md'], ['*.md', 'US-.md'],
  ['+.md', 'US-11.md'], ['?.md', 'US-.md'], ['{2}.md', 'US-11.md'],
  ['^.md', 'US-1.md'], ['$.md', 'US-1.md'], ['\\d.md', 'US-12.md'],
  ['|evil.md', 'evil.md'], [').md', 'US-1.md'], ['].md', 'US-1.md'],
]) test(`placeholder suffix ${JSON.stringify(suffix)} is literal text`, () => {
  const source = outputPatternFromToken(`spec/us/<US-id>${suffix}`);
  const matcher = new RegExp(`^(?:${source})$`);
  assert.equal(matcher.test(`spec/us/US-1${suffix}`), true);
  assert.equal(matcher.test(`spec/us/${unrelated}`), false);
});

test('known placeholders retain their exact filename language', () => {
  for (const [token, accepted, rejected] of [
    ['spec/us/<US-id>.md', ['spec/us/US-1.md', 'spec/us/US-P2.md', 'spec/us/NF-3.md'], ['spec/us/evil.md', 'spec/us/US-1.md.bak', 'spec/us/US-1.md\n']],
    ['spec/readable/epic-<n>.md', ['spec/readable/epic-2.md'], ['spec/readable/epic-x.md']],
    ['spec/readable/epic-<nnn>.md', ['spec/readable/epic-123.md'], ['spec/readable/epic-x.md']],
    ['spec/tests/<declared-test-path>', ['spec/tests/save.spec.js', 'spec/tests/nested/save.spec.js'], ['spec/tests/../save.spec.js', 'spec/tests/save.spec.js.bak!']],
  ]) {
    const matcher = new RegExp(`^(?:${outputPatternFromToken(token)})$`);
    for (const file of accepted) assert.equal(matcher.test(file), true, file);
    for (const file of rejected) assert.equal(matcher.test(file), false, file);
  }
  assert.equal(outputPatternFromToken('spec/<unknown>/<US-id>.md'), null);
  assert.equal(outputPatternFromToken('spec/<US-id>/<unknown>.md'), null);
});

test('prompt alternation cannot admit an unrelated writer file or inventory member', t => {
  const p = projectFixture(t, ['us']);
  p.write('prompts/us.md', '## Output files\n- `spec/us/<US-id>.md|spec/us/evil.md`\n');
  const outputs = [outputPatternFromToken('spec/us/<US-id>.md|spec/us/evil.md')];
  assert.throws(() => materialize(p.root, outputs, fence({'spec/us/evil.md': 'injected'})), WriterFailure);
  assert.equal(fs.existsSync(path.join(p.root, 'spec/us/evil.md')), false);
  p.write('spec/us/evil.md', 'unrelated existing artifact');
  assert.deepEqual(concreteOutputs(p.root, outputs), []);
});

test('prompt alternation fails init with the offending prompt and token before definition write', t => {
  const p = projectFixture(t, ['us']);
  const kit = fileURLToPath(new URL('../../../', import.meta.url));
  for (const stage of Object.keys(p.config.stages)) p.write(`prompts/${stage}.md`, fs.readFileSync(path.join(kit, `prompts/${stage}.md`), 'utf8'));
  p.write('prompts/us.md', '## Output files\n- `spec/us/<US-id>.md|spec/us/evil.md`\n');
  const definition = path.join(p.root, 'review/definitions/gate-us/1.json');
  fs.rmSync(definition);
  const lines = [];
  const code = init(['--project', p.root, '--name', 'Literal output control', '--lang', 'en', '--force'], line => lines.push(line));
  const out = lines.join('\n');
  assert.equal(code, 3, out);
  assert.ok(out.includes('prompts/us.md'), out);
  assert.ok(out.includes('spec/us/<US-id>.md|spec/us/evil.md'), out);
  assert.equal(fs.existsSync(definition), false);
  assert.equal(fs.existsSync(path.join(p.root, 'spec/us/evil.md')), false);
  assert.equal(fs.existsSync(path.join(p.root, 'review/gates/us.md')), false);
});

test('legitimate story, numeric and declared test placeholders register and run to PENDING', t => {
  const p = projectFixture(t, ['tdd']);
  p.write('prompts/tdd.md', '## Output files\n- `spec/tests/<declared-test-path>`\n- `spec/us/<US-id>.md`\n- `spec/readable/epic-<n>.md`\n');
  p.definitions.tdd.outputs = declaredOutputs(p.root, 'tdd');
  const files = {'spec/tests/nested/save.spec.js': 'test bytes', 'spec/us/US-P2.md': 'story bytes', 'spec/readable/epic-3.md': 'epic bytes'};
  p.config.roles.qc.enabled = true;
  p.config.agents.writer.command = command({rawResult: fence(files)});
  p.config.evals.tdd = [{run: command({eval: true}) + ' "spec/tests/nested/save.spec.js"'}];
  p.save();
  loadRegistries(p.root, p.config);
  const result = p.run();
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /tdd: GATE: PENDING/);
  for (const [file, content] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(p.root, file), 'utf8'), content);
  assert.equal(p.gate('tdd').data.model.states.eval, 'PASS');
  assert.equal(p.gate('tdd').data.model.states.review, 'PASS');
});

test('materialization and inventory match escaped directory and filename punctuation', t => {
  const p = projectFixture(t);
  const outputs = [outputPatternFromToken('spec/dir(+[x]/<US-id>?.md')];
  const file = 'spec/dir(+[x]/US-1?.md';
  assert.deepEqual(materialize(p.root, outputs, fence({[file]: 'literal punctuation'})), [file]);
  p.write('spec/dir(+[x]/US-.md', 'unrelated');
  assert.deepEqual(concreteOutputs(p.root, outputs), [file]);
});

test('materialization groups complete allocated declarations when anchoring', t => {
  const p = projectFixture(t);
  const outputs = ['spec/us/(?:US-[0-9]+)[.]md|spec/us/NF-[0-9]+[.]md'];
  for (const file of ['spec/us/US-1.md.bak', 'spec/us/prefixspec/us/NF-1.md']) {
    assert.throws(() => materialize(p.root, outputs, fence({[file]: 'unrelated'})), WriterFailure);
    p.write(file, 'existing unrelated');
  }
  assert.deepEqual(concreteOutputs(p.root, outputs), []);
});

const collisions = [
  ['allocated case', ['spec/tests/Save.spec.js', 'spec/tests/save.spec.js'], ['spec/tests/<declared-test-path>']],
  ['literal Unicode normalization', ['spec/caf\u00e9.md', 'spec/cafe\u0301.md'], null],
  ['literal case', ['spec/Save.md', 'spec/save.md'], null],
  ['literal normalization and case', ['spec/CAF\u00c9.md', 'spec/cafe\u0301.md'], null],
  ['mixed literal and allocated case', ['spec/tests/Save.spec.js', 'spec/tests/save.spec.js'], ['spec/tests/Save.spec.js', 'spec/tests/<declared-test-path>']],
];

for (const [label, pair, tokens] of collisions) test(`${label} collision rejects the entire map before writes`, t => {
  const p = projectFixture(t);
  p.write('spec/sentinel.md', 'original sentinel');
  const outputs = ['spec/sentinel.md', ...(tokens ? tokens.map(outputPatternFromToken) : pair)];
  const files = {'spec/sentinel.md': 'changed sentinel', [pair[0]]: 'first', [pair[1]]: 'second'};
  assert.throws(() => materialize(p.root, outputs, fence(files)), error => {
    assert.ok(error instanceof WriterFailure);
    assert.match(error.message, /collision/i);
    for (const file of pair) assert.ok(error.message.includes(file), error.message);
    return true;
  });
  assert.equal(fs.readFileSync(path.join(p.root, 'spec/sentinel.md'), 'utf8'), 'original sentinel');
  for (const file of pair) assert.equal(fs.existsSync(path.join(p.root, file)), false, file);
});

for (const [label, stage, pair, tokens] of [
  ['allocated case', 'tdd', ['spec/tests/Save.spec.js', 'spec/tests/save.spec.js'], ['spec/tests/<declared-test-path>']],
  ['literal Unicode normalization', 'us', ['spec/caf\u00e9.md', 'spec/cafe\u0301.md'], null],
]) test(`${label} collision fails the stage without materializing outputs`, t => {
  const p = projectFixture(t, [stage]);
  const files = {'spec/sentinel.md': 'changed sentinel', [pair[0]]: 'first', [pair[1]]: 'second'};
  p.write('spec/sentinel.md', 'original sentinel');
  p.definitions[stage].outputs = ['spec/sentinel.md', ...(tokens ? tokens.map(outputPatternFromToken) : pair)];
  p.config.roles.qc.enabled = true;
  p.config.agents.writer.command = command({rawResult: fence(files)});
  p.config.evals[stage] = [{run: command({eval: true}) + ' "spec/sentinel.md"'}];
  p.save();
  loadRegistries(p.root, p.config);
  const result = p.run();
  assert.equal(result.code, 2, result.out);
  assert.match(result.out, /Fix cap exhausted/);
  const state = JSON.parse(fs.readFileSync(path.join(p.root, `review/runtime/${stage}.json`), 'utf8'));
  assert.match(state.repair_reason, /collision/i);
  for (const file of pair) assert.ok(state.repair_reason.includes(file), state.repair_reason);
  assert.doesNotMatch(result.out, /GATE: PENDING/);
  assert.equal(fs.existsSync(path.join(p.root, `review/gates/${stage}.md`)), false);
  assert.equal(fs.readFileSync(path.join(p.root, 'spec/sentinel.md'), 'utf8'), 'original sentinel');
  for (const file of pair) assert.equal(fs.existsSync(path.join(p.root, file)), false);
});

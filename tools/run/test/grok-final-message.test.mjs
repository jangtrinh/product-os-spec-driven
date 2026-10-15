import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseReview} from '../review-results.mjs';
const kit = fileURLToPath(new URL('../../../', import.meta.url));
const wrapper = path.join(kit, 'tools/agents/grok-reviewer');
const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
function splitSaved(name) {
  const raw = fs.readFileSync(path.join(fixtureDir, name));
  const text = raw.toString('utf8');
  const at = text.indexOf('VERDICT:');
  assert.ok(at > 0, name);
  return {raw, progress: text.slice(0, at), final: text.slice(at)};
}
function assistant(text, stopReason = 'end_turn', content = null) {
  return {
    type: 'assistant',
    message: {
      id: 'msg', type: 'message', role: 'assistant', model: 'grok-4.7',
      content: content ?? [{type: 'text', text}],
      stop_reason: stopReason, stop_sequence: null,
      usage: {input_tokens: 3, output_tokens: 2},
    },
    parent_tool_use_id: null, session_id: 's',
  };
}
function resultLine(text, extra = {}) {
  return {
    type: 'result', subtype: 'success', is_error: false, num_turns: 2,
    result: text, stop_reason: 'end_turn',
    usage: {input_tokens: 12, output_tokens: 4}, session_id: 's', ...extra,
  };
}
const initLine = {type: 'system', subtype: 'init', session_id: 's', model: 'grok-4.7', tools: [], skills: [], mcp_servers: []};
const ndjson = records => records.map(record => JSON.stringify(record)).join('\n') + '\n';
function harness(t, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-grok-p12e-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const cli = path.join(root, 'grok');
  const seen = path.join(root, 'seen.bin');
  const argsFile = path.join(root, 'args.json');
  const stdoutFile = path.join(root, 'stdout.ndjson');
  fs.writeFileSync(stdoutFile, body);
  fs.writeFileSync(cli, `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);const prompt=fs.readFileSync(args[args.indexOf('--prompt-file')+1]);fs.writeFileSync(process.env.GROK_DOUBLE_SEEN,prompt);fs.writeFileSync(process.env.GROK_DOUBLE_ARGS,JSON.stringify(args));process.stdout.write(fs.readFileSync(process.env.GROK_DOUBLE_STDOUT));\n`);
  fs.chmodSync(cli, 0o755);
  const env = {...process.env, GROK_DOUBLE_SEEN: seen, GROK_DOUBLE_ARGS: argsFile, GROK_DOUBLE_STDOUT: stdoutFile};
  return {
    root, seen, argsFile,
    call(input, extra = []) {
      const metric = path.join(root, 'metrics.jsonl');
      const result = spawnSync(process.execPath, [wrapper, '--cli', cli, '--metrics', metric, ...extra], {input, encoding: 'utf8', timeout: 10000, env, maxBuffer: 20 * 1024 * 1024});
      return {result, metric};
    },
  };
}
for (const name of ['p13-intake-review-1.txt', 'p13-intake-review-1-format-repair.txt']) {
  test(`grok wrapper returns only the final assistant message from ${name}`, t => {
    const saved = splitSaved(name);
    const body = ndjson([
      initLine,
      assistant(saved.progress, 'tool_use', [{type: 'text', text: saved.progress}, {type: 'tool_use', id: 'call_1', name: 'read_file', input: {path: 'spec/intake/intake.md'}}]),
      {type: 'user', message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 'call_1', content: 'cut', is_error: false}]}, parent_tool_use_id: null, session_id: 's'},
      assistant(saved.final),
      resultLine(saved.final),
    ]);
    const p = harness(t, body);
    const {result, metric} = p.call('review the intake\n');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, saved.final);
    assert.equal(result.stdout.includes(saved.progress), false);
    assert.equal(parseReview(result.stdout, true).verdict, 'NEEDS_CHANGES');
    const args = JSON.parse(fs.readFileSync(p.argsFile, 'utf8'));
    assert.equal(args[args.indexOf('--output-format') + 1], 'streaming-messages-json');
    assert.equal(args.includes('--include-partial-messages'), false);
    assert.equal(args[args.indexOf('--tools') + 1], 'read_file,grep,list_dir');
    const advertised = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'grok-structured-review.ndjson'), 'utf8').split('\n')[0]).tools;
    const removed = args[args.indexOf('--disallowed-tools') + 1].split(',');
    const allowedReadTools = new Set(['read_file', 'grep', 'list_dir']);
    for (const tool of [...advertised, 'run_terminal_cmd']) {
      if (allowedReadTools.has(tool)) assert.equal(removed.includes(tool), false, tool);
      else assert.ok(removed.includes(tool), tool);
    }
    const row = JSON.parse(fs.readFileSync(metric, 'utf8'));
    assert.equal(row.input_bytes, Buffer.byteLength('review the intake\n'));
    assert.equal(row.output_bytes, Buffer.byteLength(saved.final));
  });
}
test('intermediate read_file tool_use then final end_turn returns only the final message', t => {
  const final = 'VERDICT: PASS\n';
  const body = ndjson([
    initLine,
    assistant('reading omitted prompt', 'tool_use', [{type: 'text', text: 'reading omitted prompt'}, {type: 'tool_use', id: 'call_read', name: 'read_file', input: {path: 'prompt.txt'}}]),
    {type: 'user', message: {role: 'user', content: [{type: 'tool_result', tool_use_id: 'call_read', content: 'rest of prompt', is_error: false}]}, parent_tool_use_id: null, session_id: 's'},
    assistant(final),
    resultLine(final),
  ]);
  const {result} = harness(t, body).call('review the spec\n');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, final);
});
test('concatenated json text is not an isolable final message', t => {
  const saved = splitSaved('p13-intake-review-1.txt');
  const p = harness(t, JSON.stringify({text: saved.raw.toString('utf8'), stopReason: 'end_turn', usage: {input_tokens: 12, output_tokens: 4}, sessionId: 'NEVER_LOG_THIS'}) + '\n');
  const {result} = p.call('source');
  assert.equal(result.status, 4, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /isolable final message/);
  assert.doesNotMatch(result.stderr, /VERDICT|NEVER_LOG_THIS/);
});
test('a stream whose result text disagrees with the last assistant message fails', t => {
  const saved = splitSaved('p13-intake-review-1.txt');
  const p = harness(t, ndjson([initLine, assistant(saved.progress), assistant(saved.final), resultLine(saved.raw.toString('utf8'))]));
  const {result} = p.call('source');
  assert.equal(result.status, 4, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /isolable final message/);
  assert.doesNotMatch(result.stderr, /VERDICT/);
});
test('partial stream deltas and a tool-only last message are not a final message', t => {
  const delta = harness(t, ndjson([
    initLine,
    {type: 'message_start', message: {id: 'msg', role: 'assistant', content: []}},
    {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: 'VERDICT: PASS\n'}},
    resultLine('VERDICT: PASS\n'),
  ]));
  const deltas = delta.call('source');
  assert.equal(deltas.result.status, 4);
  assert.equal(deltas.result.stdout, '');
  assert.match(deltas.result.stderr, /isolable final message/);
  const tools = harness(t, ndjson([
    initLine,
    assistant('', 'tool_use', [{type: 'tool_use', id: 'call_1', name: 'read_file', input: {path: 'spec/a.md'}}]),
    resultLine(''),
  ]));
  const toolOnly = tools.call('source');
  assert.equal(toolOnly.result.status, 4);
  assert.equal(toolOnly.result.stdout, '');
  assert.match(toolOnly.result.stderr, /isolable final message/);
});
test('150 KiB prompt reaches the grok double byte-identical and metrics record input bytes', t => {
  const prompt = 'é漢🙂'.repeat(17066) + 'éabcd';
  const final = 'VERDICT: PASS\n```review-data\n{"criteria":[{"id":"source","mandatory":true,"score":2,"evidence":"original AC"}],"findings":[]}\n```\n';
  const p = harness(t, ndjson([
    initLine,
    assistant('Reading the prompt.', 'end_turn'),
    assistant(final, 'end_turn', [{type: 'thinking', thinking: 'do not print'}, {type: 'text', text: 'VERDICT: PASS\n'}, {type: 'text', text: final.slice('VERDICT: PASS\n'.length)}]),
    resultLine(final),
  ]));
  const {result, metric} = p.call(prompt);
  assert.ok(fs.readFileSync(p.seen).equals(Buffer.from(prompt)));
  const args = JSON.parse(fs.readFileSync(p.argsFile, 'utf8'));
  assert.equal(args[args.indexOf('--output-format') + 1], 'streaming-messages-json');
  assert.equal(args[args.indexOf('--tools') + 1], 'read_file,grep,list_dir');
    const advertised = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'grok-structured-review.ndjson'), 'utf8').split('\n')[0]).tools;
    const removed = args[args.indexOf('--disallowed-tools') + 1].split(',');
    const allowedReadTools = new Set(['read_file', 'grep', 'list_dir']);
    for (const tool of [...advertised, 'run_terminal_cmd']) {
      if (allowedReadTools.has(tool)) assert.equal(removed.includes(tool), false, tool);
      else assert.ok(removed.includes(tool), tool);
    }
  assert.ok(args.includes('run_terminal_cmd'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, final);
  assert.equal(result.stdout.includes('Reading the prompt.'), false);
  assert.equal(result.stdout.includes('do not print'), false);
  assert.equal(parseReview(result.stdout, true).verdict, 'PASS');
  const row = JSON.parse(fs.readFileSync(metric, 'utf8'));
  assert.equal(row.input_bytes, Buffer.byteLength(prompt));
  assert.equal(row.input_bytes, 150 * 1024);
  assert.equal(row.output_bytes, Buffer.byteLength(final));
});
for (const [name, digest] of [
 ['p13-intake-review-1.txt', '967a14aa8ac9c6e8ca1ed1d217d8beb08e5781fb5a6aff309aafc6fcd2e1325e'],
 ['p13-intake-review-1-format-repair.txt', 'dcf10850c5fc4e422f21d1595f5f1c9e9983fc5c4283d2194a4b934f6da251be'],
]) test(`saved review fixture preserves bytes: ${name}`, () => {
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(fixtureDir, name))).digest('hex'), digest);
});
for (const [name, records] of [
 ['result without assistant', [initLine, resultLine('final')]],
 ['duplicate results', [assistant('final'), resultLine('final'), resultLine('final')]],
 ['missing result', [initLine, assistant('final')]],
 ['assistant after result', [assistant('final'), resultLine('final'), assistant('later')]],
 ['user after final assistant', [assistant('final'), {type:'user',message:{role:'user',content:[]}}, resultLine('final')]],
 ['subagent final assistant', [{...assistant('final'), parent_tool_use_id:'subagent'}, resultLine('final')]],
 ['different final session', [{...assistant('final'), session_id:'other'}, resultLine('final')]],
]) test(`ambiguous message stream fails: ${name}`, t => {
 const {result} = harness(t, ndjson(records)).call('source');
 assert.equal(result.status, 4, result.stderr);
 assert.equal(result.stdout, '');
});
test('real structured smoke replay isolates text while strict review rejects inconsistent scores', t => {
 const raw = fs.readFileSync(path.join(fixtureDir, 'grok-structured-review.ndjson'), 'utf8');
 const {result} = harness(t, raw).call('source');
 assert.equal(result.status, 0, result.stderr);
 assert.match(result.stdout, /^VERDICT: PASS/);
 assert.match(result.stdout, /P12E_END_SENTINEL_8472/);
 assert.doesNotMatch(result.stdout, /thinking|session_id/);
 assert.throws(() => parseReview(result.stdout, true), /contradicts computed NEEDS_CHANGES/);
});

test('real review replay parses without executing a tool', t => {
 const raw = fs.readFileSync(path.join(fixtureDir, 'grok-tool-disabled-review.ndjson'), 'utf8');
 const {result} = harness(t, raw).call('source');
 assert.equal(result.status, 0, result.stderr);
 assert.equal(parseReview(result.stdout, true).verdict, 'PASS');
 assert.match(result.stdout, /P12E_END_SENTINEL_8472/);
 for (const record of raw.trim().split('\n').map(JSON.parse))
  if (record.type === 'assistant') assert.ok(record.message.content.every(block => block.type !== 'tool_use'));
});

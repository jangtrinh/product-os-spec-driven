import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {projectFixture} from './project-fixture.mjs';
import {observationControls} from './observation-controls.mjs';
import {evaluate} from '../../tools/run/eval-commands.mjs';
import {recordReceipt} from '../../tools/run/evidence-records.mjs';
import {hashes, inventory, sha256} from '../../tools/lib/config/path-selection.mjs';
import {canonical} from '../../tools/lib/config/strict-json.mjs';

const file = name => fileURLToPath(new URL(name, import.meta.url));
const read = (p, name) => fs.readFileSync(path.join(p.root, name), 'utf8');
const snapshot = p => hashes(p.root, inventory(p.root).filter(name => !name.startsWith('review/log/')));
const diff = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(name => before[name] !== after[name]);
const controls = [];
for (const [name, output] of observationControls) {
  const p = projectFixture(null, ['prd'], {writer: {text: 'defect\n'}});
  try {
    p.config.roles.po.enabled = false; p.write('spec/prd.txt', 'defect\n');
    const direct = [];
    for (const exit of [0, 1]) {
      p.write('control.mjs', `process.stdout.write(${JSON.stringify(output)}); process.exit(${exit});\n`);
      p.config.evals.prd = [{run: `${JSON.stringify(process.execPath)} control.mjs`}]; p.save();
      const before = snapshot(p); const record = {rounds: {eval_fix: 0, review: 0}};
      let error;
      try { await evaluate(p.root, p.config, 'prd', {}, record); } catch (caught) { error = caught; }
      assert.equal(error?.code, 4); assert.match(error.message, /observation/);
      const changed = diff(before, snapshot(p)); assert.deepEqual(changed, []);
      assert.deepEqual(record.rounds, {eval_fix: 0, review: 0});
      const logs = fs.readdirSync(path.join(p.root, 'review/log')).filter(log => read(p, `review/log/${log}`).includes(`exit=${exit};`));
      assert.ok(logs.length);
      const report = `review/log/${logs[0]}`;
      assert.throws(() => recordReceipt(p.root, p.config, p.definitions.prd, null, [], [], {}, {}, [{command: 'control', exit_code: exit, report}]), caught => caught.code === 4);
      assert.deepEqual(diff(before, snapshot(p)), []);
      direct.push({actual_exit: exit, runner_error: error.code, protected_state_diff: changed, receipt_rejected: true, reason: error.message});
    }
    p.write('control.mjs', `process.stdout.write(${JSON.stringify(output)});\n`);
    const first = p.run(); assert.equal(first.code, 4, first.out);
    const firstState = JSON.parse(read(p, 'review/runtime/prd.json'));
    assert.equal(firstState.rounds.eval_fix, 0); assert.equal(firstState.rounds.review, 0);
    assert.equal(read(p, 'spec/prd.txt'), 'defect\n');
    for (const dir of ['gates', 'receipts', 'candidates']) assert.deepEqual(fs.readdirSync(path.join(p.root, `review/${dir}`)), []);
    const before = snapshot(p); const repeat = p.run(); assert.equal(repeat.code, 4, repeat.out);
    const changed = diff(before, snapshot(p)); assert.deepEqual(changed, []);
    controls.push({name, output_json: JSON.stringify(output), direct, pipeline_first: first.code, pipeline_repeat: repeat.code, pipeline_repeat_diff: changed, rounds: firstState.rounds, no_gate_receipt_candidate: true, original_output_sha256: sha256(read(p, 'spec/prd.txt'))});
  } finally { fs.rmSync(p.root, {recursive: true, force: true}); }
}
const p = projectFixture(null);
let positive;
try {
  p.config.roles.po.enabled = false;
  p.write('visible.mjs', "process.stdout.write('One real visible observation\\n');\n");
  p.config.evals.prd = [{run: `${JSON.stringify(process.execPath)} visible.mjs`}]; p.save();
  const result = p.run(); assert.equal(result.code, 0, result.out);
  const receipt = JSON.parse(read(p, `review/receipts/${fs.readdirSync(path.join(p.root, 'review/receipts'))[0]}`));
  assert.equal(receipt.execution.result, 'PASS');
  positive = {exit: result.code, gate: p.gate('prd').raw.split('\n')[0], receipt_result: receipt.execution.result, actual_eval_exit: receipt.execution.exit};
} finally { fs.rmSync(p.root, {recursive: true, force: true}); }
const sources = ['tools/run/output-observation.mjs', 'tools/run/command-process.mjs', 'tools/run/eval-commands.mjs', 'tools/run/evidence-records.mjs', 'tools/run/materialize-output.mjs', 'tools/run/review-results.mjs', 'tools/run/manual-agent.mjs', 'tools/run/registries.mjs'];
const evidence = {at: new Date().toISOString(), node: process.version, sources: Object.fromEntries(sources.map(source => [source, sha256(fs.readFileSync(file(`../../${source}`)))])), controls, positive, limits: 'Local fake-agent mechanism evidence; V4c and owner acceptance pending. Fresh runner initialization writes its checkpoint; direct classifier rejection and pipeline repeat mutate no protected state.'};
fs.writeFileSync(file('./fix-v4b-verification.json'), canonical(evidence) + '\n');
const lines = controls.map(row => `${row.name}: direct exit 0/1 -> error 4, state diff []; runner ${row.pipeline_first}/${row.pipeline_repeat}, repeat diff []; no gate/receipt/candidate; rounds 0/0`);
fs.writeFileSync(file('./fix-v4b-verification.txt'), lines.join('\n') + `\nVisible line: runner ${positive.exit}; ${positive.gate}; receipt ${positive.receipt_result}; real eval exit ${positive.actual_eval_exit}\n${evidence.limits}\n`);
console.log(lines.join('\n'));
console.log(`Visible line: ${JSON.stringify(positive)}`);

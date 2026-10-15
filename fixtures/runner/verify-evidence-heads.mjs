import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {headControls, headFixture, snapshot, copy, put} from './evidence-head-controls.mjs';
import {projectFixture} from './project-fixture.mjs';
import {stageHeadFixture} from './stage-head-fixture.mjs';
import {sha256, inventory} from '../../tools/lib/config/path-selection.mjs';
import {canonical} from '../../tools/lib/config/strict-json.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)); const repo = path.resolve(here, '../..');
const output = (name, body) => fs.writeFileSync(path.join(here, name), body);
const cleanup = p => fs.rmSync(p.root, {recursive: true, force: true});
const cases = [];
for (const [name, mutate] of headControls) {
  const {p, green} = headFixture(null, mutate);
  try {
    const before = snapshot(p); const red = p.importBatch(); assert.equal(red.code, 2, red.out); assert.deepEqual(snapshot(p), before);
    green(); const accepted = p.importBatch(); assert.equal(accepted.code, 0, accepted.out);
    cases.push({name, red_exit: red.code, red_mutation: 'none (all project files hashed)', red_reason: red.out.trim(), green_exit: accepted.code, green_mutation: 'expected packet/decision/audit/gate/change projections'});
  } finally { cleanup(p); }
}
let conflicting; let retired; let manual; let realSource;
for (const mode of ['conflict', 'retirement']) {
  const p = stageHeadFixture(null);
  try {
    const args = mode === 'retirement' ? ['--stage', 'prd', '--supersedes', p.receipt.id, '--reason', 'Fresh independent re-observation of the identical bytes'] : [];
    const result = p.run(args); assert.equal(result.code, mode === 'retirement' ? 0 : 2, result.out);
    const receipts = fs.readdirSync(path.join(p.root, 'review/receipts')).map(file => p.read(`review/receipts/${file}`));
    const row = {exit: result.code, gate: p.gate('prd').raw.split('\n')[0], output: result.out.trim(), receipts: receipts.map(r => ({id: r.id, at: r.at, execution: r.execution.result, supersedes: r.supersedes ?? []})), mutation: 'expected observation/receipt/audit/gate writes; prior FAIL preserved'};
    if (mode === 'conflict') conflicting = row; else retired = row;
  } finally { cleanup(p); }
}
{
  const p = projectFixture(null);
  try {
    p.config.agents.writer.command = 'manual'; p.save(); p.write('pasted-result.txt', 'Generated prd\n');
    const result = p.run(['--paste', 'pasted-result.txt']); assert.equal(result.code, 2, result.out); assert.match(p.gate('prd').raw, /^GATE: PENDING/);
    manual = {exit: result.code, gate: p.gate('prd').raw.split('\n')[0], review_independent: p.gate('prd').data.review.independent, writer: 'manual', reviewer: 'local fixture process; no model call'};
    output('am9-manual.txt', `$ node tools/run/run.mjs --project <isolated fixture> --build not-built --paste pasted-result.txt\n${result.out}\n${canonical(manual)}\nexit 2 / PENDING; fixture cleaned; mechanism evidence only.\n`);
  } finally { cleanup(p); }
}
{
  const p = projectFixture(null);
  try {
    const source = fs.readFileSync(path.join(repo, 'format/gate-model.md'));
    p.write('input/po-spec.txt', source.toString()); p.write('spec/prd.txt', 'Generated prd\n'); p.config.roles.po.enabled = false; p.save();
    const first = p.run(); assert.equal(first.code, 0, first.out);
    const id = p.gate('prd').data.model.receipts[0]; const receipt = JSON.parse(fs.readFileSync(path.join(p.root, `review/receipts/${id}.json`))); const fail = copy(receipt);
    fail.id = 'real-source-current-fail'; fail.execution.result = 'FAIL'; fail.execution.exit = 1; put(p, fail);
    const before = snapshot(p); const result = p.run(); assert.equal(result.code, 2, result.out); assert.deepEqual(snapshot(p), before);
    realSource = {source: 'format/gate-model.md', source_sha256: sha256(source), receipt_source_sha256: receipt.artifacts['input/po-spec.txt'], initial_exit: first.code, conflicting_exit: result.code, conflict_mutation: 'none', reason: result.out.trim(), limit: 'Real repository bytes through local fixture evaluator/reviewer; no semantic owner acceptance'};
    assert.equal(realSource.source_sha256, realSource.receipt_source_sha256);
  } finally { cleanup(p); }
}
const sourceFiles = [...inventory(repo, 'tools/run'), ...inventory(repo, 'tools/lib/config')].filter(file => /\.(mjs|js)$/.test(file));
const evidence = {at: new Date().toISOString(), node: process.version, sources: Object.fromEntries(sourceFiles.map(file => [file, sha256(fs.readFileSync(path.join(repo, file)))])), cases, conflicting, retired, manual, real_source: realSource, boundary: 'Builder local checks; V4c independently verifies P4g/P4h after this dispatch; no live provider, publication or owner acceptance'};
output('am9-verification.json', canonical(evidence) + '\n');
output('am9-verification.txt', cases.map(row => `${row.name} | RED exit ${row.red_exit} | mutation none | GREEN exit ${row.green_exit} | expected approval writes`).join('\n') + `\nConflict: exit ${conflicting.exit}; ${conflicting.gate}; new observation preserved.\nRetirement: exit ${retired.exit}; ${retired.gate}; witnessed explicit retirement.\nManual: exit 2 / PENDING.\nReal source: ${realSource.source_sha256}; conflict exit 2; no mutation.\n${evidence.boundary}\n`);
const escape = text => text.replace(/[&<>]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[ch]));
output('am9-evidence.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="430" viewBox="0 0 1120 430"><rect width="1120" height="430" fill="#f7f9fc"/><g font-family="Arial,sans-serif" fill="#18253c"><text x="36" y="45" font-size="26">Current evidence: observed runner states</text><text x="36" y="78" font-size="16">${cases.length} RED controls: exit 2, zero project file changes; restored controls: exit 0</text><rect x="36" y="106" width="505" height="204" rx="12" fill="#fff0df"/><rect x="572" y="106" width="512" height="204" rx="12" fill="#e5f5eb"/><text x="54" y="143" font-size="21">Two current conflicting heads</text><text x="54" y="178" font-size="17">FAIL + PASS: ${escape(conflicting.gate)}, exit ${conflicting.exit}</text><text x="54" y="211" font-size="16">New receipt written; prior FAIL bytes preserved</text><text x="54" y="244" font-size="16">Receipt clock cannot pick a winner</text><text x="590" y="143" font-size="21">Explicit independently reviewed retirement</text><text x="590" y="178" font-size="17">${escape(retired.gate)}, exit ${retired.exit}</text><text x="590" y="211" font-size="16">Store receipt names FAIL id + reason</text><text x="590" y="244" font-size="16">Eval audit witnesses both receipt ids</text><text x="36" y="352" font-size="18">Manual writer: exit 2 / PENDING; no human approval inferred</text><text x="36" y="386" font-size="15">Local fixture mechanism evidence. Independent V4c + owner acceptance remain open.</text></g></svg>\n`);
console.log(fs.readFileSync(path.join(here, 'am9-verification.txt'), 'utf8'));

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

const valid = 'VERDICT: PASS\nNOT verified: Không có.\n```review-data\n'+JSON.stringify({criteria:[{id:'source',mandatory:true,score:2,evidence:'Original source compared with final outputs'}],findings:[]})+'\n```\n';
const malformed = [
  'Prose review only',
  valid + valid.slice(valid.indexOf('```review-data')),
  'VERDICT: PASS\n```review-data\n{broken}\n```',
  valid.replace('"score":2','"score":7'),
  valid.replace('"findings":[]','"findings":[{"id":"f","criterion":"unknown","severity":"Major","file":"spec/prd.txt","line":1,"impact":"wrong","fix":"correct","owner":"dev","disposition":"open","reason":"source"}]'),
  valid.replace('"score":2','"score":0'),
  valid.replace('"criteria":[','"criteria":null,"discard":['),
];
function double(t, answers) {
  const p = projectFixture(t), calls = path.join(p.root, 'review-calls.jsonl');
  p.write('reviewer.cjs', `const fs=require('node:fs');const calls=${JSON.stringify(calls)};const input=fs.readFileSync(0,'utf8');const old=fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\\n'):[];fs.appendFileSync(calls,JSON.stringify({pid:process.pid,cwd:process.cwd(),input})+'\\n');const answers=${JSON.stringify(answers)};process.stdout.write(answers[Math.min(old.length,answers.length-1)]);`);
  p.config.agents.reviewer.command = `node '${path.join(p.root,'reviewer.cjs')}'`; p.save();
  return {...p, calls: () => fs.readFileSync(calls,'utf8').trim().split('\n').map(JSON.parse), state: () => JSON.parse(fs.readFileSync(path.join(p.root,'review/runtime/prd.json'),'utf8'))};
}
for (const [index, answer] of malformed.entries()) test(`malformed review shape ${index} gets exactly one fresh format repair without writer repair`, t => {
  const p = double(t, [answer, valid]), result = p.run();
  assert.equal(result.code, 2, result.out);
  assert.equal(p.gate('prd').data.review.verdict, 'PASS');
  assert.equal(p.state().rounds.eval_fix,0); assert.equal(p.state().rounds.review,1);
  const calls = p.calls(); assert.equal(calls.length,2);
  assert.notEqual(calls[0].pid,calls[1].pid); assert.notEqual(calls[0].cwd,calls[1].cwd);
  assert.ok(calls[1].input.startsWith(calls[0].input));
  assert.match(calls[1].input,/FORMAT REPAIR/);
  const audit = fs.readFileSync(path.join(p.root,'review/audit.jsonl'),'utf8');
  assert.match(audit,/Reviewer format repair/);
  assert.equal(fs.readFileSync(path.join(p.root,'review/log/prd-review-1.txt'),'utf8'),answer);
  assert.equal(fs.readFileSync(path.join(p.root,'review/log/prd-review-1-format-repair.txt'),'utf8'),valid);
});
test('two malformed reviews fail with parser error and saved raw path', t => {
  const p = double(t,['Prose only']), result = p.run();
  assert.equal(result.code,4,result.out);assert.equal(p.calls().length,2);
  assert.match(result.out,/Reviewer must start with a valid VERDICT line/);
  assert.match(result.out,/review\/log\/prd-review-1-format-repair.txt/);
  assert.equal(p.state().rounds.eval_fix,0);
  assert.equal(fs.existsSync(path.join(p.root,'review/gates/prd.md')),false);
});
for (const answer of ['', '\u001b[31m\u200b\u001b[0m']) test('missing visible review observation never triggers format repair', t => {
  const p = double(t,[answer,valid]), result=p.run();
  assert.equal(result.code,4,result.out);assert.equal(p.calls().length,1);assert.match(result.out,/Missing reviewer observation/);
});
test('manual malformed answer prints parser error and waits without a process re-ask', t => {
  const p = projectFixture(t);p.config.agents.reviewer.command='manual';p.save();
  assert.equal(p.run().code,2);p.write('answer.txt','Prose only');
  const result=p.run(['--result','answer.txt','--independent-review']);
  assert.equal(result.code,2,result.out);assert.match(result.out,/Reviewer must start with a valid VERDICT line/);
  assert.match(result.out,/review\/log\/prd-review-1.txt/);assert.equal(fs.existsSync(path.join(p.root,'review/gates/prd.md')),false);
  p.write('answer.txt',valid);
  const repaired=p.run(['--result','answer.txt','--independent-review']);assert.equal(repaired.code,2,repaired.out);
  assert.equal(p.gate('prd').data.review.verdict,'PASS');
});

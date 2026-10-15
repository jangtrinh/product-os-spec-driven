import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture, command} from '../../../fixtures/runner/project-fixture.mjs';

// The fake writer emits a defect until its prompt carries an eval-failure repair request.
function repairProject(t, evalSource) {
  const p = projectFixture(t, ['prd'], {writer: {}});
  const capture = path.join(p.root, 'writer-inputs.jsonl');
  p.config.agents.writer.command = command({badUntilFix: true, capture});
  p.write('evaluator.mjs', evalSource);
  p.config.evals.prd = [{run: `${JSON.stringify(process.execPath)} evaluator.mjs`}]; p.save();
  const writerInputs = () => fs.readFileSync(capture, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).input);
  return {p, writerInputs};
}
const failingLint = "import fs from 'node:fs';const bad=fs.readFileSync('spec/prd.txt','utf8').includes('defect');if(bad){console.log('ERROR spec/prd.txt:3 heading \"Scope\" is missing');console.log('ERROR spec/prd.txt:9 AC-2 has no Given/When/Then');console.log('token=hunter2-not-a-real-secret');}if(!bad)console.log('checked 1 spec/prd.txt');process.exit(bad?1:0);";
const repairText = input => input.slice(input.indexOf('CHANGE REQUEST / REPAIR:'));

test('writer repair request carries the failing eval ERROR lines, not only the log path', t => {
  const {p, writerInputs} = repairProject(t, failingLint);
  const run = p.run(); assert.equal(run.code, 2, run.out);
  const inputs = writerInputs(); assert.equal(inputs.length, 2, 'initial write plus one repair');
  assert.doesNotMatch(inputs[0], /Eval failures/);
  const repair = repairText(inputs[1]);
  assert.match(repair, /Eval failures:/);
  assert.match(repair, /ERROR spec\/prd\.txt:3 heading \\?"Scope\\?" is missing/);
  assert.match(repair, /ERROR spec\/prd\.txt:9 AC-2 has no Given\/When\/Then/);
  assert.match(repair, /review\/log\/prd-eval-/, 'the log path stays available');
});

test('writer repair excerpts are bounded and redacted', t => {
  const flood = "import fs from 'node:fs';const bad=fs.readFileSync('spec/prd.txt','utf8').includes('defect');if(bad){console.log('token=hunter2-not-a-real-secret');for(let i=0;i<5000;i++)console.log('ERROR line '+i+' padding padding padding padding');}if(!bad)console.log('checked 1 spec/prd.txt');process.exit(bad?1:0);";
  const {p, writerInputs} = repairProject(t, flood);
  const run = p.run(); assert.equal(run.code, 2, run.out);
  const repair = repairText(writerInputs()[1]);
  assert.doesNotMatch(repair, /hunter2-not-a-real-secret/);
  assert.match(repair, /ERROR line 0 /);
  assert.doesNotMatch(repair, /ERROR line 4999 /);
  assert.ok(Buffer.byteLength(repair) < 12000, `repair request grew to ${Buffer.byteLength(repair)} bytes`);
});

test('writer repair keeps ERROR lines that sit after a long log header', t => {
  // Real lint logs open with a status block longer than the per-log excerpt budget.
  const lint = "import fs from 'node:fs';const bad=fs.readFileSync('spec/prd.txt','utf8').includes('defect');if(bad){for(let i=0;i<60;i++)console.log('Q-CHECK-'+i+': NOT RUN (no gate_model.records declared for this check)');console.log('decisions.md:8: ERROR [D-FRONTMATTER-SCHEMA] front matter field topics[0].name is required');console.log('glossary.md:1: ERROR [G-GLOSSARY] missing exact Term heading');}if(!bad)console.log('checked 1 spec/prd.txt');process.exit(bad?1:0);";
  const {p, writerInputs} = repairProject(t, lint);
  const run = p.run(); assert.equal(run.code, 2, run.out);
  const repair = repairText(writerInputs()[1]);
  assert.match(repair, /D-FRONTMATTER-SCHEMA/); assert.match(repair, /G-GLOSSARY/);
  assert.ok(Buffer.byteLength(repair) < 12000);
});

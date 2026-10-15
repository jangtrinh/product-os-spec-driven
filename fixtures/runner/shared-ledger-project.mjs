import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectFixture, command} from './project-fixture.mjs';

// Saved-filters domain. Stages share one decisions ledger (spec/decisions.txt)
// and, in the amendment variant, clarify also edits intake's own document.
// The writer builds every file only from the prompt it is given (never from
// disk), so a test proves that carried bytes reach the writer through the
// request text. agents/mode.json is an out-of-band test switch, not a gate input.
export const LEDGER = 'spec/decisions.txt';
export const INTAKE_DOC = 'spec/intake.txt';
const WRITER = `import fs from 'node:fs';
const prompt = fs.readFileSync(0, 'utf8');
const stage = /^STAGE: ([a-z]+)$/m.exec(prompt)[1];
const outputs = JSON.parse(/^DECLARED OUTPUTS: (.+)$/m.exec(prompt)[1]);
const carried = Object.fromEntries([...prompt.matchAll(/^--- CO-WRITTEN FILE: (\\S+) ---\\n([\\s\\S]*?)^--- END CO-WRITTEN FILE ---$/gm)].map(m => [m[1], m[2]]));
let mode = {}; try { mode = JSON.parse(fs.readFileSync(new URL('./mode.json', import.meta.url), 'utf8')); } catch {}
const rows = {intake: '| D-01 | Saved filters belong to one user |', clarify: '| D-02 | Shared filter links expire after 7 days |', contract: '| D-03 | A saved filter holds at most 20 conditions |'};
const repairing = prompt.includes('Eval failures');
const baseLedger = stage === 'intake' && mode.dropRows ? '# Decisions\\n' : carried['${LEDGER}'] ?? '# Decisions\\n';
let ledger = baseLedger.includes(rows[stage]) ? baseLedger : baseLedger + rows[stage] + '\\n';
if (stage === 'clarify' && mode.crlf) ledger = ledger.replace(/\\r?\\n/g, '\\r\\n');
if (stage === 'clarify' && mode.trailingSpace) ledger = ledger.replace('# Decisions', '# Decisions ');
let intakeDoc = carried['${INTAKE_DOC}'] ?? 'Saved filters intake\\nSource of Q-001: unclassified\\n';
if (stage === 'clarify' && mode.amend) intakeDoc = intakeDoc.replace('unclassified', 'answered by po@example.test');
// Two edits in one clarify run: the first attempt trips the eval ('defect' in the document), the repair edits it again.
if (stage === 'clarify' && mode.twoEdits) { if (repairing) intakeDoc = intakeDoc.replace('answered draft defect', 'answered final'); else intakeDoc = intakeDoc.replace('unclassified', 'answered draft defect'); }
if (stage === 'intake' && mode.revertAmend) intakeDoc = intakeDoc.replace(/answered (by po@example.test|final)/, 'unclassified');
const files = {'${LEDGER}': ledger, '${INTAKE_DOC}': intakeDoc};
const body = Object.fromEntries(outputs.map(file => [file, files[file] ?? 'Generated ' + stage + '\\n']));
if (outputs.length === 1) process.stdout.write(body[outputs[0]]);
else process.stdout.write('\`\`\`files\\n' + JSON.stringify(body) + '\\n\`\`\`\\n');
`;

// stages: array of stage names that share the ledger; amend: clarify also declares INTAKE_DOC.
export function sharedLedgerProject(t, {stages = ['intake', 'clarify'], amend = false} = {}) {
  const p = projectFixture(t, stages);
  p.write('agents/ledger-writer.mjs', WRITER);
  p.config.agents.writer.command = `${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(p.root, 'agents/ledger-writer.mjs'))}`;
  const outputs = {intake: [INTAKE_DOC, LEDGER], clarify: amend ? [LEDGER, INTAKE_DOC] : [LEDGER], contract: ['spec/contract.txt', LEDGER]};
  for (const stage of stages) p.definitions[stage].outputs = outputs[stage];
  p.config.evals.clarify = [{run: `${command({eval: true})} ${JSON.stringify(LEDGER)}`}];
  p.save();
  const mode = value => p.write('agents/mode.json', JSON.stringify(value));
  const ledger = () => fs.readFileSync(path.join(p.root, LEDGER), 'utf8');
  const state = stage => (fs.existsSync(path.join(p.root, `review/gates/${stage}.md`)) ? /^GATE: (\w+)/.exec(p.gate(stage).raw)[1] : '-');
  const audit = () => fs.readFileSync(path.join(p.root, 'review/audit.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  const decide = (stage, args = ['--approve']) => {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('../../tools/run/decide.mjs', import.meta.url)), '--project', p.root, '--stage', stage, '--as', 'po@example.test', ...args], {encoding: 'utf8', timeout: 20000});
    return {code: r.status, out: r.stdout + r.stderr};
  };
  return {...p, mode, ledger, state, audit, decide};
}
// Runs until nothing is PENDING; the PO approves each PENDING stage in order.
export function settleAll(p, limit = 8) {
  let last;
  for (let i = 0; i < limit; i++) {
    last = p.run();
    const pending = p.config.stages && Object.keys(p.config.stages).find(stage => p.config.stages[stage].enabled && p.state(stage) === 'PENDING');
    if (!pending) return last;
    const r = p.decide(pending); if (r.code !== 0) throw new Error(`decide ${pending}: ${r.out}`);
  }
  return last;
}

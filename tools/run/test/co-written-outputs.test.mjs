import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sharedLedgerProject, settleAll, LEDGER} from '../../../fixtures/runner/shared-ledger-project.mjs';
import {isInsertOnly} from '../co-written-outputs.mjs';
import {loadConfig} from '../../lib/config/config-loader.mjs';
import {loadRegistries} from '../registries.mjs';
import {readGate} from '../gate-files.mjs';
import {gateChanges} from '../invalidate-gates.mjs';

// Stage A approves, a later stage B appends ledger rows through its own writer.
function approvedThroughClarify(t, options) {
  const p = sharedLedgerProject(t, options);
  p.write('input/intake-notes.txt', 'Intake notes.\n'); p.config.stages.intake.context.push('input/intake-notes.txt'); p.save();
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  const r2 = p.run(); assert.equal(r2.code, 2, r2.out); assert.equal(p.state('clarify'), 'PENDING');
  return p;
}

test('C1: a later stage appending ledger rows keeps the approved earlier gate APPROVED', t => {
  const p = approvedThroughClarify(t);
  assert.equal(p.decide('clarify').code, 0);
  const r = p.run();
  assert.equal(p.state('intake'), 'APPROVED', r.out);
  assert.equal(p.state('clarify'), 'APPROVED', r.out);
  assert.equal(r.code, 0, r.out); assert.match(r.out, /All enabled stages settled/);
  assert.match(p.ledger(), /D-01[\s\S]*D-02/);
});

test('(a) an earlier stage re-run that drops a later stage row stales that stage and keeps the dropped bytes', t => {
  const p = approvedThroughClarify(t);
  assert.equal(p.decide('clarify').code, 0);
  assert.equal(p.run().code, 0); assert.equal(p.state('intake'), 'APPROVED');
  p.mode({dropRows: true});
  p.write('input/intake-notes.txt', 'Intake notes changed by PO.\n');
  const r = p.run(); assert.equal(r.code, 2, r.out);
  assert.doesNotMatch(p.ledger(), /D-02/, 'the dropping writer removed the clarify row');
  assert.notEqual(p.state('clarify'), 'APPROVED', 'clarify must not stay approved over a ledger that lost its row');
  const config = loadConfig(p.root); const registry = loadRegistries(p.root, config);
  const changes = gateChanges(p.root, config, registry, 'clarify', readGate(p.root, config, 'clarify'), {head: 'fixture-head', build: 'not-built'});
  assert.ok(changes.includes(LEDGER), `an earlier stage's write is never an explained change: ${changes}`);
  const drop = p.audit().filter(e => e.type === 'change' && /^Co-declared output materialized/.test(e.reason)).at(-1);
  assert.deepEqual(drop.refs.slice(0, 3), [LEDGER, 'intake', 'edit']);
  const archived = fs.readFileSync(path.join(p.root, 'review/co-written', `${drop.before}.txt`), 'utf8');
  assert.match(archived, /D-02/, 'the row that was dropped stays recoverable');
});

test('(b) a hand edit with no audit link stales the earlier gate', t => {
  const p = approvedThroughClarify(t);
  assert.equal(p.decide('clarify').code, 0);
  assert.equal(p.run().code, 0); assert.equal(p.state('intake'), 'APPROVED', 'precondition: the pipeline append alone is accepted');
  fs.appendFileSync(path.join(p.root, LEDGER), '| D-99 | Added by hand |\n');
  const r = p.run();
  assert.notEqual(p.state('intake'), 'APPROVED', r.out);
  assert.equal(r.code, 2, r.out);
});

test('(c) the intake and clarify cycle converges to all APPROVED within five runs', t => {
  const p = sharedLedgerProject(t); let converged = false;
  for (let i = 1; i <= 5 && !converged; i++) {
    const r = p.run();
    for (const stage of ['intake', 'clarify']) if (p.state(stage) === 'PENDING') { assert.equal(p.decide(stage).code, 0); break; }
    converged = r.code === 0 && p.state('intake') === 'APPROVED' && p.state('clarify') === 'APPROVED';
  }
  assert.ok(converged, `intake=${p.state('intake')} clarify=${p.state('clarify')}`);
});

test('(d) a contract append keeps both earlier gates APPROVED', t => {
  const p = sharedLedgerProject(t, {stages: ['intake', 'clarify', 'contract']});
  const r = settleAll(p);
  assert.equal(r.code, 0, r.out);
  for (const stage of ['intake', 'clarify', 'contract']) assert.equal(p.state(stage), 'APPROVED', `${stage}\n${r.out}`);
  assert.match(p.ledger(), /D-01[\s\S]*D-02[\s\S]*D-03/);
  assert.equal(p.run().code, 0);
});

test('the append check tells inserted rows from edited or removed rows', () => {
  assert.equal(isInsertOnly('# L\n| D-01 | a |\n', '# L\n| D-01 | a |\n| D-02 | b |\n'), true);
  assert.equal(isInsertOnly('# L\n| D-01 | a |\n| D-03 | c |\n', '# L\n| D-01 | a |\n| D-02 | b |\n| D-03 | c |\n'), true);
  assert.equal(isInsertOnly('# L\n| D-01 | a |\n', '# L\n| D-01 | changed |\n'), false);
  assert.equal(isInsertOnly('# L\n| D-01 | a |\n| D-02 | b |\n', '# L\n| D-02 | b |\n| D-01 | a |\n'), false);
  assert.equal(isInsertOnly('# L\n| D-01 | a |\n', '# L\n'), false);
});

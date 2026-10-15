import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sharedLedgerProject, LEDGER} from '../../../fixtures/runner/shared-ledger-project.mjs';
import {appendAudit} from '../audit-store.mjs';
import {archiveBytes, archivePath, isInsertOnly} from '../co-written-archive.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';

const read = (p, file) => fs.readFileSync(path.join(p.root, file));
const forge = (p, before, after) => appendAudit(p.root, {type: 'change', scope: {kind: 'artifact', ids: [LEDGER], revision: after}, before, after,
  refs: [LEDGER, 'contract', 'append'], reason: 'Co-declared output materialized: append by contract'});

function approvedIntake(t, options) {
  const p = sharedLedgerProject(t, options);
  assert.equal(p.run().code, 2); assert.equal(p.decide('intake').code, 0);
  return p;
}

test('a schema-valid forged append line does not excuse a hand edit that dropped an approved row', t => {
  const p = approvedIntake(t);
  const h0 = sha256(read(p, LEDGER));
  fs.writeFileSync(path.join(p.root, LEDGER), '# Decisions\n| D-99 | Replaced by hand |\n');          // D-01 dropped
  const h1 = sha256(read(p, LEDGER));
  forge(p, h0, h1);
  const r = p.run();
  assert.notEqual(p.state('intake'), 'APPROVED', r.out);
  assert.equal(r.code, 2, r.out);
});

test('a forged line with a forged archive of the approved bytes is still refused: the bytes are not insert-only', t => {
  const p = approvedIntake(t);
  const approved = read(p, LEDGER); const h0 = archiveBytes(p.root, p.config, approved);
  fs.writeFileSync(path.join(p.root, LEDGER), '# Decisions\n| D-99 | Replaced by hand |\n');
  forge(p, h0, sha256(read(p, LEDGER)));
  assert.notEqual((p.run(), p.state('intake')), 'APPROVED');
});

test('every co-write archives its raw prior bytes, and an archive that no longer hashes to its name stales the earlier gate', t => {
  const p = approvedIntake(t);
  const h0 = sha256(read(p, LEDGER));
  assert.equal(p.run().code, 2);                                                                  // clarify appends
  assert.equal(p.state('intake'), 'APPROVED');
  const archived = path.join(p.root, archivePath(p.config, h0));
  assert.ok(fs.existsSync(archived), 'an append archives the preimage too');
  assert.equal(sha256(fs.readFileSync(archived)), h0, 'stored raw so the hash can be recomputed');
  fs.writeFileSync(archived, '# Decisions\n| D-01 | [redacted] |\n');                             // a redacted copy cannot be re-verified
  const r = p.run();
  assert.notEqual(p.state('intake'), 'APPROVED', r.out);
});

test('line endings and trailing spaces are part of a line: changing them is an edit', t => {
  assert.equal(isInsertOnly('# L\n| D-01 | a |\n', '# L\r\n| D-01 | a |\r\n'), false);
  assert.equal(isInsertOnly('# L\n| D-01 | a |\n', '# L \n| D-01 | a |\n| D-02 | b |\n'), false);
  assert.equal(isInsertOnly('# L\n| D-01 | a |\n', '# L\n| D-01 | a |\n\n| D-02 | b |\n'), true);
});

for (const [name, mode] of [['CRLF conversion', {crlf: true}], ['trailing-space change', {trailingSpace: true}]]) {
  test(`a later stage's ${name} of the shared ledger stales the approved earlier gate`, t => {
    const p = approvedIntake(t); p.mode(mode);
    const r = p.run(); assert.equal(r.code, 2, r.out); assert.equal(p.state('clarify'), 'PENDING');
    assert.match(p.ledger(), /D-02/);
    const next = p.run();
    assert.notEqual(p.state('intake'), 'APPROVED', next.out);
  });
}

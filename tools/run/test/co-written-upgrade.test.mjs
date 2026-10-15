import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sharedLedgerProject} from '../../../fixtures/runner/shared-ledger-project.mjs';
import {hasKitHistory} from './kit-history.mjs';

const kit = fileURLToPath(new URL('../../../', import.meta.url));
// Previous release: 2.2.0 (build: release 2.2.0), the kit POs have installed. Its runner records no write events.
const PREVIOUS_RELEASE = 'b334804';

test('(e) a G1 approved by the previous release stays APPROVED when a later stage appends after upgrade', t => {
 if (!hasKitHistory(t, kit, PREVIOUS_RELEASE)) return;
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'co-written-upgrade-')); t.after(() => fs.rmSync(workspace, {recursive: true, force: true}));
  const archive = spawnSync('git', ['archive', PREVIOUS_RELEASE, 'tools', 'format'], {cwd: kit, maxBuffer: 200 * 1024 * 1024}); assert.equal(archive.status, 0, String(archive.stderr));
  const old = path.join(workspace, 'old'); fs.mkdirSync(old);
  assert.equal(spawnSync('tar', ['-x', '-C', old], {input: archive.stdout}).status, 0);
  const p = sharedLedgerProject(t);
  const previous = (entry, args) => spawnSync(process.execPath, [path.join(old, 'tools/run', entry), '--project', p.root, ...args], {encoding: 'utf8', timeout: 30000});
  let r = previous('run.mjs', ['--head', 'fixture-head', '--build', 'not-built']); assert.equal(r.status, 2, r.stdout + r.stderr);
  r = previous('decide.mjs', ['--stage', 'intake', '--as', 'po@example.test', '--approve']); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(fs.existsSync(path.join(p.root, 'review/audit.jsonl')) && p.audit().some(e => e.refs.some(ref => ref === 'spec/decisions.txt')), false, 'the previous release recorded no write chain');
  const approvedBytes = fs.readFileSync(path.join(p.root, 'review/gates/intake.md'));

  const upgraded = p.run(); assert.equal(upgraded.code, 2, upgraded.out);          // clarify appends under the new runner
  assert.deepEqual(fs.readFileSync(path.join(p.root, 'review/gates/intake.md')), approvedBytes, upgraded.out);
  assert.equal(p.state('intake'), 'APPROVED'); assert.equal(p.state('clarify'), 'PENDING');
  assert.equal(p.decide('clarify').code, 0);
  const done = p.run(); assert.equal(done.code, 0, done.out);
  assert.equal(p.state('intake'), 'APPROVED');
});

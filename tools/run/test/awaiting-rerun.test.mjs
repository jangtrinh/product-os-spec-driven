import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

const decideScript = fileURLToPath(new URL('../decide.mjs', import.meta.url));

// BR-14 fallback reopens a later gate that has no changed input of its own. When the earlier stage settles on
// identical bytes nothing else marks that gate stale, so it must still owe its re-run instead of waiting undecidable.
test('a dependent gate reopened by fallback re-runs after the earlier stage re-settles on identical bytes', t => {
  const p = projectFixture(t, ['intake', 'clarify']);
  p.write('input/intake-notes.txt', 'Saved-filter notes.\n'); p.config.stages.intake.context.push('input/intake-notes.txt'); p.save();
  const decide = stage => { const r = spawnSync(process.execPath, [decideScript, '--project', p.root, '--stage', stage, '--as', 'po@example.test', '--approve'], {encoding: 'utf8'}); return {code: r.status, out: r.stdout + r.stderr}; };
  const freshness = stage => p.gate(stage).data.model.states.freshness;
  assert.equal(p.run().code, 2); assert.equal(decide('intake').code, 0);
  assert.equal(p.run().code, 2); assert.equal(decide('clarify').code, 0);
  p.write('input/intake-notes.txt', 'Saved-filter notes, revised.\n');
  assert.equal(p.run().code, 2); assert.equal(decide('intake').code, 0);                 // intake re-settled; its outputs are unchanged bytes
  const next = p.run();
  assert.equal(next.code, 2, next.out); assert.doesNotMatch(next.out, /Waiting: review\/gates\/clarify/);
  assert.equal(freshness('clarify'), 'CURRENT', 'clarify was re-run, not left stale');
  const approved = decide('clarify'); assert.equal(approved.code, 0, approved.out);
  assert.equal(p.run().code, 0);
});

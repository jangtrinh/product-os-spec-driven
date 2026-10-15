import test from 'node:test';
import assert from 'node:assert/strict';
import {AGENT_TIMEOUT_MS, RUNNER_TIMEOUT_MS} from '../agent-timeouts.mjs';
import {parseOptions} from '../run.mjs';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

test('long generations have a 25-minute wrapper and 30-minute runner default', () => {
  assert.equal(AGENT_TIMEOUT_MS, 1500000);
  assert.equal(RUNNER_TIMEOUT_MS, 1800000);
});
test('an explicit runner deadline below the wrapper default is honored', t => {
  assert.equal(parseOptions(['--timeout-ms', '25']).timeout, 25);
  const p = projectFixture(t, ['prd'], {writer: {delay: 1000}});
  const result = p.run(['--timeout-ms', '25']);
  assert.equal(result.code, 4, result.out);
  assert.match(result.out, /Writer not runnable/);
});

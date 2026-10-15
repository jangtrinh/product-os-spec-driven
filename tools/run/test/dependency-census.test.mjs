import test from 'node:test';
import assert from 'node:assert/strict';
import {censusControls, censusFixture} from '../../../fixtures/runner/dependency-census-controls.mjs';
import {snapshot} from '../../../fixtures/runner/evidence-head-controls.mjs';
for (const control of censusControls) test(`${control[0]} rejects no-impact approval despite complete flag`, t => {
  const {p,greenProbe,attack,red,restore,green}=censusFixture(t,control);
  const initial=greenProbe();assert.equal(initial.code,0,initial.out);
  attack();const before=snapshot(p);
  const rejected = red(); assert.equal(rejected.code, 2, rejected.out); assert.deepEqual(snapshot(p), before);
  restore(); const accepted = green(); assert.equal(accepted.code, 0, accepted.out);
});

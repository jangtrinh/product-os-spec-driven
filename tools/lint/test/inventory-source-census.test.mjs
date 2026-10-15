import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceDependencyEdges} from '../source-dependency-census.mjs';

test('inventory flow and data are causal prerequisites of the screen state', () => {
  const m = {docs: [], inventory: {screens: [{screen: 'S01', state: 'normal', flow: 'ux/flow.md', data: 'data/model.json'}]}, manifest: {design: {inventory: 'inventory.json'}}};
  const edges = sourceDependencyEdges(m);
  for (const source of ['ux/flow.md', 'data/model.json']) assert.ok(edges.some(e => e.from === `artifact:${source}` && e.to === 'screen-state:S01/normal'), source);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPoView} from '../indexer/views/po.mjs';

for (const [channel, expected] of [[undefined, 'direct'], ['direct', 'direct'], ['agent-ask-user', 'agent-ask-user']]) test(`PO reader shows the decider channel ${expected}`, () => {
  const ctx = {stories: [], coverage: {totals: {us: 0, ac: 0, passed: 0}}, screens: {screens: []}, readable: {}, openAll: [], boardsById: {}, pages: [], design: {records: {gates: [], decisions: [{data: {id: 'decision-fixture', by: 'po@example.test', default: 'defer', reason: 'Owner choice', scope: {ids: []}, ...(channel ? {channel} : {})}}]}, declared: {}, changes: []}};
  const html = buildPoView(ctx); assert.match(html, /po@example.test/); assert.ok(html.includes(expected));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexSpec } from '../indexer/index-spec.mjs';
import { acState, buildCoverage, buildEvidence } from '../indexer/views/evidence-model.mjs';
import { neutralizeHtml, sectionOf } from '../indexer/views/embed.mjs';
import { esc } from '../indexer/views/html.mjs';

const fx = (n) => fileURLToPath(new URL(`../../../fixtures/${n}`, import.meta.url));
const full = indexSpec(fx('v2/full'), {}).data;
const page = (id) => full.pages.find((p) => p.id === id);

test('every required role view and one developer panel per story are generated from the spec', () => {
  for (const id of ['po-view', 'dev-view', 'qa-view', 'open-items', 'coverage', 'design-view', 'evidence-view', 'source-ledger']) assert.ok(page(id), id);
  assert.equal(full.pages.filter((p) => p.kind === 'view' && /^dev-us-/.test(p.id)).length, full.views.stories);
  assert.equal(full.format, '2'); assert.equal(full.product, 'PRODUCT:OS Spec Driven');
  assert.ok(full.pages.filter((p) => p.kind === 'view').every((p) => p.generated && p.artifact === 90 && p.tier === 'views'));
});

test('coverage counts AC, shows denominators, and a declared status is not evidence', () => {
  const md = page('coverage').md;
  assert.match(md, /0 of 5/); assert.match(md, /5 of 5/);
  assert.equal(full.views.ac, 5); assert.equal(full.views.passed, 0);
  const evidence = buildEvidence({ receipts: [] });
  const scn = (status, method = 'auto') => ({ id: 'SCN-1', status, method, ac: ['AC-01'] });
  assert.equal(acState([], evidence, 'US-1.AC-01'), 'uncovered');
  assert.equal(acState([scn('passing')], evidence, 'US-1.AC-01'), 'unverified');
  assert.equal(acState([scn('passing'), scn('failing')], evidence, 'US-1.AC-01'), 'failing');
  assert.equal(acState([scn('planned', 'not-built')], evidence, 'US-1.AC-01'), 'not-built');
  assert.equal(acState([scn('planned', 'unassigned')], evidence, 'US-1.AC-01'), 'unassigned');
  const current = buildEvidence({ receipts: [{ rel: 'r', data: { id: 'r', freshness: 'CURRENT', execution: { exit: 0, result: 'PASS', selected: 1 }, coverage: { ac: ['US-1.AC-01'], passed: ['US-1.AC-01'], scenarios: [] } } }] });
  assert.equal(acState([scn('passing')], current, 'US-1.AC-01'), 'passed');
  const stale = buildEvidence({ receipts: [{ rel: 'r', data: { id: 'r', freshness: 'STALE', execution: { exit: 0, result: 'PASS', selected: 1 }, coverage: { ac: ['US-1.AC-01'], passed: ['US-1.AC-01'], scenarios: [] } } }] });
  assert.equal(acState([scn('passing')], stale, 'US-1.AC-01'), 'unverified');
  const c = buildCoverage([{ id: 'US-1', area: 'E1', epic: 'E1 x', reqs: [], scenarios: [scn('passing')], acs: [{ id: 'AC-01', qid: 'US-1.AC-01', given: '', then: '' }] }], current);
  assert.deepEqual([c.totals.passed, c.totals.ac], [1, 1]);
});

test('missing, not-created and unverified states are disclosed, not hidden', () => {
  assert.ok(full.views.expect.some((e) => e.page === 'design-view' && e.text === 'not-created'));
  assert.match(page('design-view').md, /not-created/); assert.match(page('source-ledger').md, /No source ledger declared/);
  assert.match(page('open-items').md, /No story carries an OPEN marker/);
  const noImg = indexSpec(fx('reader/no-image'), {}).data;
  assert.ok(noImg.pages.find((p) => p.id === 'design-view').md.includes('no image'));
  assert.match(noImg.pages.find((p) => p.id === 'evidence-view').md, /No gate model is declared/);
  const sd = indexSpec(fx('reader/source-states'), {}).data;
  const states = sd.pages.filter((p) => ['design-view', 'evidence-view'].includes(p.id)).map((p) => p.md).join('\n');
  for (const word of ['retired', 'unverified', 'missing', 'receipt missing', 'STALE', 'not executed']) assert.ok(states.includes(word) || states.toLowerCase().includes(word.toLowerCase()), word);
});

test('spec text cannot inject HTML into generated pages', () => {
  assert.equal(esc('<img src=x onerror=alert(1)> & "q"'), '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;');
  const out = neutralizeHtml('a <script>x</script> `<b>` <!-- hidden -->z\n```html\n<i>\n```');
  assert.ok(!/<script/.test(out) && out.includes('`<b>`') && out.includes('<i>') && !out.includes('hidden'));
  assert.equal(sectionOf('## 1. A\nbody\n## 2. B\nnext', 1), 'body');
  for (const p of full.pages.filter((x) => x.kind === 'view')) assert.ok(!/<script|onerror=|javascript:/i.test(p.md), p.id);
});

test('adverse fixtures render long content without losing it', () => {
  const long = indexSpec(fx('reader/long-content'), {}).data;
  assert.ok(long.pages.find((p) => p.id === 'us-02').md.includes('Pneumonoultramicroscopic'));
  assert.ok(long.pages.find((p) => p.id === 'qa-view').md.includes('Pneumonoultramicroscopic'));
  /* The PO view is the role view the long content must actually reach: epics, open questions. A byte-identical page proves nothing. */
  const po = (d) => d.pages.find((p) => p.id === 'po-view').md;
  assert.notEqual(po(long), po(full)); assert.ok(po(long).includes('Pneumonoultramicroscopic'), 'long epic or open question reaches the PO view');
});

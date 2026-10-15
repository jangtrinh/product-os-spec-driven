import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {installedSnapshot, assertInstallation, consumers, assertPaired} from '../../../fixtures/runner/kit-content-census.mjs';
import {pairedCensus} from '../../../fixtures/runner/installed-project-census.mjs';
import {hashes} from '../../lib/config/path-selection.mjs';

test('real installed corpus and actual runner snapshots remain kit context rather than project declarations', t => {
  const p = installedSnapshot(t, 'spec', {authored: true});
  assertInstallation(assert, p);
  const pair = consumers(p);
  t.diagnostic('REAL-INSTALL ' + JSON.stringify(p.receipt));
  t.diagnostic('CONSUMERS ' + JSON.stringify({lint: pair.lint.error ?? 'extracted', runner: pair.runner.error ?? 'extracted'}));
  assertPaired(assert, p, pair);
  assert.equal(pair.lint.census.nodes.get('us:US-101'), p.authored.source);
});

for (const specRoot of ['spec', 'specs/current']) test(`installed ${specRoot} preserves authored documents and actual authored snapshots`, t => {
  const p = installedSnapshot(t, specRoot, {authored: true});
  assertInstallation(assert, p);
  const actual = p.receipt.snapshots.find(row => row.original === p.authored.consumer);
  assert.ok(actual);
  const {lint, runner, digest} = pairedCensus(p);
  assertPaired(assert, p, {lint: {census: lint}, runner: {census: runner}});
  for (const [id, file] of [['us:US-101', p.authored.source], ['us:US-102', p.authored.consumer], ['us:US-102', actual.file],
    ['screen-state:S91/normal', 'context/screen-inventory.json']])
    assert.ok(lint.nodeSources.get(id)?.has(file), `Required authored identity ${id} from ${file}`);
  for (const [from, to] of [['us:US-101', `artifact:${actual.file}`], ['artifact:context/data.json', 'screen-state:S91/normal'],
    ['artifact:context/flow.md', 'screen-state:S91/normal'], ['artifact:templates/change-set.md', 'artifact:config/pipeline.yaml'],
    ['artifact:evals/cases/ui-feature/candidate/ux/inventory.md', 'artifact:config/pipeline.yaml']])
    assert.ok(lint.edges.some(edge => edge.from === from && edge.to === to && edge.causal), `${from} -> ${to}`);
  assert.ok(!lint.edges.some(edge => [edge.from, edge.to].some(id => /<document-id>|<change-set>|spec\/assets\/inventory\.json/.test(id))));
  t.diagnostic('CANONICAL ' + JSON.stringify({specRoot, digest, edges: lint.edges, nodeSources: [...lint.nodeSources].map(([id, files]) => [id, [...files]])}));
});

test('every installed kit class is excluded through inventory and explicit sources; nested project names survive', t => {
  const p = installedSnapshot(t, 'spec', {authored: true});
  assertInstallation(assert, p);
  const story = id => `---\nid: ${id}\ntype: us\n---\n`;
  const kitFiles = ['format/owner-probe.md', 'templates/owner-probe.md', 'rules/owner-probe.md', 'prompts/owner-probe.md', 'tools/owner-probe.md', 'evals/results/owner-probe.md'];
  kitFiles.forEach((file, i) => p.write(file, story(`US-${800 + i}`)));
  const authoredFiles = ['spec/templates/requirement.md', 'context/evals/requirement.md', 'spec/evals/requirement.md',
    'evals-project/requirement.md', 'review/sources/authored.md', `review/sources/intake/${'a'.repeat(64)}/files/spec/templates/requirement.md`,
    `review/sources/intake/${'b'.repeat(64)}/files/context/evals/requirement.md`];
  authoredFiles.forEach((file, i) => p.write(file, story(`US-${900 + i}`)));
  const kitSnapshots = p.receipt.snapshots.filter(row => /^(templates|evals)\//.test(row.original)).map(row => row.file);
  const files = [...kitFiles, ...kitSnapshots, './templates/change-set.md', 'SPEC.md'];
  const graph = {nodes: files.map((source, i) => ({id: `artifact:kit-probe-${i}`, source}))};
  const pair = consumers(p, graph, files);
  assertPaired(assert, p, pair);
  kitFiles.forEach((file, i) => assert.ok(!pair.lint.census.nodes.has(`us:US-${800 + i}`), file));
  authoredFiles.forEach((file, i) => assert.ok(pair.lint.census.nodeSources.get(`us:US-${900 + i}`)?.has(file), file));
  assert.ok(!pair.lint.census.corpus.docs.some(doc => files.includes(doc.rel)));
  assert.deepEqual(hashes(p.root, p.templates), p.templateHashes);
});

test('case aliases are excluded only when they identify the same physical installed kit path', t => {
  const p = installedSnapshot(t);
  assertInstallation(assert, p);
  const physical = (a, b) => {const x = fs.statSync(path.join(p.root, a)), y = fs.statSync(path.join(p.root, b)); return x.dev === y.dev && x.ino === y.ino;};
  if (fs.existsSync(path.join(p.root, 'Templates')) && physical('Templates', 'templates')) {
    const snapshot = p.receipt.snapshots.find(row => row.original === 'templates/change-set.md');
    const files = ['Templates/change-set.md', 'Evals/cases/ui-feature/candidate/ux/inventory.md', snapshot.file.replace('/templates/', '/Templates/')];
    const pair = consumers(p, {nodes: files.map(source => ({id: `artifact:${source}`, source}))}, files);
    assertPaired(assert, p, pair);
    assert.ok(!pair.lint.census.corpus.docs.some(doc => files.includes(doc.rel)));
    t.diagnostic('PHYSICAL-ALIASES ' + JSON.stringify({files, sameDeviceAndInode: true, bothConsumers: 'extracted'}));
  } else {
    p.write('Templates/US-990.md', '---\nid: US-990\ntype: us\n---\n');
    assert.equal(physical('Templates', 'templates'), false);
    const pair = consumers(p, undefined, ['Templates/US-990.md']);
    assertPaired(assert, p, pair);
    assert.equal(pair.lint.census.nodes.get('us:US-990'), 'Templates/US-990.md');
  }
});

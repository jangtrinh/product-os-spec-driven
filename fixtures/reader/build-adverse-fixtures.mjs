#!/usr/bin/env node
/* Builds the reader's adverse fixtures from fixtures/v2/full, each a lint-clean spec that stresses one disclosure the reader owes:
     long-content   very long words, headings, table cells, wide tables and code lines
     no-image       no coded capture and no board for any screen
     ledger         a populated source ledger + crosswalk whose mappings reach a scenario, an AC and a screen state
     shared-receipt one receipt listed by both gate_model.receipts and design.evidence
     design-stages  the wireframe and prototype stage outputs (wireframe/wireframes.md, prototype/index.html) next to the story files
     source-states  design sources: live, retired, unverified, missing, not-created, denied snapshot; evidence: current, stale, not executed, absent
   usage: node fixtures/reader/build-adverse-fixtures.mjs [--check]   (--check fails when the committed trees differ from a fresh build) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const FULL = path.resolve(here, '../v2/full');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const rw = (root, rel, fn) => { const f = path.join(root, rel); fs.writeFileSync(f, fn(fs.readFileSync(f, 'utf8'))); };
const json = (root, rel, fn) => rw(root, rel, (s) => `${JSON.stringify(fn(JSON.parse(s)), null, 2)}\n`);

const LONG_WORD = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(3);

const BUILDERS = {
  'long-content': (root) => {
    const LONG_GOAL = `Lưu một bộ lọc một lần và mở lại đúng kết quả đó bất cứ lúc nào. ${'Mục tiêu này cố ý viết rất dài để thử cách các bảng của vai trò PO xuống dòng. '.repeat(5)}${LONG_WORD}`;
    rw(root, 'readable/epic-1-reuse-my-filters.md', (s) => s.replace(/^title: ".*"$/m, `title: "Epic 1 — ${LONG_WORD}"`).replace('Lưu một bộ lọc một lần và mở lại đúng kết quả đó bất cứ lúc nào.', LONG_GOAL));
    json(root, 'readable/epic-map.json', (m) => { m.epics[0].title = LONG_WORD; m.epics[0].goal = LONG_GOAL; return m; });
    rw(root, 'us/US-02.md', (s) => s
      .replace(/^title: ".*"$/m, `title: "Mở lại bộ lọc đã lưu với một tiêu đề rất dài để thử tràn ngang ${'và xuống dòng '.repeat(5)}"`)
      .replace(/^(\| AC-01 \|.*\| )([^|]*?)( \| SCN-02-01 \|)$/m, (_, a1, then, tail) => `${a1}${then} ${LONG_WORD} ${'Người dùng thấy kết quả đúng như lúc lưu, kể cả khi danh sách rất dài. '.repeat(6)}${tail}`)
      .replace(/\s*$/, `\n\nOPEN: ${'Người dùng mở lại bộ lọc rất dài thì hiển thị thế nào? '.repeat(5)}${LONG_WORD} Owner: owner@example.test\n`)
      .replace('## 5. Edge cases', `## 5. Edge cases\n\n| ${Array.from({ length: 12 }, (_, i) => `Cột ${i + 1}`).join(' | ')} |\n|${'---|'.repeat(12)}\n| ${Array.from({ length: 12 }, (_, i) => (i === 3 ? LONG_WORD : `giá trị ${i + 1}`)).join(' | ')} |\n\n\`\`\`text\n${'x'.repeat(260)}\n\`\`\`\n`));
  },
  'no-image': (root) => {
    for (const rel of ['assets/shots', 'ux/wireframes', 'ux/flows', 'assets/records']) fs.rmSync(path.join(root, rel), { recursive: true, force: true });
    for (const us of ['US-01', 'US-02', 'US-03']) rw(root, `us/${us}.md`, (s) => s.replace(/^images:\n(?:  .*\n)+/m, '').replace(/^boards: .*\n/m, '').replace(/!\[[^\]]*\]\([^)]*\)\n?/g, '').replace(/\[wireframe boards\]\([^)]*\)/g, 'wireframe boards'));
    rw(root, 'ux/flows.md', (s) => s.replace(/!\[[^\]]*\]\([^)]*\)\n?/g, ''));
    json(root, 'spec.manifest.json', (m) => { m.reading_order = m.reading_order.map((r) => ({ ...r, pages: r.pages.filter((p) => p !== 'wireframe-index') })).filter((r) => r.pages.length); m.images = { deny: [] }; delete m.gate_model; m.design.evidence = []; return m; });
    json(root, 'assets/inventory.json', (inv) => { inv.screens.forEach((r) => { r.boards = []; }); return inv; });
  },
  ledger: (root) => {
    const row = (id, legacy, family, kind, canon, owner) => ({ id, legacy_id: legacy, family, canonical_kind: kind, canonical_id: canon, owner, source: { file: 'source/legacy.md', line: 1 }, assignment_rule: 'fixture' });
    const item = (id, status, mappings, extra = {}) => ({ id, source: { file: 'source/legacy.md', line: 3 }, text_sha256: sha(`source text ${id}`), status, mappings, ...(status === 'exact' ? {} : { reason: 'Fixture: the source wording only partly survives.' }), ...extra });
    fs.mkdirSync(path.join(root, 'provenance'), { recursive: true });
    fs.writeFileSync(path.join(root, 'provenance/id-crosswalk.json'), `${JSON.stringify({ version: 1, rows: [row('CW-1', 'SCN-PUB-01-02', 'scn-pub', 'scenario', 'US-01.SCN-01-01', 'US-01')] }, null, 2)}\n`);
    const items = [item('CW-1', 'exact', [{ kind: 'scenario', id: 'US-01.SCN-01-01' }], { crosswalk_row: 'CW-1' }), item('SRC-2', 'partial', [{ kind: 'screen-state', id: 'S01/normal' }]), item('SRC-3', 'partial', [{ kind: 'ac', id: 'US-01.AC-01' }]),
      item('SRC-4', 'no-demo', []), item('SRC-5', 'conflicting', [{ kind: 'ac', id: 'US-02.AC-01' }, { kind: 'screen-state', id: 'S01/empty' }])];
    fs.writeFileSync(path.join(root, 'provenance/source-ledger.json'), `${JSON.stringify({ version: 1, normalization: 'nfc-lf-trim-trailing-v1', crosswalk: 'id-crosswalk.json', summary: { source_preservation: { total: 5, preserved: 5 }, typed_coverage: { total: 5, mapped: 4 }, demo_coverage: { total: 5, passed: 0 } }, items }, null, 2)}\n`);
  },
  'design-stages': (root) => {
    for (const [from, to] of [['stage-samples/wireframes.md', 'wireframe/wireframes.md'], ['stage-samples/index.html', 'prototype/index.html']]) {
      fs.mkdirSync(path.dirname(path.join(root, to)), { recursive: true });
      fs.copyFileSync(path.join(here, from), path.join(root, to));
    }
  },
  'shared-receipt': (root) => { json(root, 'spec.manifest.json', (m) => { m.design.evidence = ['assets/receipt.json']; return m; }); },
  'source-states': (root) => {
    const entry = (id, status, freshness, extra = {}) => ({ id, tool: 'design-tool', locator: { url: `https://design.example.test/file/${id}`, file_key: 'FILE1', node_id: '1:2' }, revision: 'r7', snapshot: null, at: '2026-01-09T00:00:00Z', authority: 'design owner', freshness, status, ...extra });
    json(root, 'assets/sources.json', (s) => ({ ...s, inputs: { 'README.md': sha(fs.readFileSync(path.join(root, 'README.md'))) }, entries: [
      entry('source-live', 'active', 'CURRENT'), entry('source-old', 'retired', 'STALE'), entry('source-unchecked', 'unverified', 'STALE'), entry('source-gone', 'missing', 'MISSING'),
    ] }));
    const mkReceipt = (id, freshness, exec) => ({ id, scope: { kind: 'ac', ids: ['US-01.AC-01'], revision: JSON.parse(fs.readFileSync(path.join(root, 'assets/receipt.json'), 'utf8')).scope.revision }, at: '2026-01-09T00:00:00Z', freshness,
      pins: JSON.parse(fs.readFileSync(path.join(root, 'assets/receipt.json'), 'utf8')).pins, execution: exec, review: JSON.parse(fs.readFileSync(path.join(root, 'assets/receipt.json'), 'utf8')).review,
      coverage: { ac: ['US-01.AC-01'], scenarios: ['US-01.SCN-01-01'], passed: [], na: [] }, artifacts: JSON.parse(fs.readFileSync(path.join(root, 'assets/receipt.json'), 'utf8')).artifacts, domain: 'spec' });
    const base = JSON.parse(fs.readFileSync(path.join(root, 'assets/receipt.json'), 'utf8')).execution;
    fs.writeFileSync(path.join(root, 'assets/receipt-stale.json'), `${JSON.stringify(mkReceipt('receipt-stale', 'STALE', base), null, 2)}\n`);
    fs.writeFileSync(path.join(root, 'assets/receipt-notrun.json'), `${JSON.stringify(mkReceipt('receipt-notrun', 'MISSING', { ...base, exit: null, result: 'NOT_RUN', selected: 0, total: 0, red_controls: [], recovery: 'run the check once the build exists' }), null, 2)}\n`);
    json(root, 'spec.manifest.json', (m) => { m.gate_model.receipts.push('assets/receipt-stale.json', 'assets/receipt-notrun.json'); return m; });
    const plan = { normal: ['figma', 'source-live', ['receipt-spec']], empty: ['figma', 'source-old', ['receipt-stale']], loading: ['figma', 'source-unchecked', ['receipt-notrun']], error: ['figma', 'source-gone', ['receipt-ghost']] };
    json(root, 'assets/inventory.json', (inv) => { inv.screens.forEach((r) => { const p = r.screen === 'S01' && plan[r.state]; if (p) { r.source = { kind: p[0], ref: p[1] }; r.evidence = p[2]; } }); return inv; });
  },
};

const outDir = (name) => path.join(here, name);
const copy = (from, to) => fs.cpSync(from, to, { recursive: true });
const tree = (dir) => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name))).sort().map((r) => `${r}:${sha(fs.readFileSync(path.join(dir, r)))}`).join('\n');

const check = process.argv.includes('--check');
let drift = 0;
for (const [name, build] of Object.entries(BUILDERS)) {
  const target = check ? fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), `adverse-${name}-`)) : outDir(name);
  if (!check) fs.rmSync(target, { recursive: true, force: true });
  copy(FULL, target); build(target);
  if (check) { if (!fs.existsSync(outDir(name)) || tree(target) !== tree(outDir(name))) { drift += 1; console.error(`DRIFT ${name}`); } fs.rmSync(target, { recursive: true, force: true }); }
  else console.log(`built ${name}`);
}
if (check) { console.log(drift ? `${drift} fixture(s) differ from a fresh build` : 'adverse fixtures match a fresh build'); process.exit(drift ? 1 : 0); }

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { indexSpec } from '../indexer/index-spec.mjs';
import { annotatePrototype } from '../indexer/design-stages.mjs';
import { homeShort, specContentDigest } from '../lib/project-revision.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => path.resolve(here, '../../../fixtures', n);
const core = vm.createContext({});
vm.runInContext(fs.readFileSync(path.resolve(here, '../shell-src/js/00b-copy-core.js'), 'utf8'), core);
const stages = indexSpec(fx('reader/design-stages'), {});
const data = stages.data;
const page = (d, id) => d.pages.find((p) => p.id === id);
const project = { root: '/work/example-project', specPath: 'spec', rev: 'abc1234' };

test('every rendered markdown line maps to the real source line, also after the reader inserted lines', () => {
  let compared = 0, shifted = 0;
  for (const p of data.pages.filter((x) => x.src)) {
    const raw = fs.readFileSync(path.join(fx('reader/design-stages'), p.src.file), 'utf8').split('\n');
    p.md.split('\n').forEach((line, i) => {
      if (!line.trim() || line.includes('](') || line.startsWith('*Coded screen') || line.startsWith('![')) return;
      const at = core.copyFileLine(p.src, i);
      assert.equal(raw[at - 1].trim(), line.trim(), `${p.id} md line ${i} -> file line ${at}`);
      compared += 1;
      if (p.src.map) shifted += 1;
    });
  }
  assert.ok(compared > 100, `compared ${compared} lines`);
  assert.ok(shifted > 0, 'a page with a not-built image must carry a line map');
});

test('pages whose markdown has no inserted lines carry only a start line', () => {
  const us1 = page(data, 'us-01');
  assert.equal(us1.src.file, 'us/US-01.md');
  assert.equal(us1.src.map, undefined);
  const raw = fs.readFileSync(path.join(fx('reader/design-stages'), 'us/US-01.md'), 'utf8').split('\n');
  assert.equal(raw[us1.src.first - 1].trim(), us1.md.split('\n')[0].trim());
  assert.ok(data.pages.filter((p) => p.generated).every((p) => !p.src), 'generated pages have no single source file');
});

test('spec clipboard text has exactly the documented shape', () => {
  const text = core.copyFormatSpec({
    text: 'Người dùng lưu bộ lọc.\n\nBộ lọc mở lại đúng kết quả.', rel: 'us/US-01.md', start: 22, end: 25, ids: ['US-01', 'US-01.AC-01'], heading: '3. Acceptance criteria',
    anchor: 'us-01.3-acceptance-criteria', project, request: 'Rút gọn thành một câu',
  });
  assert.equal(text, [
    'Sửa đoạn spec này:', '',
    '> Người dùng lưu bộ lọc.', '>', '> Bộ lọc mở lại đúng kết quả.', '',
    '- File: spec/us/US-01.md:22-25',
    '- Mục: US-01, US-01.AC-01 › "3. Acceptance criteria"',
    '- Trang reader: #us-01.3-acceptance-criteria',
    '- Project: /work/example-project (spec @ abc1234)', '',
    'Yêu cầu của tôi: Rút gọn thành một câu',
  ].join('\n'));
  assert.match(core.copyFormatSpec({ text: 'x', rel: 'a.md', start: 1, end: 1, ids: [], heading: '', anchor: 'a', project: { ...project, specPath: '' }, request: '  ' }), /- File: a\.md:1-1\n- Mục: \(không rõ\)\n[\s\S]*Yêu cầu của tôi: \(chưa nhập\)$/);
});

test('a generated page never gets a made-up source line', () => {
  const text = core.copyFormatSpec({ text: 'Open items', generated: true, pageId: 'open-items', pageTitle: 'Open items', sources: ['us/US-02.md'], ids: ['US-02'], heading: 'Blocking', anchor: 'open-items.blocking', project, request: '' });
  assert.match(text, /- File: Trang tạo tự động "Open items" \(generated:open-items\) · nguồn: spec\/us\/US-02\.md\n/);
  assert.ok(!/\.md:\d/.test(text));
  assert.match(core.copyFormatSpec({ text: 'x', generated: true, pageId: 'po-view', pageTitle: 'Product owner view', sources: [], ids: [], heading: '', anchor: 'po-view', project, request: '' }), /không có dòng nguồn duy nhất/);
});

test('prototype clipboard text has exactly the documented shape', () => {
  const text = core.copyFormatPrototype({ screen: 'SCR-001', title: 'Saved filters', state: 'normal', role: 'link', text: 'Save filter', line: 36, related: ['US-01', 'US-01.AC-01'], project, request: 'Đổi thành nút chính' });
  assert.equal(text, [
    'Sửa phần tử prototype này:', '',
    '- Màn: SCR-001 Saved filters · state: normal',
    '- Phần tử: link "Save filter"',
    '- File: spec/prototype/index.html:36',
    '- Liên quan: US-01, US-01.AC-01',
    '- Project: /work/example-project (spec @ abc1234)', '',
    'Yêu cầu của tôi: Đổi thành nút chính',
  ].join('\n'));
});

test('the prototype copy records the true source line of every start tag and moves no line', () => {
  const raw = fs.readFileSync(path.join(fx('reader/design-stages'), 'prototype/index.html'), 'utf8');
  const { html, tags } = annotatePrototype(raw);
  assert.ok(tags > 50);
  assert.equal(html.replace(/ data-src-line="\d+"/g, ''), raw, 'only attributes are added');
  assert.equal(html.split('\n').length, raw.split('\n').length);
  const lines = raw.split('\n');
  for (const m of html.matchAll(/<([a-z0-9]+) data-src-line="(\d+)"([^>]*)>/gi)) {
    const at = Number(m[2]);
    assert.ok(lines.slice(at - 1).join('\n').trimStart().length > 0);
    const idm = /\sid="([^"]+)"/.exec(m[3]);
    if (idm) assert.ok(lines[at - 1].includes(`id="${idm[1]}"`), `${idm[1]} is on line ${at}`);
  }
  const input = /<input data-src-line="(\d+)" id="SCR-001--normal-name"/.exec(html);
  assert.ok(input);
  assert.ok(lines[Number(input[1]) - 1].includes('id="SCR-001--normal-name"'));
  const comment = annotatePrototype('<p>a</p>\n<!-- <b>x</b>\n-->\n<style>\n.a>b{}\n</style>\n<p>c</p>\n');
  assert.ok(!/<b data-src-line/.test(comment.html));
  assert.match(comment.html, /<p data-src-line="7">c<\/p>/);
});

test('prototype screens carry the title and the ids of their trace line', () => {
  const d = data.prototype;
  assert.equal(d.file, 'prototype/index.html');
  assert.deepEqual(d.screens.map((s) => s.id), ['SCR-001--normal', 'SCR-001--empty', 'SCR-001--error', 'SCR-001--loading', 'SCR-002--normal', 'SCR-002--empty', 'SCR-002--error', 'SCR-002--loading']);
  const first = d.screens[0];
  assert.deepEqual([first.screen, first.state, first.title, first.line], ['SCR-001', 'normal', 'Saved filters', 32]);
  assert.ok(first.related.includes('US-01') && first.related.includes('US-01.AC-02'));
});

test('wireframes and prototype form their own group; Overview no longer holds the wireframes page', () => {
  const wf = page(data, 'wireframe-plan'), proto = page(data, 'prototype');
  assert.deepEqual([wf.artifact, wf.tier, wf.kind], [91, 'design', 'wireframes']);
  assert.deepEqual([proto.artifact, proto.tier, proto.kind, proto.generated], [91, 'design', 'prototype', true]);
  assert.ok(data.artifacts.some((a) => a.n === 91 && a.name === 'Wireframes & prototype' && a.files === 2));
  assert.ok(data.tiers.some((t) => t.id === 'design' && t.count === 2));
  assert.deepEqual(data.orderArtifact.filter((id) => ['wireframe-plan', 'prototype', 'po-view'].includes(id)), ['po-view', 'wireframe-plan', 'prototype']);
  assert.deepEqual(wf.stage.screens.map((s) => [s.id, s.title]), [['SCR-001', 'Saved filters'], ['SCR-002', 'Filter result']]);
  assert.equal(wf.stage.flows[0].path, 'SCR-001 --Save filter--> SCR-002');
});

test('without the stage files there is no prototype page and the group stays empty', () => {
  const full = indexSpec(fx('v2/full'), {}).data;
  assert.equal(page(full, 'prototype'), undefined);
  assert.equal(full.prototype, undefined);
  assert.ok(!full.artifacts.some((a) => a.n === 91));
  assert.ok(!full.pages.find((p) => p.id === 'po-view').md.includes('stage-links'));
});

test('the PO view Design preview links Wireframes and Prototype when they exist', () => {
  const md = page(data, 'po-view').md;
  assert.match(md, /class="stage-links"[^>]*>[^]*href="#wireframe-plan"[^]*Wireframes[^]*href="#prototype"[^]*Prototype/);
  const wfOnly = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'wf-only-'));
  try {
    fs.cpSync(fx('reader/design-stages'), wfOnly, { recursive: true });
    fs.rmSync(path.join(wfOnly, 'prototype'), { recursive: true });
    const only = indexSpec(wfOnly, {}).data;
    assert.match(page(only, 'po-view').md, /href="#wireframe-plan"/);
    assert.ok(!/href="#prototype"/.test(page(only, 'po-view').md));
  } finally { fs.rmSync(wfOnly, { recursive: true, force: true }); }
});

test('the project line writes home as ~ and falls back to a content digest outside git', () => {
  assert.equal(homeShort('/home/me/work/x', '/home/me'), '~/work/x');
  assert.equal(homeShort('/elsewhere/x', '/home/me'), '/elsewhere/x');
  assert.equal(specContentDigest([{ rel: 'b.md', raw: '2' }, { rel: 'a.md', raw: '1' }]), specContentDigest([{ rel: 'a.md', raw: '1' }, { rel: 'b.md', raw: '2' }]));
  assert.notEqual(specContentDigest([{ rel: 'a.md', raw: '1' }]), specContentDigest([{ rel: 'a.md', raw: '2' }]));
  assert.match(data.source.root, /^~\//);
  assert.ok(data.source.rev.length >= 7 && data.source.specPath.endsWith('fixtures/reader/design-stages'));
});

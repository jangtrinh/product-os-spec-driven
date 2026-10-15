// Core of the readable-layer check, shared by check-epic-map.mjs (CLI) and tools/spec-reader/lint (Spec Format v1).
// createEpicMapChecker(userConfig, baseDir) returns { C, check, loadBuildSpec, selfTest, at, read, opt, storiesOf }.
import fs from 'node:fs';
import path from 'node:path';

export function createEpicMapChecker(user, BASE) {
  const D = {
    mapFile: 'readable/epic-map.json', releasePage: 'readable/00-overview.md', prunePage: null,
    build: { storiesDir: 'prd/us', storyFile: '^(US|NF)-[0-9P]+\\.md$', storyId: '\\b(?:US|NF)-[0-9P]+\\b', indexFile: 'prd/us/INDEX.md',
      indexRow: '^\\| ((?:US|NF)-[0-9P]+)\\.md \\|', indexReqColumn: 3, prdFile: 'prd/PRD.md', reqRow: '^\\| (REQ-\\d{2}) \\|', reqId: 'REQ-\\d{2}' },
    epics: { min: 6, max: 8 }, capabilities: { min: 3, max: 7 }, backlogStatus: 'Backlog',
    sections: {
      page: ['## Mục tiêu', '## Ai dùng', '## Thay đổi gì với người dùng', '## Phạm vi', '## Không thuộc epic này', '## Câu hỏi mở', '## Build detail'],
      block: ['#### 1. User Story', '#### 2. Flow', '#### 3. Dữ liệu và quy tắc', '#### 4. Acceptance Criteria', '#### 5. Edge cases', '#### 6. UI'],
      release: ['## Bối cảnh và vấn đề', '## Mục tiêu và KPI', '## Phạm vi', '## Người dùng và vai trò', '## Scope', '## Thuật ngữ'],
      scope: '## Phạm vi', releaseScope: '## Scope', buildDetail: '## Build detail', ac: '#### 4. Acceptance Criteria',
      acHeader: '| ID | Given | When | Then |', acEmpty: 'Chưa có trong build spec' },
    hiddenCode: '\\b(?:SCN|DL|OI|TD|CI)-\\d|\\(\\s*(?:\\d+|n)\\s*\\)',
  };
  const C = { ...D, ...user, build: { ...D.build, ...user.build }, epics: { ...D.epics, ...user.epics }, capabilities: { ...D.capabilities, ...user.capabilities }, sections: { ...D.sections, ...user.sections } };
  const at = (p) => path.resolve(BASE, p);
  const read = (p) => fs.readFileSync(p, 'utf8');
  const opt = (p) => (p && fs.existsSync(at(p)) ? read(at(p)) : null);
  const idsOf = (s) => [...new Set(s.match(new RegExp(C.build.storyId, 'g')) || [])].sort();
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const storiesOf = (c) => [...c.us, ...(c.merged || []).map((m) => m.us)];
  const HIDDEN = new RegExp(C.hiddenCode);

  function loadBuildSpec() {
    const b = C.build;
    const storyIds = fs.readdirSync(at(b.storiesDir)).filter((f) => new RegExp(b.storyFile).test(f)).map((f) => f.replace(/\.md$/, ''));
    const reqIds = new Set((read(at(b.prdFile)).match(new RegExp(b.reqRow, 'gm')) || []).map((r) => r.match(new RegExp(b.reqId))[0]));
    const reqOf = {};
    for (const line of read(at(b.indexFile)).split('\n')) {
      const m = line.match(new RegExp(b.indexRow));
      if (m) reqOf[m[1]] = [...new Set(line.split('|')[b.indexReqColumn].match(new RegExp(b.reqId, 'g')) || [])].sort();
    }
    return { storyIds, reqIds, reqOf };
  }
  const section = (md, heading, stop = /^#{1,3} /m) => {
    const i = md.indexOf(`${heading}\n`);
    if (i < 0) return null;
    const rest = md.slice(i + heading.length + 1);
    const end = rest.search(stop);
    return end < 0 ? rest : rest.slice(0, end);
  };
  const hasRow = (scope, id) => new RegExp(`^\\| \\**${id}\\** \\|`, 'm').test(scope);

  function checkPlacement(map, spec, errors) {
    const seen = new Map();
    const note = (id, where) => seen.set(id, [...(seen.get(id) || []), where]);
    const core = map.epics.filter((e) => e.status !== C.backlogStatus);
    if (core.length < C.epics.min || core.length > C.epics.max) errors.push(`expected ${C.epics.min}-${C.epics.max} user-goal epics, found ${core.length}`);
    for (const e of map.epics) {
      for (const k of ['id', 'slug', 'title', 'goal', 'roles', 'capabilities', 'screens', 'status']) if (!e[k] || (Array.isArray(e[k]) && !e[k].length)) errors.push(`${e.id || '?'}: missing ${k}`);
      if (!map.statuses?.[e.status]) errors.push(`${e.id}: unknown status ${e.status}`);
      const n = e.capabilities?.length || 0;
      if (e.status !== C.backlogStatus && (n < C.capabilities.min || n > C.capabilities.max)) errors.push(`${e.id}: ${n} capabilities (want ${C.capabilities.min}-${C.capabilities.max})`);
      for (const c of e.capabilities || []) {
        for (const k of ['id', 'title', 'text', 'done_when']) if (!c[k]) errors.push(`${c.id}: missing ${k}`);
        if (!map.statuses?.[c.status]) errors.push(`${c.id}: unknown status ${c.status}`);
        for (const u of storiesOf(c)) note(u, `${e.id} ${c.id}`);
        for (const r of c.req || []) if (!spec.reqIds.has(r)) errors.push(`${c.id}: REQ id does not exist: ${r}`);
        const want = [...new Set(storiesOf(c).flatMap((u) => spec.reqOf[u] || []))].sort();
        if (!same(want, c.req || [])) errors.push(`${c.id}: REQ list drifts from the story index (want ${want.join(', ')})`);
      }
    }
    for (const h of map.hidden || []) {
      note(h.us, 'hidden');
      for (const k of ['reason', 'category', 'decision', 'decision_date', 'confidence']) if (!h[k]) errors.push(`hidden ${h.us}: missing ${k}`);
    }
    const exists = new Set(spec.storyIds);
    for (const [id, where] of seen) {
      if (!exists.has(id)) errors.push(`story id does not exist: ${id} (${where.join('; ')})`);
      else if (where.length > 1) errors.push(`story appears ${where.length} times: ${id} (${where.join('; ')})`);
    }
    for (const id of spec.storyIds) if (!seen.has(id)) errors.push(`story missing from the map: ${id}`);
  }

  function checkAcTable(where, body, errors) {
    if (body.includes(C.sections.acEmpty) && !/^\|\s*\**AC-/m.test(body)) return;
    if (!body.split('\n').some((l) => l.trim() === C.sections.acHeader)) errors.push(`${where}: AC table header must be "${C.sections.acHeader}"`);
    const rows = body.split('\n').filter((l) => /^\|\s*\**AC-\d+/.test(l));
    if (!rows.length) errors.push(`${where}: no AC row (write "${C.sections.acEmpty}" if the build spec has none)`);
    for (const r of rows) {
      const cells = r.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
      if (cells.length !== 4 || cells.some((x) => !x)) errors.push(`${where}: AC row is not Given / When / Then: ${r.slice(0, 60)}`);
    }
  }

  function checkPage(e, md, errors) {
    for (const s of C.sections.page) if (!md.includes(`${s}\n`)) errors.push(`${e.id}: page lacks section "${s}"`);
    const scope = section(md, C.sections.scope) || '';
    for (const c of e.capabilities) if (!hasRow(scope, c.id)) errors.push(`${e.id}: Scope table lacks ${c.id}`);
    for (const c of e.capabilities) {
      const head = md.match(new RegExp(`^### ${c.id} — .+$`, 'm'));
      if (!head) { errors.push(`${c.id}: capability block "### ${c.id} — <name>" missing`); continue; }
      const rest = md.slice(head.index + head[0].length);
      const end = rest.search(/^#{2,3} /m);
      const block = end < 0 ? rest : rest.slice(0, end);
      for (const s of C.sections.block) if (!block.includes(s)) errors.push(`${c.id}: block lacks "${s}"`);
      const ac = section(block, C.sections.ac, /^#### /m);
      if (ac != null) checkAcTable(c.id, ac, errors);
      const bd = block.split('\n').filter((l) => l.startsWith('Build detail:')).pop();
      if (!bd) { errors.push(`${c.id}: block lacks its "Build detail:" line`); continue; }
      if (!same(idsOf(bd), storiesOf(c))) errors.push(`${c.id}: Build detail stories ${idsOf(bd)} ≠ map ${storiesOf(c)}`);
      const reqs = [...new Set(bd.match(new RegExp(C.build.reqId, 'g')) || [])];
      if (!same(reqs, c.req)) errors.push(`${c.id}: Build detail REQs ${reqs} ≠ map ${c.req}`);
    }
    const stories = (section(md, C.sections.buildDetail, /^## /m) || '').split('\n').find((l) => l.startsWith('- Stories:')) || '';
    if (!same(idsOf(stories), e.capabilities.flatMap(storiesOf))) errors.push(`${e.id}: "${C.sections.buildDetail}" Stories line disagrees with the map`);
    const prose = md.replace(/^Build detail:.*$/gm, '').replace(new RegExp(`${C.sections.buildDetail}[\\s\\S]*`), '').replace(/\]\([^)]*\)/g, ']').replace(/<https?:[^>]*>/g, '');
    const hit = prose.match(HIDDEN);
    if (hit) errors.push(`${e.id}: internal code or "(n)" count in readable text: "${hit[0]}"`);
  }

  function check(map, spec, docs) {
    const errors = [];
    checkPlacement(map, spec, errors);
    for (const e of map.epics.filter((x) => x.page)) {
      if (docs.pages[e.id] == null) errors.push(`${e.id}: page ${e.page} missing`);
      else checkPage(e, docs.pages[e.id], errors);
    }
    if (docs.release == null) errors.push(`release page ${C.releasePage} missing`);
    else {
      for (const s of C.sections.release) if (!docs.release.includes(`${s}\n`)) errors.push(`release page lacks section "${s}"`);
      const scope = section(docs.release, C.sections.releaseScope, /^## /m) || '';
      for (const c of map.epics.flatMap((e) => e.capabilities)) if (!hasRow(scope, c.id)) errors.push(`release Scope table lacks ${c.id}`);
      const hit = docs.release.replace(/^Build detail:.*$/gm, '').replace(/\]\([^)]*\)/g, ']').match(HIDDEN);
      if (hit) errors.push(`release page: internal code or "(n)" count: "${hit[0]}"`);
    }
    if (C.prunePage) {
      if (docs.prune == null) errors.push(`${C.prunePage} missing`);
      else for (const h of map.hidden || []) if (!docs.prune.includes(h.us)) errors.push(`${C.prunePage} lacks ${h.us}`);
    }
    return errors;
  }

  function selfTest(map, spec, docs) {
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const first = map.epics.find((e) => e.page);
    const cap = first.capabilities[0];
    const onPage = (fn) => (m, d) => { d.pages[first.id] = fn(d.pages[first.id]); };
    const cases = [
      ['missing story', (m) => { m.epics.find((e) => e.id === first.id).capabilities[0].us.shift(); }, /missing from the map/],
      ['unknown story id', (m) => { (m.hidden ||= []).push({ us: 'US-99', reason: 'x', category: 'x', decision: 'x', decision_date: 'x', confidence: 'low' }); }, /does not exist: US-99/],
      ['unknown REQ id', (m) => { m.epics.find((e) => e.id === first.id).capabilities[0].req.push('REQ-99'); }, /REQ id does not exist: REQ-99/],
      ['REQ drift', (m) => { m.epics.find((e) => e.id === first.id).capabilities[0].req.pop(); }, /drifts from the story index/],
      ['block lacks a section', onPage((p) => p.replace(C.sections.block[4], '#### Five')), new RegExp(`${cap.id}: block lacks`)],
      ['block lacks Build detail', onPage((p) => p.replace(/^Build detail:.*$/m, '')), new RegExp(`${cap.id}: block lacks its "Build detail:" line`)],
      ['AC row not G/W/T', onPage((p) => p.replace(/^\| \**AC-01\**.*$/m, '| AC-01 | only | three |')), /AC row is not Given \/ When \/ Then/],
      ['Scope row missing', onPage((p) => p.replace(new RegExp(`^\\| \\**${cap.id}\\** \\|`, 'm'), '| X |')), new RegExp(`Scope table lacks ${cap.id}`)],
      ['count in parentheses', onPage((p) => p.replace('## Mục tiêu\n', '## Mục tiêu\n\nProducts (5)\n')), /internal code or "\(n\)" count/],
    ];
    let ok = true;
    for (const [name, mutate, expect] of cases) {
      const m = clone(map), d = clone(docs);
      mutate(m, d);
      const caught = check(m, spec, d).some((e) => expect.test(e));
      console.log(`${caught ? 'RED as expected' : 'NOT CAUGHT'} — ${name}`);
      ok &&= caught;
    }
    return ok;
  }


  return { C, check, loadBuildSpec, selfTest, at, read, opt, storiesOf, idsOf };
}

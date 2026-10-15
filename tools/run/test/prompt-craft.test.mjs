import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {STAGES} from '../../lib/config/config-loader.mjs';
import {writerPrompt, stageContext} from '../stage-context.mjs';
import {reviewerPrompt, parseReview} from '../review-results.mjs';
import {declaredOutputs} from '../project-registries.mjs';
import {isAllocatedPattern, outputPatternFromToken} from '../../lib/output-patterns.mjs';
import {loadRegistries} from '../registries.mjs';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {hasKitHistory} from './kit-history.mjs';

const kit = fileURLToPath(new URL('../../../', import.meta.url));
const read = file => fs.readFileSync(path.join(kit, file), 'utf8');
const banned = /\bcaps?\b|exit[ -]codes?|\bpins?\b|\bhash(?:es)?\b|\bdigests?\b|\bbăm\b|--(?:as|head|base|build)\b|scope-version-required|mã [234]\b|effective.config|bound gate definition|candidate membership|\bNOT_REQUIRED\b/iu;
test('composed instructions are bounded, share rules once, and contain no runner internals', () => {
  const common = read('prompts/_common.md');
  for (const stage of STAGES) {
    const prompt = writerPrompt(kit, stage, [], declaredOutputs(kit, stage));
    assert.ok(prompt.trimEnd().split('\n').length <= 120, stage);
    assert.doesNotMatch(prompt, banned, stage);
    assert.equal(prompt.split(common.trim()).length - 1, 1, stage);
    assert.match(read(`prompts/${stage}.md`), /^## Skill capability/m);
    assert.match(read(`prompts/${stage}.md`), /Ví dụ chưa tốt:/);
    assert.match(read(`prompts/${stage}.md`), /Ví dụ tốt:/);
    const craft = read(`prompts/${stage}.md`).split('## Cách viết')[1]?.split('\n## ')[0] ?? '';
    assert.ok((craft.match(/^- /gm) ?? []).length >= 6, stage);
  }
  const prompt = reviewerPrompt(kit, [], [], 'rubric', () => '', read('prompts/reviewer.md'));
  assert.ok(prompt.trimEnd().split('\n').length <= 120);
  assert.doesNotMatch(prompt, banned);
  assert.match(prompt, /^## Skill capability/m);
  assert.doesNotMatch(prompt, /## Định dạng kết quả writer/);
  assert.match(prompt, /OPEN\[blocking\]/);
});
test('reviewer example is a complete parsable review with its stated verdict', () => {
  const example = /```(?:text|markdown)\n(VERDICT:[\s\S]*?)\n```/m.exec(read('prompts/reviewer.md'));
  // The example uses an outer four-backtick fence so the JSON fence stays literal.
  const outer = /````markdown\n([\s\S]*?)\n````/m.exec(read('prompts/reviewer.md'));
  assert.ok(outer ?? example, 'missing complete example');
  assert.equal(parseReview((outer ?? example)[1], true).verdict, 'PASS');
});
test('all concrete output lists match the frozen base declarations', t => {
 if (!hasKitHistory(t, kit, 'ccd9b68')) return;
  for (const stage of STAGES.filter(s => !['wireframe','prototype'].includes(s))) {
    const old = execFileSync('git', ['show', `ccd9b68:prompts/${stage}.md`], {cwd: kit, encoding: 'utf8'});
    const section = old.split('## Output files')[1]?.split('\n## ')[0] ?? '';
    const paths = [...section.matchAll(/^- `((?:spec|review)\/[A-Za-z0-9_./-]+\.(?:md|json))(?=[` ;])/gm)].map(row => row[1]);
    const declared = declaredOutputs(kit, stage);
    assert.deepEqual(declared.filter(entry => !isAllocatedPattern(entry)), [...new Set(paths)].sort(), stage);
    const current = read(`prompts/${stage}.md`).split('## Output files')[1]?.split('\n## ')[0] ?? '';
    const tokens = [...current.matchAll(/^- `((?:spec|review)\/[^`\s;]*<[^>\s]+>[^`\s;]*)/gm)].map(row => row[1]);
    assert.deepEqual(declared.filter(isAllocatedPattern), [...new Set(tokens.map(outputPatternFromToken).filter(Boolean))].sort(), stage);
  }
});
test('shared prompt bytes are included in stage input pins', t => {
  const p = projectFixture(t);
  p.write('prompts/_common.md', 'Shared source rules\n');
  const before = stageContext(p.root, p.config, loadRegistries(p.root, p.config), 'prd');
  assert.ok(before.inputs['prompts/_common.md']);
  p.write('prompts/_common.md', 'Changed source rules\n');
  const after = stageContext(p.root, p.config, loadRegistries(p.root, p.config), 'prd');
  assert.notEqual(before.inputs['prompts/_common.md'], after.inputs['prompts/_common.md']);
});
test('runner-internal assertion rejects a planted NOT_REQUIRED mechanic', () => {
  const control = writerPrompt(kit, 'intake', [], declaredOutputs(kit, 'intake'));
  assert.doesNotMatch(control, banned);
  assert.throws(() => assert.doesNotMatch(`${control}\nNOT_REQUIRED chỉ bỏ bước chờ người.`, banned), assert.AssertionError);
});
test('every composed writer and reviewer retains human authority and conflict escalation', () => {
  const prompts = [...STAGES.map(stage => [stage, writerPrompt(kit, stage, [], declaredOutputs(kit, stage))]),
    ['reviewer', reviewerPrompt(kit, [], [], 'rubric', () => '', read('prompts/reviewer.md'))]];
  for (const [stage, prompt] of prompts) {
    assert.match(prompt, /Tác tử tự động không bao giờ ghi, nhập hoặc ký phê duyệt\/quyết định thay người/, stage);
    assert.match(prompt, /không dùng danh tính của người/, stage);
    assert.match(prompt, /Danh tính khai tại máy cục bộ không là xác thực/, stage);
    assert.match(prompt, /Khi nguồn hoặc schema mâu thuẫn, dừng phần phụ thuộc và hỏi người có quyền/, stage);
  }
});
test('clarification and expected-change records keep their project and export destinations', () => {
  assert.ok(read('prompts/clarify.md').includes('review/clarify/Q-<nnn>.json'));
  assert.ok(read('prompts/clarify.md').includes('records/clarify/'));
  assert.ok(read('prompts/tdd.md').includes('review/expected/XC-<nnn>.json'));
  assert.ok(read('prompts/tdd.md').includes('records/expected/'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {slug} from '../../lib/slug.mjs';
import {loadSpec} from '../../lib/spec-load.mjs';
import {buildModel} from '../../lib/doc-model.mjs';
import {indexSpec} from '../../reader/indexer/index-spec.mjs';

// The browser shell is what users click: Node anchors must equal the ids it renders.
const kit = fileURLToPath(new URL('../../../', import.meta.url));
const shellSource = fs.readFileSync(fileURLToPath(new URL('../../reader/shell-src/js/00-slug.js', import.meta.url)), 'utf8');
function browserSlug(reserved) {
  const context = vm.createContext({});
  vm.runInContext(`${shellSource}\n;globalThis.api = {slugify, uniqueSlug, reserveIds, scanHeadings};`, context);
  context.api.reserveIds(reserved);
  return context.api;
}
// The reserve sets are not hand-written: the browser gets what the reader really produces for the spec,
// Node gets what buildModel reserves for the same spec.
const spec = `${kit}fixtures/v2/full`;
const {data} = indexSpec(spec);
const browserReserved = [...data.generated, ...data.pages.map(page => page.id)];
// buildModel owns the process-wide reservations of the last model it built, so each test builds it again first.
const nodeSide = () => buildModel(loadSpec(spec));

const HEADINGS = [
  'Saved filters', 'Saved filters', 'Saved filters', 'Bộ lọc đã lưu', 'Đổi tên bộ lọc', '!!!', '???',
  'Decisions', 'Decisions', 'Start', 'Po view',
  'A very long heading that keeps going past the sixty-four character limit of an id', 'A very long heading that keeps going past the sixty-four character limit of an id, again',
  'Section', 'Section', 'section-2',
];
const idsOf = api => { const seen = {}; return HEADINGS.map(text => api.uniqueSlug(api.slugify(text), seen)); };

test('Node slug helpers give the same ids as the browser shell when each side reserves its real page ids', () => {
  nodeSide();
  assert.deepEqual(idsOf(slug), idsOf(browserSlug(browserReserved)));
});
test('duplicate headings number from -2 and never reuse a reserved page id', () => {
  nodeSide();
  const seen = {};
  assert.deepEqual(['Saved filters', 'Saved filters', 'Saved filters'].map(text => slug.uniqueSlug(slug.slugify(text), seen)), ['saved-filters', 'saved-filters-2', 'saved-filters-3']);
  assert.equal(slug.uniqueSlug('po-view', {}), 'po-view-2');
});
test('scanHeadings assigns the browser ids to a markdown body', () => {
  nodeSide();
  const md = HEADINGS.map((text, index) => `${'#'.repeat(1 + (index % 3))} ${text}\n\nBody ${index}\n`).join('\n') + '\n```\n# Not a heading\n```\n';
  assert.deepEqual(slug.scanHeadings(md).map(h => h.id), Array.from(browserSlug(browserReserved).scanHeadings(md), h => h.id));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {slug} from '../../lib/slug.mjs';
import {loadSpec} from '../../lib/spec-load.mjs';
import {buildModel} from '../../lib/doc-model.mjs';
import {lintSpec} from '../../lint/index.mjs';
import {indexSpec} from '../../reader/indexer/index-spec.mjs';

const kit = fileURLToPath(new URL('../../../', import.meta.url));
const shellSource = fs.readFileSync(path.join(kit, 'tools/reader/shell-src/js/00-slug.js'), 'utf8');
const LEDGER = 'decisions/decision-log.md';
const rows = /^\| D\d+ .*\n/gm;

// A copy of the generic full fixture; edit lets a test reshape the ledger.
function specCopy(t, edit = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slug-reserved-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.cpSync(path.join(kit, 'fixtures/v2/full'), dir, {recursive: true});
  const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
  const write = (rel, text) => fs.writeFileSync(path.join(dir, rel), text);
  edit({read, write});
  return dir;
}
const withoutRows = ({read, write}) => write(LEDGER, `${read(LEDGER).replace(rows, '')}\n## Decisions\n\nNo ruling is recorded yet.\n`);
const withRows = ({read, write}) => write(LEDGER, `${read(LEDGER)}\n## Decisions\n\nEvery ruling is listed above.\n`);
const linkTo = fragment => ({read, write}) => write('contract/FC-001.md', `${read('contract/FC-001.md')}\nSee the [ledger](../${LEDGER}#${fragment}).\n`);
const compose = (...edits) => api => edits.forEach(edit => edit(api));
const headingId = (dir, text) => {
  const model = buildModel(loadSpec(dir));
  return slug.scanHeadings(model.ledger.body).find(h => h.text === text)?.id;
};
const fragmentErrors = dir => lintSpec(dir).problems.list.filter(problem => problem.code === 'L-LINK-FRAGMENT');
// The browser reserves every page id it ends up with: generated pages first, then the content pages.
function browserHeadingIds(dir, markdown) {
  const {data} = indexSpec(dir);
  const context = vm.createContext({});
  vm.runInContext(`${shellSource}\n;globalThis.api = {reserveIds, scanHeadings};`, context);
  context.api.reserveIds([...data.generated, ...data.pages.map(page => page.id)]);
  return Array.from(context.api.scanHeadings(markdown), h => h.id);
}

test('a Decisions heading keeps the id decisions when the ledger has no decision rows (no decisions page exists)', t => {
  const dir = specCopy(t, compose(withoutRows, linkTo('decisions')));
  assert.equal(headingId(dir, 'Decisions'), 'decisions');
  assert.deepEqual(fragmentErrors(dir), []);
  const {data} = indexSpec(dir);
  assert.ok(!data.generated.includes('decisions'));
  assert.deepEqual(browserHeadingIds(dir, fs.readFileSync(path.join(dir, LEDGER), 'utf8')).filter(id => id.startsWith('decisions')), ['decisions']);
});

test('with decision rows the generated decisions page exists, so lint and the browser both number the heading decisions-2', t => {
  const dir = specCopy(t, compose(withRows, linkTo('decisions')));
  assert.equal(headingId(dir, 'Decisions'), 'decisions-2');
  assert.equal(fragmentErrors(dir).length, 1, 'the #decisions link no longer resolves, exactly as in the reader');
  const {data} = indexSpec(dir);
  assert.ok(data.generated.includes('decisions'));
  const body = buildModel(loadSpec(dir)).ledger.body;
  assert.deepEqual(slug.scanHeadings(body).map(h => h.id), browserHeadingIds(dir, body));
});

test('reservations do not leak from one model build into the next', t => {
  buildModel(loadSpec(specCopy(t, withRows)));
  assert.equal(slug.uniqueSlug('decisions', {}), 'decisions-2');
  buildModel(loadSpec(specCopy(t, withoutRows)));
  assert.equal(slug.uniqueSlug('decisions', {}), 'decisions');
  assert.equal(slug.uniqueSlug('saved-filters-leak', {}), 'saved-filters-leak');
});

test('a Prototype heading is numbered like the browser when prototype/index.html makes the reader create the prototype page', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slug-prototype-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  fs.cpSync(path.join(kit, 'fixtures/reader/design-stages'), dir, {recursive: true});
  const readme = path.join(dir, 'README.md');
  fs.writeFileSync(readme, `${fs.readFileSync(readme, 'utf8')}\n## Prototype\n\nThe click-through is a separate page.\n`);
  assert.ok(fs.existsSync(path.join(dir, 'prototype/index.html')));
  const model = buildModel(loadSpec(dir));
  const doc = model.docs.find(d => d.rel === 'README.md');
  assert.equal(slug.scanHeadings(doc.body).find(h => h.text === 'Prototype').id, 'prototype-2');
  assert.deepEqual(slug.scanHeadings(doc.body).map(h => h.id), browserHeadingIds(dir, doc.body));
  const without = fs.mkdtempSync(path.join(os.tmpdir(), 'slug-no-prototype-'));
  t.after(() => fs.rmSync(without, {recursive: true, force: true}));
  fs.cpSync(dir, without, {recursive: true}); fs.rmSync(path.join(without, 'prototype'), {recursive: true});
  const bare = buildModel(loadSpec(without));
  assert.equal(slug.scanHeadings(bare.docs.find(d => d.rel === 'README.md').body).find(h => h.text === 'Prototype').id, 'prototype');
});

test('the lint reserve set equals the page ids the reader ends up with (design-stages fixture)', () => {
  const dir = path.join(kit, 'fixtures/reader/design-stages');
  const {data} = indexSpec(dir);
  assert.ok(data.pages.some(page => page.id === 'prototype'));
  assert.deepEqual([...buildModel(loadSpec(dir)).reservedIds].sort(), [...new Set([...data.generated, ...data.pages.map(page => page.id)])].sort());
});

test('the lint reserve set equals the page ids the reader ends up with', t => {
  const noAmendments = ({read, write}) => write('contract/FC-001.md', read('contract/FC-001.md').replace(/^# Amendment .*$/gm, '# Notes'));
  for (const edit of [() => {}, withoutRows, noAmendments]) {
    const dir = specCopy(t, edit);
    const {data} = indexSpec(dir);
    const model = buildModel(loadSpec(dir));
    assert.equal(data.generated.includes('amendments'), edit !== noAmendments);
    assert.deepEqual([...model.reservedIds].sort(), [...new Set([...data.generated, ...data.pages.map(page => page.id)])].sort());
  }
});

import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';

export const runtimeSelectionCases = [
  ['directory', 'context', 'input'],
  ['trailing directory', 'context', 'input/'],
  ['glob', 'context', 'input/*.txt'],
  ['recursive glob', 'context', 'input/**/*.txt'],
  ['question glob', 'context', 'input/?xtra.txt'],
  ['character glob', 'context', 'input/[ep]*.txt'],
  ['evaluator glob', 'per_file', 'input/*.txt'],
  ['rubric directory', 'rubric', 'input/'],
  ['empty glob', 'context', 'empty/*.txt', 'empty'],
  ['empty directory', 'context', 'empty/', 'empty'],
  ['invalid glob', 'context', 'input/[bad', 'invalid'],
  ['unreadable selection', 'context', 'input/*.txt', 'unreadable'],
  ['symlink inventory', 'context', 'input/', 'symlink'],
  ...['context', 'rubric', 'per_file'].flatMap(field => [
    [`${field} missing sentinel`, field, '—', 'missing'],
    [`${field} existing sentinel`, field, '—'],
  ]),
];

export function runtimeSelectionFixture(row) {
  const [, field, selection, problem] = row;
  const p = projectFixture(null);
  try {
    p.write('input/extra.txt', 'Additional original source\n');
    p.write('input/nested/extra.txt', 'Nested original source\n');
    if (selection === '—' && !problem) p.write('—', 'Real selected source\n');
    if (field === 'context') p.config.stages.prd.context = [selection];
    if (field === 'per_file') p.config.evals.prd[0].per_file = selection;
    if (field === 'rubric') p.config.review.rubric = selection;
    if (problem === 'empty') fs.mkdirSync(path.join(p.root, 'empty'));
    if (problem === 'unreadable') fs.chmodSync(path.join(p.root, 'input/extra.txt'), 0);
    if (problem === 'symlink') fs.symlinkSync('po-spec.txt', path.join(p.root, 'input/link.txt'));
    p.save();
    return {...p, cleanup: () => fs.rmSync(p.root, {recursive: true, force: true})};
  } catch (error) {
    fs.rmSync(p.root, {recursive: true, force: true});
    throw error;
  }
}

export const runtimeSelectionFixtures = runtimeSelectionCases.map(row => ({
  name: `fixtures/runner/runtime-selection/${row[0]}`, broken: Boolean(row[3]),
  make: () => runtimeSelectionFixture(row),
}));

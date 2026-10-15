import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {materialize, WriterFailure} from '../materialize-output.mjs';

const pattern = 'spec/us/(?:US-[0-9]+|US-P[0-9]+|NF-[0-9]+)[.]md';
const result = '```files\n{"spec/us/US-1.md":"changed"}\n```\n';

for (const alias of ['file', 'directory']) test(`allocated outputs reject an internal ${alias} symlink before writing`, t => {
  const p = projectFixture(t);
  p.write('spec/other/US-1.md', 'Original source.');
  if (alias === 'file') {
    fs.mkdirSync(path.join(p.root, 'spec/us'));
    fs.symlinkSync('../other/US-1.md', path.join(p.root, 'spec/us/US-1.md'));
  } else fs.symlinkSync('other', path.join(p.root, 'spec/us'));
  assert.throws(() => materialize(p.root, [pattern], result), WriterFailure);
  assert.equal(fs.readFileSync(path.join(p.root, 'spec/other/US-1.md'), 'utf8'), 'Original source.');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../run.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));

test('runner refuses readiness on a spec-only export without config/pipeline.yaml', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-only-runner-'));
  try {
    fs.cpSync(path.join(repo, 'fixtures/v2/full'), root, {recursive: true});
    assert.equal(fs.existsSync(path.join(root, 'config/pipeline.yaml')), false);
    const lines = [];
    const code = await run(['--project', root, '--build', 'not-built'], line => lines.push(line));
    assert.notEqual(code, 0);
    assert.ok(!lines.some(line => /All enabled stages settled/.test(line)), lines.join('\n'));
    assert.ok(lines.some(line => /config\/pipeline\.yaml/.test(line)), lines.join('\n'));
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});

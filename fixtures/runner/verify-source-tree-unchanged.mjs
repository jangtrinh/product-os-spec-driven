import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
function snapshot() {
  const result = {};
  function walk(directory, prefix = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      if (['.git', 'node_modules'].includes(name)) continue;
      const file = path.join(directory, name), relative = prefix + name;
      if (fs.lstatSync(file).isDirectory()) walk(file, relative + '/');
      else result[relative] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
  }
  walk(root);
  return result;
}
const before = snapshot();
const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tools/run/test'], {cwd: root, encoding: 'utf8', timeout: 300000, maxBuffer: 16 * 1024 * 1024});
process.stdout.write(child.stdout ?? '');
process.stderr.write(child.stderr ?? '');
assert.deepEqual(snapshot(), before, 'Runner suite changed the source tree');
console.log(`Source tree unchanged: ${Object.keys(before).length} files`);
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;

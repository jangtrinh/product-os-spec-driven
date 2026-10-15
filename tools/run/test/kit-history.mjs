// Upgrade tests that rebuild an older kit from its commit need the pre-2.3.0 development history. The public repository
// starts at 2.3.0, so there these tests skip with the reason instead of failing on a missing object.
import {spawnSync} from 'node:child_process';

export function hasKitHistory(t, kit, ...commits) {
  const missing = commits.filter(commit => spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], {cwd: kit}).status !== 0);
  if (missing.length) t.skip(`needs pre-2.3.0 kit history (missing ${missing.join(', ')})`);
  return missing.length === 0;
}

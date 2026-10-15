import {execFileSync} from 'node:child_process';

// The runner owns the spawn's group even if its leader has already exited.
// The ancestry scan is best-effort extra coverage for observed detached children.
export function processTree(pid, {ownedGroup = true} = {}) {
  const known = new Map();
  function snapshot() {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,lstart='], {encoding: 'utf8'}).trim().split('\n').map(line => {
      const [id, parent, group, ...start] = line.trim().split(/\s+/);
      return {pid: Number(id), parent: Number(parent), group: Number(group), start: start.join(' ')};
    });
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) if (row.pid === pid || (known.has(row.parent) && known.get(row.parent).start === rows.find(r => r.pid === row.parent)?.start)) {
        if (!known.has(row.pid)) {known.set(row.pid, row); changed = true;}
      }
    }
    return rows;
  }
  function signal(kind) {
    if (process.platform === 'win32') {
      try {execFileSync('taskkill', ['/PID', String(pid), '/T', ...(kind === 'SIGKILL' ? ['/F'] : [])], {stdio: 'ignore'});} catch {}
      return;
    }
    if (ownedGroup) try {process.kill(-pid, kind);} catch (error) {if (error.code !== 'ESRCH') throw error;}
    let live;
    try {live = snapshot();} catch {return;}
    for (const row of [...known.values()].reverse()) {
      if (!live.some(current => current.pid === row.pid && current.start === row.start)) continue;
      try {process.kill(row.pid, kind);} catch { /* Best effort; macOS can report EPERM for an exited zombie. */ }
      // Include same-group children even if born between the snapshots.
      if (row.group === row.pid) try {process.kill(-row.pid, kind);} catch { /* Optional detached-group coverage. */ }
    }
  }
  const scan = () => {try {snapshot();} catch { /* ps is optional, group ownership is not. */ }};
  const interval = process.platform === 'win32' ? null : setInterval(scan, 100);
  if (process.platform !== 'win32') scan();
  return {stop: () => clearInterval(interval), async terminate() {
    try {
      signal('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 250));
      signal('SIGKILL');
    } finally {clearInterval(interval);}
  }};
}

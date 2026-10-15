import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const git = (cwd, args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.trim() : null;
};

/* Home directory written as "~" so a clipboard text never carries the user name. */
export function homeShort(p, home = os.homedir()) {
  if (!home) return p;
  if (p === home) return '~';
  return p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

/* Content digest of the spec documents (path + bytes), the stand-in when the spec is not inside a git repository with a commit. */
export function specContentDigest(docs) {
  const h = createHash('sha256');
  for (const d of [...docs].sort((a, b) => (a.rel < b.rel ? -1 : 1))) h.update(`${d.rel}\0${d.raw}\0`);
  return h.digest('hex').slice(0, 12);
}

/* Where the spec lives and which revision a clipboard text points at:
   root       project root (the git top-level when the spec sits in a repository, else the spec folder's parent), home shown as ~
   specPath   spec folder relative to that root ('' when they are the same folder); file paths in a clipboard text start with it
   rev        git short sha (+dirty when the spec folder has uncommitted changes) or a content digest of the spec documents */
export function projectInfo(specRoot, docs) {
  const abs = path.resolve(specRoot);
  const top = git(abs, ['rev-parse', '--show-toplevel']);
  const root = top ? fs.realpathSync(top) : path.dirname(abs);
  const real = fs.realpathSync(abs);
  const specPath = path.relative(root, real).split(path.sep).join('/');
  const sha = top ? git(abs, ['rev-parse', '--short', 'HEAD']) : null;
  if (sha) {
    const dirty = git(abs, ['status', '--porcelain', '--', '.']);
    return { root: homeShort(root), specPath, rev: dirty ? `${sha}+dirty` : sha, revKind: 'git' };
  }
  return { root: homeShort(root), specPath, rev: specContentDigest(docs), revKind: 'digest' };
}

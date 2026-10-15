import fs from 'node:fs';
import path from 'node:path';
export function localPath(root, relative, {missing = false, parent = false} = {}) {
  if (typeof relative !== 'string' || !relative || /[\\\0]|^(?:\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(relative)) throw new Error(`not a local POSIX path: ${relative}`);
  if (!parent && relative.split('/').includes('..')) throw new Error(`parent path forbidden: ${relative}`);
  const base=fs.realpathSync(root), target=path.resolve(base,relative);
  if(target !== base && !target.startsWith(base+path.sep)) throw new Error(`path escapes ${base}: ${relative}`);
  let probe=target;
  while(!fs.existsSync(probe)) {
    if(!missing) throw new Error(`path missing: ${relative}`);
    const next=path.dirname(probe);if(next===probe) throw new Error(`path unavailable: ${relative}`);probe=next;
  }
  const real=fs.realpathSync(probe);
  if(real !== base && !real.startsWith(base+path.sep)) throw new Error(`symlink escapes ${base}: ${relative}`);
  return target;
}

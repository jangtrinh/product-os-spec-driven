import fs from 'node:fs';
import path from 'node:path';

// New wireframe/prototype prompts and templates are covered by the directory inventory below.
// SPEC section 11 installation inputs, plus the reserved eval output tree.
// This classifies authored-document ownership only; selectors still require bytes.
export const kitContentPaths = Object.freeze(['SPEC.md', 'format/', 'templates/', 'rules/', 'prompts/', 'tools/', 'config/pipeline.yaml', 'evals/']);

function sameFile(root, actual, expected) {
  if (actual === expected) return true;
  if (actual.toLowerCase() !== expected.toLowerCase()) return false;
  try {
    const a = fs.statSync(path.join(root, actual)), b = fs.statSync(path.join(root, expected));
    return a.dev === b.dev && a.ino === b.ino;
  } catch {return false;}
}

export function kitContentPath(root, source) {
  const file = path.posix.normalize(source.split('#')[0]);
  const snapshot = /^review\/sources\/[^/]+\/[a-f0-9]{64}\/files\/(.+)$/.exec(file);
  const original = snapshot?.[1] ?? file;
  const base = snapshot ? file.slice(0, file.length - original.length) : '';
  return kitContentPaths.some(owned => {
    if (!owned.endsWith('/')) return sameFile(root, file, base + owned);
    const prefix = owned.slice(0, -1), actual = original.split('/')[0];
    return original.includes('/') && sameFile(root, base + actual, base + prefix);
  });
}

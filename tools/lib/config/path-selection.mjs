import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const TEXT_EXTENSIONS = Object.freeze(['.md', '.txt', '.html', '.htm', '.css', '.json', '.yaml', '.yml', '.csv', '.svg']);
const OS_JUNK = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
export function isOsJunk(file) {
  const base = path.basename(file);
  return base.startsWith('._') || OS_JUNK.has(base.normalize('NFC').toLowerCase());
}
export function isPreparedContextText(file) {
  return !isOsJunk(file) && TEXT_EXTENSIONS.includes(path.extname(file).toLowerCase());
}
export function preparedContextIgnoreReason(file) {
  if (isOsJunk(file)) return 'OS junk file';
  if (isPreparedContextText(file)) return null;
  if (/\.(png|jpe?g|gif|webp|avif|heic)$/i.test(file)) return 'unsupported format: describe the screen in a .md file';
  return 'unsupported format: export as .md / .html / .json UTF-8 text';
}
export class RunnerError extends Error {
  constructor(message, code = 3) { super(message); this.code = code; }
}
export function localPath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(relative) || relative.split('/').includes('..')) {
    throw new RunnerError(`Invalid project-relative path: ${relative}`);
  }
  const base = fs.realpathSync(root); const resolved = path.resolve(base, relative);
  let ancestor = resolved;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const real = fs.realpathSync(ancestor);
  if (real !== base && !real.startsWith(base + path.sep)) throw new RunnerError(`Symlink escapes project: ${relative}`);
  return resolved;
}
export function inventory(root, relative = '.', exclude = []) {
  const files = [];
  function walk(name) {
    if (exclude.some(prefix => name === prefix || name.startsWith(prefix + '/'))) return;
    const file = localPath(root, name); const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      localPath(root, name);
      throw new RunnerError(`Symlink inventories are unsupported: ${name}`);
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file).sort()) {
        if (entry === '.git' || entry === 'node_modules') continue;
        walk(name === '.' ? entry : `${name.replace(/\/$/, '')}/${entry}`);
      }
    } else if (stat.isFile()) files.push(name);
  }
  walk(relative.replace(/\/$/, '') || '.'); return files.sort();
}
function selectionMatcher(pattern) {
  let regex = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') { regex += pattern[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += pattern[i + 2] === '/' ? 2 : 1; }
    else if (ch === '*') regex += '[^/]*';
    else if (ch === '?') regex += '[^/]';
    else if (ch === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end < 0) throw new RunnerError(`Invalid glob: ${pattern}`);
      regex += pattern.slice(i, end + 1); i = end;
    } else regex += ch.replace(/[\\^$+?.()|{}]/g, '\\$&');
  }
  return new RegExp(regex + '$');
}
export function matchesSelection(pattern, file) {
  if (!/[*?[]/.test(pattern)) return file === pattern || file.startsWith(pattern.replace(/\/$/, '') + '/');
  return selectionMatcher(pattern).test(file);
}
function literalGlobPrefix(pattern) {
  const parts = pattern.split('/');
  const index = parts.findIndex(part => /[*?[]/.test(part));
  if (index <= 0) return '.';
  return parts.slice(0, index).join('/');
}
export function selectFiles(root, pattern, {optional = false, exclude = [], preparedText = false} = {}) {
  localPath(root, pattern);
  let files;
  if (/[*?[]/.test(pattern)) {
    const matcher = selectionMatcher(pattern);
    const prefix = literalGlobPrefix(pattern);
    let stat = null;
    if (prefix !== '.') {
      try { stat = fs.lstatSync(localPath(root, prefix)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    // A missing optional prefix is empty. Do not walk the rest of the project.
    files = prefix !== '.' && !stat ? [] : inventory(root, prefix, exclude).filter(file => matcher.test(file));
  } else if (fs.existsSync(localPath(root, pattern))) files = inventory(root, pattern, exclude);
  else files = [];
  files = [...new Set(files)].sort();
  if (preparedText) files = files.filter(isPreparedContextText);
  if (!files.length && !optional) throw new RunnerError(`Missing or empty context/selection: ${pattern}`);
  return files;
}
export function hashes(root, files) {
  return Object.fromEntries([...new Set(files)].sort().map(file => [file, sha256(fs.readFileSync(localPath(root, file)))]));
}
export function writeLocal(root, relative, bytes, {immutable = false} = {}) {
  const file = localPath(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (immutable && fs.existsSync(file)) {
    if (!fs.readFileSync(file).equals(Buffer.from(bytes))) throw new RunnerError(`Immutable record differs: ${relative}`);
    return;
  }
  fs.writeFileSync(file, bytes, immutable ? {flag: 'wx'} : {});
}

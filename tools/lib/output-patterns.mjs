import fs from 'node:fs';
import path from 'node:path';
import {localPath, RunnerError} from './config/path-selection.mjs';

// Regex sources, not globs. selectFiles treats "+" as a literal and "[" as a class.
// No backslash: localPath and the path schema reject "\".
const PLACEHOLDERS = [
  ['<declared-test-path>', '[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*[.][A-Za-z0-9]+(?:[.][A-Za-z0-9]+)*'],
  ['<US-id>', '(?:US-[0-9]+|US-P[0-9]+|NF-[0-9]+)'],
  ['<nnn>', '[0-9]+'],
  ['<n>', '[0-9]+'],
];

export function isAllocatedPattern(entry) {
  return /(?:\(\?:|\[0-9\]|\[A-Za-z|\[\.\])/.test(entry);
}

export function outputPatternFromToken(tokenPath) {
  // Only the closed placeholder table supplies regex syntax. Keep the stored
  // dot spelling for existing declarations; all other metacharacters escape.
  const literal = text => text.replace(/[\\^$.*+?()[\]{}|]/g, ch => ch === '.' ? '[.]' : `\\${ch}`);
  let rest = tokenPath;
  let pattern = '';
  while (rest.length) {
    const found = PLACEHOLDERS.map(([token, source]) => ({token, source, at: rest.indexOf(token)}))
      .filter(row => row.at >= 0)
      .sort((a, b) => a.at - b.at || b.token.length - a.token.length)[0];
    if (!found) {
      if (rest.includes('<')) return null;
      pattern += literal(rest);
      break;
    }
    const prefix = rest.slice(0, found.at);
    if (prefix.includes('<')) return null;
    pattern += literal(prefix) + found.source;
    rest = rest.slice(found.at + found.token.length);
  }
  return pattern;
}

export function patternDirectory(pattern) {
  // Recover the literal directory prefix, skipping escaped punctuation and
  // literal dots rather than treating them as the allocation boundary.
  let prefix = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '\\' && i + 1 < pattern.length) prefix += pattern[++i];
    else if (pattern.slice(i, i + 3) === '[.]') { prefix += '.'; i += 2; }
    else if (/[\[(){}+*?|^$]/.test(pattern[i])) break;
    else prefix += pattern[i];
  }
  const slash = prefix.lastIndexOf('/');
  return slash < 0 ? '' : prefix.slice(0, slash);
}

export function validateAllocatedPath(root, relative) {
  localPath(root, relative);
  let current = fs.realpathSync(root);
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') break; throw error; }
    if (stat.isSymbolicLink()) throw new RunnerError(`Symlink allocated output is unsupported: ${relative}`);
  }
}

function walkFiles(root, directory) {
  const absolute = localPath(root, directory);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  const walk = relative => {
    const file = localPath(root, relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new RunnerError(`Symlink inventories are unsupported: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        if (name === '.git' || name === 'node_modules') continue;
        walk(`${relative}/${name}`);
      }
    } else if (stat.isFile()) files.push(relative);
  };
  walk(directory);
  return files;
}

export function concreteOutputs(root, declarations, {omitMissing = false} = {}) {
  const files = [];
  for (const entry of declarations) {
    const normalized = path.posix.normalize(entry);
    if (isAllocatedPattern(entry)) {
      const directory = patternDirectory(entry);
      if (!directory) continue;
      const matcher = new RegExp(`^(?:${entry})$`);
      for (const file of walkFiles(root, directory)) {
        const safe = file === path.posix.normalize(file) && !file.split('/').includes('..') && file.startsWith(`${directory}/`);
        if (safe && matcher.test(file)) files.push(file);
      }
    } else if (!omitMissing || fs.existsSync(localPath(root, normalized))) files.push(normalized);
  }
  return [...new Set(files)].sort();
}

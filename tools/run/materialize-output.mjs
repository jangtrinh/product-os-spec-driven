import path from 'node:path';
import fs from 'node:fs';
import {parseJson} from '../lib/config/strict-json.mjs';
import {localPath, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {isAllocatedPattern, patternDirectory, validateAllocatedPath} from '../lib/output-patterns.mjs';
import {classifyObservation} from './output-observation.mjs';
import {pathCollisionKey} from '../lib/path-collision-key.mjs';

export class WriterFailure extends Error {}
export function writerFiles(root, outputs, text) {
  const observation = classifyObservation(text, {parse: clean => parseWriterFiles(root, outputs, clean, text)});
  if (!observation.observed) {
    if (observation.error instanceof RunnerError) throw observation.error;
    throw new WriterFailure(`Missing writer observation: ${observation.reason}`);
  }
  return observation.value;
}
function matchesDeclaration(file, declaration) {
  if (!isAllocatedPattern(declaration)) return file === declaration;
  const directory = patternDirectory(declaration);
  return Boolean(directory) && file.startsWith(`${directory}/`) && new RegExp(`^(?:${declaration})$`).test(file);
}
function parseWriterFiles(root, outputs, text, raw) {
  const normalized = outputs.map(file => path.posix.normalize(file));
  if (new Set(normalized).size !== outputs.length) throw new RunnerError('Duplicate normalized definition outputs');
  const literals = normalized.filter(file => !isAllocatedPattern(file));
  const patterns = normalized.filter(isAllocatedPattern);
  if (literals.length === 1 && patterns.length === 0) return {[literals[0]]: raw};
  const blocks = [...text.matchAll(/^```files\r?\n([\s\S]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new WriterFailure('Multiple outputs require exactly one files block');
  let parsed;
  try { parsed = parseJson(blocks[0][1], 'writer files'); } catch (error) { throw new WriterFailure(error.message); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new WriterFailure('files must be a JSON object');
  // Host-independent collision policy: NFC, then JavaScript toLowerCase
  // (locale-independent casing, not full Unicode case folding). This key is
  // only for collision detection; exact declaration matching stays unchanged.
  const collisionKeys = new Map();
  for (const key of Object.keys(parsed)) {
    const canonical = pathCollisionKey(key);
    if (collisionKeys.has(canonical)) throw new WriterFailure(`Output path collision: ${collisionKeys.get(canonical)} and ${key}`);
    collisionKeys.set(canonical, key);
  }
  const result = Object.create(null);
  for (const [key, value] of Object.entries(parsed)) {
    try { localPath(root, key); } catch (error) { throw new WriterFailure(error.message); }
    const file = path.posix.normalize(key);
    const declared = literals.includes(file) || patterns.some(pattern => matchesDeclaration(file, pattern));
    if (file !== key || !declared || Object.hasOwn(result, file) || typeof value !== 'string') throw new WriterFailure(`Undeclared/duplicate/non-text output: ${key}`);
    if (patterns.some(pattern => matchesDeclaration(file, pattern))) {
      try { validateAllocatedPath(root, file); } catch (error) { throw new WriterFailure(error.message); }
    }
    result[file] = value;
  }
  if (!Object.keys(result).length || literals.some(file => !Object.hasOwn(result, file))) throw new WriterFailure('Missing declared writer output');
  return result;
}
// hooks.guard(file, priorBytes|null, content) may refuse before anything is written (it throws);
// hooks.committed(file, priorBytes|null, content) runs once per file after the whole commit succeeded.
export function materialize(root, outputs, text, hooks) {
  const files = writerFiles(root, outputs, text);
  // Validate the whole result before the first write, retaining old bytes for
  // rollback if the filesystem refuses one of a multiple-file commit.
  const saved = new Map();
  for (const file of Object.keys(files)) {
    const absolute = localPath(root, file);
    if (fs.existsSync(absolute) && !fs.statSync(absolute).isFile()) throw new WriterFailure(`Output is not a file: ${file}`);
    saved.set(file, fs.existsSync(absolute) ? fs.readFileSync(absolute) : null);
  }
  if (hooks?.guard) for (const [file, content] of Object.entries(files)) hooks.guard(file, saved.get(file), content);
  try { for (const [file, content] of Object.entries(files)) writeLocal(root, file, content); }
  catch (error) {
    for (const [file, bytes] of saved) {
      if (bytes === null) fs.rmSync(localPath(root, file), {force: true}); else writeLocal(root, file, bytes);
    }
    throw new WriterFailure(`Output commit rolled back: ${error.message}`);
  }
  if (hooks?.committed) for (const [file, content] of Object.entries(files)) hooks.committed(file, saved.get(file), content);
  return Object.keys(files).sort();
}

import fs from 'node:fs';
import path from 'node:path';
import {expandScenarios} from './structure.mjs';
import {localPath} from './local-path.mjs';
import {selectFiles, localPath as selectionPath} from './config/path-selection.mjs';

const runtimeSelections = new Set(['pipeline-stages-context', 'pipeline-stages-optional-context', 'pipeline-review-rubric', 'pipeline-evals-per-file']);

export function normalizedPath(value, context, base = context.pathBase ?? context.specBase ?? '') {
  const [file, fragment] = String(value).split('#');
  if (/[\\\0]|^(?:\/|[A-Za-z][A-Za-z0-9+.-]*:)/.test(file)) throw Error(`Invalid census path: ${value}`);
  const rel = path.posix.normalize(path.posix.join(base, file));
  if (rel === '..' || rel.startsWith('../')) throw Error(`Census path escapes root: ${value}`);
  if (context.root && fs.existsSync(context.root)) localPath(context.root, rel, {missing: true});
  return rel + (fragment ? `#${fragment}` : '');
}
export const absentReference = v => v == null || v === '' || v === '—' || typeof v === 'string' && /^not-applicable:\s*\S/.test(v);
export const externalReference = v => typeof v === 'string' && /^(https?:|mailto:)/i.test(v);
export const runtimeSelectionEntry = entry => runtimeSelections.has(entry.id);
export function referenceValues(value, entry, context) {
  // A runtime selector is decided by selectFiles, which treats '—' as a literal path: missing refuses, existing is selected.
  if (absentReference(value) && !(runtimeSelectionEntry(entry) && value === '—')) return [];
  if (runtimeSelectionEntry(entry)) {
    if (!context?.root) throw Error(`Runtime selection root unavailable: ${entry.id}`);
    const optional = entry.id === 'pipeline-stages-optional-context';
    const files = selectFiles(context.root, value, {optional, preparedText: optional});
    if (optional && !files.length) return [];
    for (const file of files) fs.readFileSync(selectionPath(context.root, file));
    // Retain the registered binding as well as every actual selected prerequisite.
    return [...new Set([value, ...files])];
  }
  if (typeof value === 'object') {
    if (entry.location.path?.endsWith('artifacts') || entry.id === 'design-sources-inputs') return Object.keys(value);
    return [value];
  }
  if (entry.location.kind === 'body-table' && /SCN-/.test(String(value))) return expandScenarios(value);
  if (entry.location.kind === 'body-table' && entry.location.pattern === '.+') return String(value).split(/[,;]\s*/).filter(Boolean);
  return [value];
}

export function resolveMixed(value, context, kinds = []) {
  const v = String(value).replace(/^\[([^\]]+)\]\(([^)]+)\)$/, '$2');
  const explicit = /^([a-z][a-z-]*):(.+)$/.exec(v);
  if (explicit) return (!kinds.length || kinds.includes(explicit[1])) ? v : null;
  const candidates = [];
  const add = (kind, id) => {if (!kinds.length || kinds.includes(kind)) candidates.push(`${kind}:${id}`);};
  for (const id of context.identities?.keys() ?? []) if (id.slice(id.indexOf(':') + 1) === v) add(id.split(':')[0], v);
  if (/^REQ-\d+$/.test(v)) add('req', v);
  if (/^(US-(?:P?\d+)|NF-\d+)$/.test(v)) add('us', v);
  if (/^D\d+$/.test(v)) add('decision', v);
  if (/^(?:[^.]+\.)?AC-\d+$/.test(v)) add('ac', v.includes('.') ? v : `${context.doc?.id}.${v}`);
  if (/^(?:[^.]+\.)?A-\d+$/.test(v)) add('amendment', v.includes('.') ? v : `${context.primary?.id}.${v}`);
  if (/^(?:[^.]+\.)?SCN-/.test(v)) {
    const owners = v.includes('.') ? [v.split('.')[0]] : context.docs.filter(d => d.fm?.scenarios?.some(s => s.id === v)).map(d => d.id);
    for (const owner of owners) add('scenario', v.includes('.') ? v : `${owner}.${v}`);
  }
  for (const doc of context.docs.filter(d => d.id === v || d.rel === v.split('#')[0])) add(['us', 'contract'].includes(doc.type) ? doc.type : 'artifact', ['us', 'contract'].includes(doc.type) ? doc.id : doc.rel);
  if (/^W-\d{2}$/.test(v)) add('board', v);
  if (/^S\d{2}(?:-[a-z])?(?:\/.*)?$/.test(v)) add('screen-state', v);
  if (/^BR-\d+$/.test(v)) add('rule', v);
  if (!candidates.length && kinds.includes('artifact') && /[/.#]/.test(v)) add('artifact', normalizedPath(v, context, context.body ? path.posix.dirname(context.doc.rel) : context.pathBase ?? context.specBase ?? ''));
  return [...new Set(candidates)].length === 1 ? candidates[0] : null;
}

export function qualifyEndpoint(template, tokens) {
  let missing = false;
  const result = template.replace(/\{([^}]+)\}/g, (_, name) => {
    if (tokens[name] === undefined || tokens[name] === null) {missing = true; return '';}
    return String(tokens[name]);
  }).replace(/^([a-z][a-z-]*):\1:/, '$1:').replace(/^artifact:\//, 'artifact:').replace(/#$/, '');
  return missing || !/^[a-z][a-z-]*:.+/.test(result) || /undefined|\(unresolved\)/.test(result) ? null : result;
}

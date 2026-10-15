import fs from 'node:fs';
import {parseJson} from './json-strict.mjs';
import certificationBoundary from '../../format/reference-registry-certification-boundary.cjs';

export const registryPath = new URL('../../format/reference-registry.json', import.meta.url);
const kinds = new Set(['front-matter', 'body-table', 'body-heading', 'json']);
export function loadReferenceRegistry(value = registryPath) {
  const registry = typeof value === 'object' && !(value instanceof URL) ? value : parseJson(fs.readFileSync(value, 'utf8'));
  if (!Array.isArray(registry.entries)) throw Error('Reference registry entries are required');
  certificationBoundary.audit(registry.entries, (ok, message) => {if (!ok) throw Error(message);});
  const ids = new Set();
  for (const entry of registry.entries) {
    if (ids.has(entry.id)) throw Error(`Duplicate reference registry entry ${entry.id}`);
    ids.add(entry.id);
    if (!kinds.has(entry.location?.kind)) throw Error(`Unsupported registry location kind: ${entry.id}: ${entry.location?.kind}`);
    if (!['edge', 'context', 'projection'].includes(entry.effect)) throw Error(`Unsupported registry effect: ${entry.id}`);
    if (!['source', 'target'].includes(entry.edge?.from) || !['source', 'target'].includes(entry.edge?.to)) throw Error(`Invalid registry direction: ${entry.id}`);
    if (!entry.source?.id || !entry.target?.id || typeof entry.causal !== 'boolean') throw Error(`Incomplete registry entry: ${entry.id}`);
    if (['json', 'front-matter'].includes(entry.location.kind) && (typeof entry.location.path !== 'string' || !/^[\w$*-]+(?:(?:\.[\w$*-]+)|\[\*?\]|\{(?:key|value)\})*$/.test(entry.location.path))) throw Error(`Unsupported registry path: ${entry.id}`);
    if (entry.location.kind.startsWith('body')) {
      new RegExp(entry.location.pattern);
      if (entry.location.kind === 'body-table') {if (entry.location.heading !== '*') new RegExp(entry.location.heading); new RegExp(entry.location.column);}
    }
    const cases = new Set(), discriminator = entry.cases?.[0]?.when?.path;
    for (const branch of entry.cases ?? []) {
      if (!branch.when?.path || !branch.target?.id || branch.when.path !== discriminator || cases.has(branch.when.value)) throw Error(`Unsupported registry case: ${entry.id}`);
      cases.add(branch.when.value);
    }
  }
  return registry;
}

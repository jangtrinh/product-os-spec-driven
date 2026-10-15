import fs from 'node:fs';
import {parseJson} from './json-strict.mjs';
import schemaPaths from '../../format/reference-registry-schema-path.cjs';
import schemaIdentity from '../../format/reference-registry-schema-identity.cjs';
import {canonical} from './config/strict-json.mjs';

let installed;
export function censusSchemas() {
  if (!installed) {
    const directory = new URL('../../format/schema/', import.meta.url);
    installed = new Map(fs.readdirSync(directory).filter(f => f.endsWith('.schema.json')).map(file => [file, parseJson(fs.readFileSync(new URL(file, directory), 'utf8'))]));
    schemaIdentity.audit(installed, (ok, message) => {if (!ok) throw Error(message);});
  }
  return installed;
}
const schemaName = type => type === 'crosswalk' ? 'id-crosswalk.schema.json' : `${type}.schema.json`;

export function schemaLocations(type, data, registry, {schemas = censusSchemas(), corpus, file} = {}) {
  const entries = new Map(registry.entries.map(e => [e.id, e]));
  const resolver = schemaPaths(schemas), found = [];
  const root = schemas.get(schemaName(type));
  if (!root) throw Error(`Unsupported census payload type: ${type}`);
  function originalContexts(target, value, ctx, reference) {
    if (type !== 'packet-data' || target === root || !value || typeof value !== 'object' || Array.isArray(value)) return [ctx];
    if (reference.includes('#') && !reference.endsWith('#/properties/screens/items')) return [ctx];
    const matches = (corpus?.payloads ?? []).filter(p => p.type !== type && schemaName(p.type) === target.$id.split('/').at(-1)
      && (value.id ? p.data.id === value.id : value.screen ? p.data.screens?.some(s => s.screen === value.screen && s.state === value.state) : canonical(p.data) === canonical(value)));
    // Receipt copies may share an identity only when their resolved records are
    // canonical-identical. Preserve every declaring context for provenance.
    if (matches.length > 1 && (matches.some(p => p.type !== 'evidence-receipt') || new Set(matches.map(p => canonical(p.data))).size !== 1))
      throw Error(`Ambiguous projected census owner: ${value.id ?? value.screen}`);
    if (!matches.length) return [{...ctx, declaringFile: null}];
    return matches.map(p => ({...ctx, declaringFile: p.file, declaringData: p.data, declaringBase: p.pathBase}));
  }
  function visit(rule, value, owner, ctx, stack = new Set()) {
    if (value === undefined || value === null || typeof rule === 'boolean') return;
    if (rule.$ref) {
      const target = resolver.resolve(rule, owner);
      if (target.node === undefined) throw Error(`Unresolved census schema resource: ${rule.$ref}`);
      if (stack.has(target.node)) throw Error(`Recursive census payload at ${rule.$ref}`);
      for (const original of originalContexts(target.owner, value, ctx, rule.$ref))
        visit(target.node, value, target.owner, original, new Set([...stack, target.node]));
    }
    const entry = entries.get(rule['x-spec-ref']);
    if (entry) found.push({entry, value, ...ctx});
    if (Array.isArray(value) && rule.items) value.forEach((v, index) => {
      const object = v && typeof v === 'object' && !Array.isArray(v);
      visit(rule.items, v, owner, {...ctx, owner: object ? v : ctx.owner, ancestors: object ? [...ctx.ancestors, v] : ctx.ancestors, index}, stack);
    });
    if (typeof value === 'object' && !Array.isArray(value)) for (const [key, v] of Object.entries(value)) {
      const keyContext = {...ctx, key};
      const object = v && typeof v === 'object' && !Array.isArray(v);
      const child = {...keyContext, owner: object ? v : ctx.owner, ancestors: object ? [...ctx.ancestors, v] : ctx.ancestors};
      if (rule.propertyNames) visit(rule.propertyNames, key, owner, keyContext, stack);
      if (rule.properties?.[key]) visit(rule.properties[key], v, owner, child, stack);
      for (const [pattern, schema] of Object.entries(rule.patternProperties ?? {})) if (new RegExp(pattern).test(key)) visit(schema, v, owner, child, stack);
      if (!rule.properties?.[key] && typeof rule.additionalProperties === 'object') visit(rule.additionalProperties, v, owner, child, stack);
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) for (const child of rule[keyword] ?? []) visit(child, value, owner, ctx, stack);
    // Retained conditional assertions refine the same locations; annotations stay inert.
    for (const keyword of ['if', 'then', 'else', 'not', 'contains']) if (rule[keyword]) visit(rule[keyword], value, owner, ctx, stack);
  }
  visit(root, data, root, {owner: data, root: data, ancestors: [data], declaringFile: file, declaringData: data});
  return found;
}

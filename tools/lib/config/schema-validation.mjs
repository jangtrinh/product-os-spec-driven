import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseJson, canonical} from './strict-json.mjs';
import {RunnerError} from './path-selection.mjs';
import {localPath} from './path-selection.mjs';

const directory = fileURLToPath(new URL('../../../format/schema/', import.meta.url));
const cache = new Map();
export function schema(name) {
  if (!/^[a-z0-9-]+\.schema\.json$/.test(name)) throw new RunnerError(`Unknown local schema: ${name}`);
  if (!cache.has(name)) cache.set(name, parseJson(fs.readFileSync(`${directory}/${name}`, 'utf8'), name));
  return cache.get(name);
}
// The runner uses the shipped schemas, resolving their local $id references
// without a network or a runtime package dependency.
export function validateSchema(value, definition, label = 'record', base = definition) {
  function reference(ref) {
    const [url, fragment = ''] = ref.split('#');
    let doc = url ? schema(url.split('/').pop()) : base;
    for (const key of fragment.split('/').slice(1)) doc = doc[key.replaceAll('~1', '/').replaceAll('~0', '~')];
    if (doc === undefined) throw new RunnerError(`Unresolved schema reference: ${ref}`);
    return {doc, base: url ? schema(url.split('/').pop()) : base};
  }
  const issue = message => { throw new RunnerError(`${label}: ${message}`); };
  if (typeof definition === 'boolean') { if (!definition) issue('forbidden value'); return value; }
  if (definition.$ref) {
    const target = reference(definition.$ref);
    validateSchema(value, target.doc, label, target.base);
  }
  const match = sub => { try { validateSchema(value, sub, label, base); return true; } catch (error) { if (!(error instanceof RunnerError)) throw error; return false; } };
  if (definition.allOf) for (const sub of definition.allOf) validateSchema(value, sub, label, base);
  if (definition.anyOf && !definition.anyOf.some(match)) issue('no allowed variant matches');
  if (definition.oneOf && definition.oneOf.filter(match).length !== 1) issue('expected exactly one variant');
  if (definition.not && match(definition.not)) issue('forbidden combination');
  if (definition.if) {
    const sub = match(definition.if) ? definition.then : definition.else;
    if (sub) validateSchema(value, sub, label, base);
  }
  if (Object.hasOwn(definition, 'const') && canonical(value) !== canonical(definition.const)) issue(`expected ${JSON.stringify(definition.const)}`);
  if (definition.enum && !definition.enum.some(v => canonical(v) === canonical(value))) issue(`expected ${definition.enum.join('|')}`);
  const type = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  if (definition.type) {
    const types = [].concat(definition.type);
    if (!types.includes(type(value)) && !(types.includes('integer') && Number.isInteger(value))) issue(`expected ${types.join('|')}`);
  }
  if (typeof value === 'string') {
    if (definition.minLength !== undefined && [...value].length < definition.minLength) issue('string too short');
    if (definition.maxLength !== undefined && [...value].length > definition.maxLength) issue('string too long');
    if (definition.pattern && !new RegExp(definition.pattern).test(value)) issue(`invalid pattern ${definition.pattern}`);
    if (definition.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) issue('invalid email');
    if (definition.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19))) issue('invalid UTC calendar timestamp');
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) issue('non-finite number');
    if (definition.minimum !== undefined && value < definition.minimum) issue('below minimum');
    if (definition.maximum !== undefined && value > definition.maximum) issue('above maximum');
  }
  if (Array.isArray(value)) {
    if (definition.minItems !== undefined && value.length < definition.minItems) issue('too few items');
    if (definition.maxItems !== undefined && value.length > definition.maxItems) issue('too many items');
    if (definition.uniqueItems && new Set(value.map(canonical)).size !== value.length) issue('duplicate items');
    if (definition.items) for (const [index, item] of value.entries()) validateSchema(item, definition.items, `${label}[${index}]`, base);
    if (definition.contains && !value.some((item, index) => {
      try { validateSchema(item, definition.contains, `${label}[${index}]`, base); return true; }
      catch (error) { if (!(error instanceof RunnerError)) throw error; return false; }
    })) issue('no item matches contains');
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (definition.minProperties !== undefined && keys.length < definition.minProperties) issue('too few properties');
    for (const key of definition.required ?? []) if (!Object.hasOwn(value, key)) issue(`missing ${key}`);
    for (const key of keys) {
      if (definition.propertyNames) validateSchema(key, definition.propertyNames, `${label} key ${key}`, base);
      const sub = definition.properties?.[key];
      if (sub !== undefined) validateSchema(value[key], sub, `${label}.${key}`, base);
      else if (definition.additionalProperties === false) issue(`unknown key ${key}`);
      else if (definition.additionalProperties && typeof definition.additionalProperties === 'object') validateSchema(value[key], definition.additionalProperties, `${label}.${key}`, base);
    }
  }
  return value;
}
export function readRecord(root, relative, schemaName) {
  const value = parseJson(fs.readFileSync(localPath(root, relative), 'utf8'), relative);
  return validateSchema(value, schema(schemaName), relative);
}

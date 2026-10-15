import { isSchemaAnnotation, schemaShape } from './schema-shape.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJson } from './json-strict.mjs';
const directory = fileURLToPath(new URL('../../format/schema/', import.meta.url));
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(v) {
  return Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
}
export function realDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
function utc(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(v) && realDate(v.slice(0, 10)) && Number.isFinite(Date.parse(v)) && +v.slice(11,13) < 24 && +v.slice(14,16) < 60 && +v.slice(17,19) < 60;
}
const type = (v,t) => t === 'array' ? Array.isArray(v) : t === 'null' ? v === null : t === 'integer' ? Number.isInteger(v) : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === t;
let activeRegistry;
const keywords = new Set(['$schema','$id','$defs','$ref','title','description','default','examples','type','enum','const','pattern','format','minLength','maxLength','minimum','maximum','minItems','maxItems','uniqueItems','items','contains','minContains','maxContains','required','properties','additionalProperties','propertyNames','minProperties','maxProperties','oneOf','anyOf','allOf','not','if','then','else','patternHint','x-required-by-type','x-fields-for-types']);
export function checkSchemas(schemaDir = directory) {
  const list = fs.readdirSync(schemaDir).filter(n => n.endsWith('.schema.json'));
  if (!list.length) throw new Error('no schemas found');
  const registry = Object.fromEntries(list.map(n => [n, parseJson(fs.readFileSync(path.join(schemaDir,n),'utf8'))]));
  for (const name of ['manifest','front-matter','ui-contract','glossary','block-history','model-common','design-profile','screen-inventory','design-sources','copy-catalog','dependency-graph','change-set','evidence-receipt','gate-definition','gate-state','transition','exception','audit-event','batch-decision','packet-data','candidate-manifest','gate-review','ds-catalog','clarify-record','expected-change','integration-record','feedback-record','rounds-ledger','rulings-index']) if (!registry[`${name}.schema.json`]) throw new Error(`missing ${name} schema`);
  function walk(s, root) {
    if (typeof s === 'boolean') return;
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('schema must be an object or boolean');
    schemaShape(s);
    for (const key of Object.keys(s)) if (!keywords.has(key) && !isSchemaAnnotation(key)) throw new Error(`unsupported schema keyword ${key}`);
    if (s.pattern) new RegExp(s.pattern);
    if (s.$ref) resolve(s.$ref, root, registry);
    for (const k of ['properties','$defs']) for (const child of Object.values(s[k] || {})) walk(child,root);
    for (const k of ['items','contains','additionalProperties','propertyNames','not','if','then','else']) if (s[k] !== undefined) walk(s[k],root);
    for (const k of ['oneOf','anyOf','allOf']) for (const child of s[k] || []) walk(child,root);
  }
  for (const s of Object.values(registry)) walk(s,s);
  if (schemaDir === directory) activeRegistry = registry;
  return registry;
}
function resolve(ref, root, registry) {
  const [uri, fragment=''] = ref.split('#');
  const owner = uri ? registry[uri.split('/').at(-1)] : root;
  if (!owner) throw new Error(`schema reference unavailable: ${ref}`);
  const s = fragment.split('/').filter(Boolean).reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],owner);
  if (s === undefined) throw new Error(`schema reference unavailable: ${ref}`);
  return [s,owner];
}
export function validate(value, schema, at = '', out = [], root = schema, registry) {
  registry ||= activeRegistry || checkSchemas();
  const err = message => out.push({path:at || '(root)',message});
  if (schema === true) return out;
  if (schema === false) { err('is forbidden'); return out; }
  if (schema.$ref) { const [s,r]=resolve(schema.$ref,root,registry); validate(value,s,at,out,r,registry); }
  if (schema.type && ![].concat(schema.type).some(t=>type(value,t))) { err(`must be ${[].concat(schema.type).join(' or ')}`); return out; }
  const probe = s => validate(value,s,at,[],root,registry).length === 0;
  for (const s of schema.allOf || []) validate(value,s,at,out,root,registry);
  for (const key of ['anyOf','oneOf']) if (schema[key]) {
    const n = schema[key].filter(probe).length;
    if (key === 'anyOf' ? n === 0 : n !== 1) err(`must match ${key === 'oneOf' ? 'exactly one' : 'at least one'} schema alternative`);
  }
  if (schema.not && probe(schema.not)) err('matches a forbidden schema');
  if (schema.if) { const branch=probe(schema.if) ? schema.then : schema.else; if(branch) validate(value,branch,at,out,root,registry); }
  if (Object.hasOwn(schema,'const') && !equal(value,schema.const)) err(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(x=>equal(x,value))) err(`must be one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    for (const [k,cmp] of [['minLength',(a,b)=>a<b],['maxLength',(a,b)=>a>b]]) if(schema[k] !== undefined && cmp([...value].length,schema[k])) err(`violates ${k} ${schema[k]}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) err(`does not match ${schema.pattern}`);
    if (schema.format === 'date' && !realDate(value)) err('must be a real date');
    if (schema.format === 'date-time' && !utc(value)) err('must be a real UTC timestamp');
    if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) err('must be an email');
  }
  if (typeof value === 'number') {
    if(schema.minimum !== undefined && value<schema.minimum) err(`must be at least ${schema.minimum}`);
    if(schema.maximum !== undefined && value>schema.maximum) err(`must be at most ${schema.maximum}`);
  }
  if(Array.isArray(value)) {
    if(schema.minItems !== undefined && value.length<schema.minItems) err(`needs ${schema.minItems} items`);
    if(schema.maxItems !== undefined && value.length>schema.maxItems) err(`exceeds ${schema.maxItems} items`);
    if(schema.uniqueItems && value.some((v,i)=>value.slice(0,i).some(x=>equal(x,v)))) err('has duplicate items');
    if(schema.contains) { const n=value.filter(v=>validate(v,schema.contains,at,[],root,registry).length===0).length; if(n<(schema.minContains ?? 1) || schema.maxContains!==undefined && n>schema.maxContains) err('violates contains match count'); }
    if(schema.items) value.forEach((v,i)=>validate(v,schema.items,`${at}[${i}]`,out,root,registry));
  }
  if(type(value,'object')) {
    for(const k of schema.required || []) if(!Object.hasOwn(value,k)) out.push({path:at ? `${at}.${k}` : k,message:'is required'});
    for(const k of ['minProperties','maxProperties']) if(schema[k] !== undefined && (k === 'minProperties' ? Object.keys(value).length<schema[k] : Object.keys(value).length>schema[k])) err(`violates ${k}`);
    for(const [k,v] of Object.entries(value)) {
      const next=at ? `${at}.${k}` : k;
      if(schema.propertyNames) validate(k,schema.propertyNames,next,out,root,registry);
      if(schema.properties?.[k]) validate(v,schema.properties[k],next,out,root,registry);
      else if(schema.additionalProperties === false) out.push({path:next,message:'is not a known field'});
      else if(schema.additionalProperties && typeof schema.additionalProperties === 'object') validate(v,schema.additionalProperties,next,out,root,registry);
    }
  }
  return out;
}

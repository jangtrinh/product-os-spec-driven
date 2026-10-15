'use strict';
// Enumerate schema locations, never infer reference status from prose or field names.
const escape = value => value.replace(/~/g, '~0').replace(/\//g, '~1');
module.exports = function classification(schemas, pointer) {
  const {resolve} = require('./reference-registry-schema-path.cjs')(schemas);
  function canString(node, owner, seen = new Set()) {
    if (node === true) return true;
    if (!node || typeof node !== 'object') return false;
    if (seen.has(node)) return true; // Cyclic/unknown constraints cannot certify exclusion.
    const next = new Set(seen).add(node);
    if (node.type && !(Array.isArray(node.type) ? node.type : [node.type]).includes('string')) return false;
    if (Object.hasOwn(node, 'const') && typeof node.const !== 'string') return false;
    if (node.enum && !node.enum.some(v => typeof v === 'string')) return false;
    if (node.$ref) {
      const ref = resolve(node, owner);
      if (!ref.node || !canString(ref.node, ref.owner, next)) return !ref.node;
    }
    if (node.allOf && !node.allOf.every(n => canString(n, owner, next))) return false;
    for (const key of ['anyOf', 'oneOf'])
      if (node[key] && !node[key].some(n => canString(n, owner, next))) return false;
    return true;
  }
  function visit(node, owner, p, callback) {
    if (typeof node !== 'boolean' && (!node || typeof node !== 'object')) return;
    callback(node, owner, p, canString(node, owner));
    for (const key of ['properties', '$defs', 'definitions', 'patternProperties', 'dependentSchemas'])
      for (const [name, child] of Object.entries(node[key] || {}))
        visit(child, owner, p + '/' + key + '/' + escape(name), callback);
    for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems'])
      (node[key] || []).forEach((child, i) => visit(child, owner, p + '/' + key + '/' + i, callback));
    for (const key of ['items', 'additionalItems', 'additionalProperties', 'unevaluatedProperties',
      'unevaluatedItems', 'propertyNames', 'contains', 'not', 'if', 'then', 'else', 'contentSchema']) {
      if (Array.isArray(node[key])) node[key].forEach((child, i) => visit(child, owner, p + '/' + key + '/' + i, callback));
      else if (Object.hasOwn(node, key)) visit(node[key], owner, p + '/' + key, callback);
    }
  }
  const exclusions = require('./reference-registry-exclusions.cjs')(schemas, pointer, resolve);
  const implicit = require('./reference-registry-implicit-locations.cjs')(schemas, pointer, resolve, exclusions);
  const stringLocations = require('./reference-registry-string-locations.cjs')(schemas, pointer, resolve);
  // Encoding alternatives are inspected independently of effective structural
  // constraints. A null branch denotes absence, never a reference encoding.
  function referenceTypes(node, owner, seen = new Set()) {
    if (!node || typeof node !== 'object' || seen.has(node)) return [];
    const next = new Set(seen).add(node);
    if (node.type || node.enum || Object.hasOwn(node,'const')) return implicit.types(node,owner);
    if (node.$ref) {
      const ref = resolve(node,owner);
      return referenceTypes(ref.node,ref.owner,next);
    }
    return ['anyOf','oneOf','allOf'].flatMap(k => (node[k] || []).flatMap(n => referenceTypes(n,owner,next)));
  }
  function audit(entries, demand, hints) {
    const annotated = new Set(), literals = new Set(), uses = new Map();
    for (const [file, schema] of schemas) visit(schema, schema, '', (node, owner, p, carriesString) => {
      implicit.audit(node, owner, file, p, demand, hints);
      const key = file + '#' + p, has = Object.hasOwn(node, 'x-spec-ref');
      const encodingTypes = referenceTypes(node,owner).filter(type => type !== 'null');
      const nonString = encodingTypes.some(type => type !== 'string');
      // Explicit prose/pattern encodings are forbidden independently of the
      // registered-location proof below, including checked literal annotations.
      if (nonString && ((typeof node['x-spec-ref'] === 'string'
        && encodingTypes.some(type => !['string','object','array'].includes(type)))
        || hints.declaresReference([node.pattern, node.description].filter(Boolean).join(' '))))
        demand(false, 'forbidden non-string reference ' + key + ' (references MUST be string values)');
      if (node.$ref) demand(resolve(node, owner).node !== undefined, 'unresolved schema reference ' + key);
      if (carriesString) demand(has, 'unannotated reference ' + key + ' (unclassified string)');
      if (!has) return;
      const annotation = node['x-spec-ref'];
      if (typeof annotation === 'string') {
        demand(stringLocations.valid(node,owner,entries), 'registered reference must be a string location ' + key);
        annotated.add(key);
        const entry = entries.get(annotation);
        demand(entry, 'missing registry entry ' + annotation + ' for ' + key);
        demand(entry?.schema?.file === file && entry?.schema?.pointer === p, 'annotation binding mismatch ' + key);
        demand(!uses.has(annotation), 'reused annotation ' + annotation + ': ' + uses.get(annotation) + ' and ' + key);
        uses.set(annotation, key);
      } else {
        demand(annotation === false, 'invalid literal annotation ' + key);
        if (annotation !== false && hints.hidesTyped(hints.hints(node, owner)))
          demand(false, 'literal hides typed reference ' + key);
        const declaration=node['x-spec-exclusion'];
        demand(declaration, 'missing checked exclusion ' + key);
        if(declaration) exclusions.owned(node, file, p, declaration, demand);
        demand((exclusions.legacyLiteral(file, p, node) || !hints.hidesTyped([node.pattern,node.description].filter(Boolean).join(' ')))
          && !/\b(?:path|paths|file|directory|reference|pointer|identifier)\b/i.test(node.description || ''),
          'literal hides typed reference ' + key);
        literals.add(key);
      }
    });
    for (const entry of entries.values()) if (entry.schema)
      demand(uses.get(entry.id) === entry.schema.file + '#' + entry.schema.pointer, 'entry binding count ' + entry.id);
    return {annotated, literals};
  }
  return {resolve, canString, visit, audit};
};

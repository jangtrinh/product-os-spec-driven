'use strict';
// Explicit proof vocabulary: new structural semantics require a proof, not a name.
const {isDeepStrictEqual} = require('node:util');
const maps = ['properties','$defs'];
const arrays = ['allOf','anyOf','oneOf'];
const singles = ['items','additionalProperties','propertyNames'];
const retained = new Set(['if','then','else','not','contains']);
const supported = new Set([...maps,...arrays,...singles,...(
  '$schema $id $ref title description type enum const required minProperties maxProperties '
  +'minItems maxItems uniqueItems minLength maxLength pattern format minimum maximum '
  +'exclusiveMinimum exclusiveMaximum multipleOf '
  +'x-spec-ref x-spec-ref-reason x-spec-exclusion').split(' ')]);
const escape = value => value.replace(/~/g,'~0').replace(/\//g,'~1');
function children(node) {
  if (!node || typeof node !== 'object') return [];
  return [
    ...maps.flatMap(k => Object.entries(node[k] || {}).map(([name,child]) => [k+'/'+escape(name),child])),
    ...arrays.flatMap(k => (node[k] || []).map((child,i) => [k+'/'+i,child])),
    ...[...singles,...retained].filter(k => Object.hasOwn(node,k)).map(k => [k,node[k]])
  ];
}
function visit(node, p, callback) {
  if (typeof node !== 'boolean' && (!node || typeof node !== 'object' || Array.isArray(node))) return;
  callback(node,p);
  for (const [suffix,child] of children(node)) visit(child,p+'/'+suffix,callback);
}
function audit(schemas, pointer, exclusions, demand) {
  const {resolve} = require('./reference-registry-schema-path.cjs')(schemas);
  for (const [file,schema] of schemas) visit(schema,'',(node,p) => {
    for (const keyword of Object.keys(node)) {
      if (keyword === '$id' && p !== '') {
        demand(false,'unsupported schema construct $id (nested resource) at '+file+'#'+p+'/$id');
        continue;
      }
      if (keyword === '$ref') demand(resolve(node,schema).node !== undefined,
        'unresolved schema reference at '+file+'#'+p+'/$ref');
      // Retained refinements narrow already classified locations. New or changed
      // arms cannot borrow that support; equality includes every assertion child.
      const unchanged = retained.has(keyword) && isDeepStrictEqual(exclusions.strip(node[keyword]),
        exclusions.strip(pointer(exclusions.prior(file),p+'/'+keyword)));
      demand(supported.has(keyword) || unchanged,
        'unsupported schema construct '+keyword+' at '+file+'#'+p+'/'+escape(keyword));
    }
  });
}
function understood(node, owner, resolve, seen = new Set()) {
  if (typeof node === 'boolean') return true;
  if (!node || typeof node !== 'object' || Array.isArray(node) || seen.has(node)) return false;
  if (Object.hasOwn(node,'$id') && node !== owner) return false;
  if (Object.keys(node).some(k => !supported.has(k))) return false;
  const next = new Set(seen).add(node);
  if (node.$ref) {
    const ref = resolve(node,owner);
    if (!understood(ref.node,ref.owner,resolve,next)) return false;
  }
  return children(node).every(([,child]) => understood(child,owner,resolve,next));
}
module.exports = {supported,retained,visit,audit,understood};

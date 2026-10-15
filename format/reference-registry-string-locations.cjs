'use strict';
// Prove value types before accepting a binding; string-capable is insufficient.
const allTypes = ['string','number','boolean','object','array','null'];
const valueType = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const intersect = (left, right) => left.filter(type => right.includes(type));
const {understood} = require('./reference-registry-schema-constructs.cjs');
module.exports = function stringLocations(schemas, pointer, resolve) {
  function types(node, owner, seen = new Set()) {
    if (node === false) return [];
    if (!node || typeof node !== 'object' || seen.has(node)) return allTypes;
    const next = new Set(seen).add(node);
    let result = allTypes;
    if (node.type) result = intersect(result, (Array.isArray(node.type) ? node.type : [node.type])
      .map(type => type === 'integer' ? 'number' : type));
    if (node.enum) result = intersect(result, node.enum.map(valueType));
    if (Object.hasOwn(node,'const')) result = intersect(result, [valueType(node.const)]);
    if (node.$ref) {
      const ref = resolve(node,owner);
      result = intersect(result,types(ref.node,ref.owner,next));
    }
    for (const child of node.allOf || []) result = intersect(result,types(child,owner,next));
    for (const key of ['anyOf','oneOf']) if (node[key])
      result = intersect(result,[...new Set(node[key].flatMap(child => types(child,owner,next)))]);
    return result;
  }
  function constraints(node, owner, seen = new Set()) {
    if (!node || typeof node !== 'object' || seen.has(node)) return undefined;
    const next = new Set(seen).add(node), result = [{node,owner}];
    if (node.$ref) {
      const ref = resolve(node,owner), children = constraints(ref.node,ref.owner,next);
      if (!children) return undefined;
      result.push(...children);
    }
    for (const child of node.allOf || []) {
      const children = constraints(child,owner,next);
      if (!children) return undefined;
      result.push(...children);
    }
    return result;
  }
  function bound(node, entries) {
    const annotation = node['x-spec-ref'];
    if (annotation === false) return Boolean(node['x-spec-exclusion']);
    const entry = entries.get(annotation);
    return Boolean(entry?.schema && pointer(schemas.get(entry.schema.file),entry.schema.pointer) === node);
  }
  function leaves(node, owner, entries, seen = new Set()) {
    if (!node || typeof node !== 'object' || seen.has(node)) return 0;
    const next = new Set(seen).add(node), effective = types(node,owner).filter(type => type !== 'null');
    if (effective.length !== 1) return 0;
    if (effective[0] === 'string') return bound(node,entries) ? 1 : 0;
    if (!['object','array'].includes(effective[0])) return 0;
    const scopes = constraints(node,owner);
    // Container alternatives need their own complete proof, never just one safe arm.
    if (!scopes || scopes.some(({node:n}) => n.anyOf || n.oneOf)) return 0;
    const children = [];
    if (effective[0] === 'array') {
      for (const scope of scopes) {
        if (scope.node.items && typeof scope.node.items === 'object') children.push({node:scope.node.items,owner:scope.owner});
      }
      if (!scopes.some(({node:n}) => Object.hasOwn(n,'items') && n.items !== true)) return 0;
    } else {
      const closed = scopes.some(({node:n}) => n.additionalProperties === false);
      if (!closed && !scopes.some(({node:n}) => n.additionalProperties && typeof n.additionalProperties === 'object')) return 0;
      for (const scope of scopes) {
        for (const child of Object.values(scope.node.properties || {})) children.push({node:child,owner:scope.owner});
        for (const key of ['propertyNames','additionalProperties'])
          if (scope.node[key] && typeof scope.node[key] === 'object') children.push({node:scope.node[key],owner:scope.owner});
      }
    }
    if (!children.length) return 0;
    const counts = children.map(child => leaves(child.node,child.owner,entries,next));
    return counts.every(count => count > 0) ? counts.reduce((a,b) => a+b,0) : 0;
  }
  return {types, valid: (node,owner,entries) => understood(node,owner,resolve) && leaves(node,owner,entries) > 0};
};

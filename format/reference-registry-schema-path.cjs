'use strict';
function pointer(schema, p) {
  if (p === '') return schema;
  if (typeof p !== 'string' || !p.startsWith('/')) return undefined;
  return p.slice(1).split('/').reduce((node, token) => {
    if (/~(?:[^01]|$)/.test(token) || !node || typeof node !== 'object') return undefined;
    const key = token.replace(/~1/g,'/').replace(/~0/g,'~');
    if (Array.isArray(node) && !/^(?:0|[1-9][0-9]*)$/.test(key)) return undefined;
    return Object.hasOwn(node,key) ? node[key] : undefined;
  },schema);
}
module.exports = function schemaPaths(schemas) {
  // No basename fallback: URI identity must name a known document resource.
  function resolve(node, owner) {
    if (typeof node?.$ref !== 'string' || typeof owner?.$id !== 'string') return {};
    // Without a validator resolver, encoded document URIs cannot certify identity.
    if (!schemas.uriResolver && node.$ref.split('#')[0].includes('%')) return {};
    try {
      const identity = schemas.uriResolver
        ? schemas.uriResolver.resolve(owner.$id,node.$ref) : new URL(node.$ref,owner.$id).href;
      const hash = identity.indexOf('#');
      const fragment = decodeURIComponent(hash < 0 ? '' : identity.slice(hash+1));
      const documentId = hash < 0 ? identity : identity.slice(0,hash);
      const matches = [...schemas.values()].filter(schema => schema.$id === documentId);
      if (matches.length !== 1) return {};
      return {node:pointer(matches[0],fragment),owner:matches[0]};
    } catch {return {};}
  }
  function expand(node, owner, seen = new Set()) {
    if (!node || typeof node !== 'object' || seen.has(node)) return [];
    seen.add(node); const nodes = [{node, owner}];
    if (node.$ref) {
      const ref = resolve(node,owner);
      if (ref.node !== undefined) nodes.push(...expand(ref.node,ref.owner,seen));
    }
    for (const key of ['allOf', 'anyOf', 'oneOf'])
      for (const child of node[key] || []) nodes.push(...expand(child, owner, seen));
    return nodes;
  }
  function location(schema, value) {
    const tokens = value.match(/(?:^|\.)[A-Za-z_$][A-Za-z0-9_$-]*|\[\*\]|\{(?:key|value)\}/g) || [];
    if (tokens.join('') !== value) return [];
    let states = [{node: schema, owner: schema}], terminalArrays = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i], expanded = states.flatMap(s => expand(s.node, s.owner));
      if (token === '[*]') {
        if (i === tokens.length - 1) terminalArrays = expanded.map(s => s.node);
        states = expanded.filter(s => s.node.items && !Array.isArray(s.node.items))
          .map(s => ({node: s.node.items, owner: s.owner}));
      } else if (token === '{value}') {
        states = expanded.flatMap(s => [s.node.additionalProperties, ...Object.values(s.node.patternProperties || {})]
          .filter(n => n && typeof n === 'object').map(node => ({node, owner: s.owner})));
      } else if (token === '{key}') {
        states = expanded.filter(s => s.node.propertyNames)
          .map(s => ({node: s.node.propertyNames, owner: s.owner}));
      } else {
        const key = token.replace(/^\./, '');
        if (i === 0 && key === '$defs') {
          const name = tokens[++i]?.replace(/^\./, '');
          states = schema.$defs?.[name] ? [{node: schema.$defs[name], owner: schema}] : [];
        } else states = expanded.filter(s => s.node.properties?.[key])
          .map(s => ({node: s.node.properties[key], owner: s.owner}));
      }
      if (!states.length) return [];
    }
    return [...terminalArrays, ...states.flatMap(s => expand(s.node, s.owner)).map(s => s.node)];
  }
  return {pointer, resolve, expand, location};
};

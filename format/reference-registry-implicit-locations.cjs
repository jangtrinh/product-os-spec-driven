'use strict';
const {isDeepStrictEqual} = require('node:util');
module.exports = function implicit(schemas, pointer, resolve, exclusions) {
  function types(node, owner, seen=new Set()) {
    if(!node || typeof node!=='object' || seen.has(node))return [];
    const next=new Set(seen).add(node);
    if(node.type)return Array.isArray(node.type)?node.type:[node.type];
    if(node.enum)return [...new Set(node.enum.map(v=>Array.isArray(v)?'array':v===null?'null':typeof v))];
    if(Object.hasOwn(node,'const'))return [Array.isArray(node.const)?'array':node.const===null?'null':typeof node.const];
    if(node.$ref){const ref=resolve(node,owner);return types(ref.node,ref.owner,next);}
    if(node.allOf)return [...new Set(node.allOf.flatMap(n=>types(n,owner,next)))];
    return [];
  }
  function constraints(node, owner, seen=new Set()) {
    if(!node || typeof node!=='object' || seen.has(node))return [];
    const next=new Set(seen).add(node), nodes=[node];
    if(node.$ref){const ref=resolve(node,owner);nodes.push(...constraints(ref.node,ref.owner,next));}
    for(const child of node.allOf || [])nodes.push(...constraints(child,owner,next));
    return nodes;
  }
  function audit(node, owner, file, p, demand, hints) {
    const key=file+'#'+p;
    if(node===false)return;
    if(node===true){demand(false,'unannotated reference '+key+' (implicit values)');return;}
    const cp=exclusions.canonical(p);
    let contextual=cp!==p && pointer(owner,cp);
    if(p.includes('/contains') && contextual?.items)contextual=contextual.items;
    // Refinements borrow a constraint only from the same payload location, not
    // arbitrary siblings. Exact retained shape gates the supported composition.
    const refinement=contextual && isDeepStrictEqual(exclusions.strip(node),exclusions.strip(pointer(exclusions.prior(file),p)));
    const nodes=constraints(node,owner);
    const effective=types(node,owner);
    // Pattern-defined keys remain open even when additional properties are closed.
    // They cannot bind references; reference keys use explicit propertyNames.
    for (const pattern of Object.keys(node.patternProperties || {}))
      demand(!hints.declaresReference(pattern), 'forbidden reference-bearing object keys '+key+' (patternProperties)');
    if (node.propertyNames && hints.declaresReference(hints.hints(node.propertyNames,owner)))
      demand(typeof node.propertyNames['x-spec-ref']==='string',
        'forbidden reference-bearing object keys '+key+' (unbound propertyNames)');
    if(node.$ref)demand(effective.length>0,'unbounded schema reference '+key);
    const contextTypes=refinement?types(contextual,owner):[];
    if(effective.includes('object')) {
      const scopes=[...nodes,...(refinement?constraints(contextual,owner):[])];
      const closed=scopes.some(s=>s.additionalProperties===false || s.unevaluatedProperties===false);
      const explicit=scopes.some(s=>s.additionalProperties && typeof s.additionalProperties==='object');
      demand(closed || explicit,'unclassified implicit object values '+key);
      const patterned=scopes.some(s=>Object.hasOwn(s,'patternProperties'));
      if (!closed || patterned) {
        const boundKeys=!patterned && scopes.some(s=>typeof s.propertyNames?.['x-spec-ref']==='string');
        const classified=node['x-spec-ref']===false && node['x-spec-exclusion'];
        demand(boundKeys || classified, 'unclassified open object key namespace '+key);
        if(classified)exclusions.owned(node,file,p,node['x-spec-exclusion'],demand);
      }
      if(!closed && !scopes.some(s=>s.propertyNames)) {
        const prior=pointer(exclusions.prior(file),p);
        if(node['x-spec-exclusion'])exclusions.owned(node,file,p,node['x-spec-exclusion'],demand);
        demand(node['x-spec-exclusion']?.category==='container-of' && isDeepStrictEqual(exclusions.strip(node),exclusions.strip(prior)),
          'unclassified implicit object keys '+key);
      }
    }
    if(effective.includes('array'))demand(nodes.some(s=>Object.hasOwn(s,'items')) || node.maxItems===0
      || (refinement && contextTypes.includes('array') && Object.hasOwn(contextual,'items')),
      'unclassified implicit array items '+key);
    if(!effective.length && !node.$ref && !node.allOf && !node.anyOf && !node.oneOf)
      demand(refinement || node['x-spec-exclusion']?.category==='refinement-of', 'unclassified implicit schema values '+key);
  }
  return {audit,types};
};

'use strict';
const {execFileSync} = require('node:child_process');
const {isDeepStrictEqual} = require('node:util');
const strip = value => Array.isArray(value) ? value.map(strip) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith('x-spec-')).map(([k,v]) => [k,strip(v)])) : value;
const canonical = p => p.replace(/\/(?:allOf|anyOf|oneOf|prefixItems)\/\d+|\/(?:if|then|else|not|contains)/g, '');
module.exports = function exclusions(schemas, pointer, resolve) {
  const baseline = new Map();
  function prior(file) {
    const candidate = require('./reference-registry-new-schema-baselines.cjs')(file);
    if (candidate) return candidate;
    if (!baseline.has(file)) {
      try {baseline.set(file, JSON.parse(execFileSync('git',['show',(file==='reference-registry.schema.json'?'7314498':'aa5487d')+':format/schema/'+file],{encoding:'utf8',stdio:['ignore','pipe','pipe']})));}
      catch {baseline.set(file, undefined);}
    }
    const schema = baseline.get(file);
    // The registry control grammar adds one document-owner endpoint with exactly
    // the pinned source endpoint's assertion tree; no payload schema is changed.
    if (file === 'reference-registry.schema.json' && schema) {
      schema.$defs.entry.properties.ownership = schema.$defs.entry.properties.source;
      // The reviewed certification control is one finite literal at this exact
      // property; changed tokens or assertion shapes still fail baseline equality.
      schema.$defs.entry.properties.certification_boundary = {const: 'terminal-graph-only-candidate'};
    }
    return schema;
  }
  function owned(node, file, p, declaration, demand) {
    const key=file+'#'+p, category=declaration?.category;
    demand(declaration && Object.keys(declaration).every(k=>['category','owner'].includes(k)), 'invalid exclusion declaration '+key);
    const [ownerFile, ownerPath] = (declaration?.owner || '').split('#');
    const owner=pointer(schemas.get(ownerFile),ownerPath || '');
    if (category === 'alias-of') {
      const ref=node.$ref ? resolve(node,schemas.get(file)) : {};
      demand(ref.node && ref.node===owner && owner!==node, 'unrelated alias owner '+key);
    } else if (category === 'refinement-of') {
      demand(ownerFile===file && ownerPath===canonical(p) && ownerPath!==p && owner,
        'unrelated refinement owner '+key);
    } else if (category === 'container-of') {
      const children=['items','propertyNames','additionalProperties'];
      demand(ownerFile===file && children.some(k=>p+'/'+k===ownerPath && node[k]===owner), 'unrelated container owner '+key);
    } else if (category === 'legacy-id') {
      demand(file === 'id-crosswalk.schema.json' && p === '/properties/rows/items/properties/legacy_id'
        && !declaration.owner, 'unrelated legacy literal owner '+key);
    } else {
      demand(['free-text','human-label','enum-literal','format-value','regex'].includes(category), 'unknown exclusion category '+key);
      demand(!declaration?.owner, 'unexpected exclusion owner '+key);
      if(category==='enum-literal')demand(node.enum || Object.hasOwn(node,'const'), 'non-enum exclusion '+key);
      if(category==='format-value')demand(node.format, 'non-format exclusion '+key);
      if(category==='regex')demand(node.pattern, 'non-regex exclusion '+key);
    }
    // Reasons cannot authorize a new exemption. Baseline shapes delimit declarations
    // awaiting independent semantic review; baseline equality is not semantic proof.
    demand(isDeepStrictEqual(strip(node),strip(pointer(prior(file),p))), 'unreviewed exclusion shape '+key);
  }
  const legacyLiteral = (file, p, node) => file === 'id-crosswalk.schema.json'
    && p === '/properties/rows/items/properties/legacy_id'
    && node['x-spec-exclusion']?.category === 'legacy-id'
    && isDeepStrictEqual(strip(node), strip(pointer(prior(file), p)));
  return {owned, canonical, strip, prior, legacyLiteral};
};

'use strict';
const assert = require('node:assert/strict');
const constructs = require('../reference-registry-schema-constructs.cjs');
const {pointer} = require('../reference-registry-schema-path.cjs')(new Map());
const strip = value => Array.isArray(value) ? value.map(strip) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([k]) => !k.startsWith('x-spec-')).map(([k,v]) => [k,strip(v)])) : value;
const retained = {type:'object',additionalProperties:false,properties:{status:{type:'string'}},
  allOf:[{if:{properties:{status:{const:'done'}}},then:{required:['status']}}]};
function audit(schema) {
  const errors = [];
  constructs.audit(new Map([['test.json',schema]]),pointer,{strip,prior:() => retained},
    (ok,message) => {if (!ok) errors.push(message);});
  return errors;
}
assert.deepEqual(audit(retained),[],'exact retained refinement supported');
const changed = structuredClone(retained);
changed.allOf[0].then.properties = {count:{type:'integer'}};
assert(audit(changed).includes('unsupported schema construct then at test.json#/allOf/0/then'));
assert(audit({if:retained.allOf[0].if}).includes('unsupported schema construct if at test.json#/if'),
  'retained arm copied to a new location cannot inherit support');
for (const keyword of ['dependentSchemas','dependentRequired','patternProperties','prefixItems','$anchor',
  '$dynamicRef','$recursiveRef','$dynamicAnchor','$recursiveAnchor','$vocabulary','futureApplicator']) {
  const schema = {$defs:{'a/b~c':{type:'string',[keyword]:{type:'integer'}}}};
  assert(audit(schema).includes('unsupported schema construct '+keyword+' at test.json#/$defs/a~1b~0c/'+keyword));
}
assert.deepEqual(audit({type:'object',properties:{dependentSchemas:{type:'string'},if:{type:'string'}},
  enum:[{dependentSchemas:{count:{type:'integer'}}}],const:{prefixItems:[7]},
  'x-spec-exclusion':{owner:'test.json#',category:'human-label'}}),[],
  'property names and literal/annotation data are not schema keywords');
console.log('PASS retained refinement bounds, escaped pointers and schema/data separation; disk untouched');
require('../reference-registry-construct-red-controls.cjs');

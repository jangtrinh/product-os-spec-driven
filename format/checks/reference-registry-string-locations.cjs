'use strict';
const assert = require('node:assert/strict');
const schema = {$id:'https://spec-driven.local/format/v2/local.schema.json',properties:{},$defs:{}};
const schemas = new Map([['local.schema.json',schema]]);
const {pointer} = require('../reference-registry-schema-path.cjs')(schemas);
const {resolve} = require('../reference-registry-classification.cjs')(schemas,pointer);
const locations = require('../reference-registry-string-locations.cjs')(schemas,pointer,resolve);
const entries = new Map();
function bind(name,node) {
  schema.$defs[name] = {...node,'x-spec-ref':name};
  entries.set(name,{schema:{file:'local.schema.json',pointer:'/$defs/'+name}});
  return schema.$defs[name];
}
const leaf = bind('leaf',{type:'string'});
bind('record',{type:'object',additionalProperties:false,properties:{ref:leaf}});
schema.$defs.cycle = {type:'object',additionalProperties:false,properties:{next:{$ref:'#/$defs/cycle'}}};
schema.$defs.mixed = {anyOf:[{type:'string'},{type:'object',additionalProperties:false}]};
const literal = {type:'string','x-spec-ref':false,'x-spec-exclusion':{category:'human-label'}};
const cases = [
  ['scalar', {type:'string'}, true],
  ['nullable', {type:['string','null']}, true],
  ['nullable alternatives', {anyOf:[{type:'string'},{type:'null'}]}, true],
  ['enum', {enum:['alpha','beta']}, true],
  ['const', {const:'alpha'}, true],
  ['string conjunction', {allOf:[{type:'string'},{pattern:'^x$'}]}, true],
  ['string alias', {$ref:'#/$defs/leaf'}, true],
  ['classified object alias', {$ref:'#/$defs/record'}, true],
  ['classified array', {type:'array',items:leaf}, true],
  ['classified map', {type:'object',propertyNames:leaf,additionalProperties:literal}, true],
  ['empty object', {type:'object',additionalProperties:false}, false],
  ['numeric array', {type:'array',items:{type:'integer'}}, false],
  ['unbound string array', {type:'array',items:{type:'string'}}, false],
  ['wrong leaf binding', {type:'array',items:{type:'string','x-spec-ref':'leaf'}}, false],
  ['unchecked literal leaf', {type:'array',items:{type:'string','x-spec-ref':false}}, false],
  ['open array tail', {type:'array',prefixItems:[leaf]}, false],
  ['open object', {type:'object',properties:{ref:leaf}}, false],
  ['numeric object leaf', {type:'object',additionalProperties:false,properties:{ref:leaf,count:{type:'integer'}}}, false],
  ['string object union', {type:['string','object'],additionalProperties:false}, false],
  ['union alias', {$ref:'#/$defs/mixed'}, false],
  ['ref sibling union', {$ref:'#/$defs/mixed',minLength:1}, false],
  ['contradictory ref sibling', {$ref:'#/$defs/leaf',type:'object',additionalProperties:false}, false],
  ['numeric alternative', {oneOf:[{type:'string'},{type:'integer'}]}, false],
  ['mixed enum', {enum:['alpha',1]}, false],
  ['unknown', {}, false],
  ['absence only', {type:'null'}, false],
  ['unresolved ref', {$ref:'#/$defs/missing'}, false],
  ['typed unresolved ref', {type:'string',$ref:'#/$defs/missing'}, false],
  ['unsupported scalar applicator', {type:'string',futureApplicator:{type:'integer'}}, false],
  ['numeric dependency', {type:'object',properties:{ref:leaf},unevaluatedProperties:false,
    dependentSchemas:{count:{properties:{count:{type:'integer'}}}}}, false],
  ...['if','then','else','not','contains','unevaluatedProperties','unevaluatedItems','contentSchema']
    .map(keyword => [keyword+' hidden numeric leaf', {type:'object',additionalProperties:false,
      properties:{ref:leaf},[keyword]:{type:'integer'}}, false]),
  ['closed prefix', {type:'array',prefixItems:[leaf],items:false}, false],
  ['numeric prefix', {type:'array',prefixItems:[{type:'integer'}],items:leaf}, false],
  ['recursive container', {$ref:'#/$defs/cycle'}, false]
];
for (const [name,node,expected] of cases) {
  schema.properties.test = {...node,'x-spec-ref':'test'};
  entries.set('test',{schema:{file:'local.schema.json',pointer:'/properties/test'}});
  assert.equal(locations.valid(schema.properties.test,schema,entries),expected,name);
}
console.log('PASS '+cases.length+' effective string-location and classified-leaf cases; disk untouched');

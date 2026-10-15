'use strict';
const assert = require('node:assert/strict');
const parse = require('../reference-registry-json.cjs');
const schema = {
  $id: 'https://spec-driven.local/format/v2/local.schema.json', type: 'object', $defs: {row: {type: 'object', properties: {ref: {type: 'string'}}}},
  properties: {
    rows: {type: 'array', items: {$ref: '#/$defs/row'}},
    dictionary: {type: 'object', propertyNames: {type: 'string'}, additionalProperties: {type: 'string'}},
    shared: {$ref: 'shared.schema.json#/$defs/record'},
    composed: {allOf: [{type: 'object', properties: {ref: {type: 'string'}}}]}
  }
};
const shared = {$id: 'https://spec-driven.local/format/v2/shared.schema.json', $defs: {record: {type: 'object', properties: {ref: {type: 'string'}}}}};
const schemas = new Map([['local.schema.json', schema], ['shared.schema.json', shared]]);
const {location, pointer} = require('../reference-registry-schema-path.cjs')(schemas);
const positive = [
  ['rows[*].ref', schema.$defs.row.properties.ref],
  ['$defs.row.ref', schema.$defs.row.properties.ref],
  ['rows[*]', schema.properties.rows],
  ['dictionary{key}', schema.properties.dictionary.propertyNames],
  ['dictionary{value}', schema.properties.dictionary.additionalProperties],
  ['shared.ref', shared.$defs.record.properties.ref],
  ['composed.ref', schema.properties.composed.allOf[0].properties.ref]
];
for (const [path, node] of positive) assert(location(schema, path).includes(node), path);
for (const path of ['rows.ref', 'rows[*].absent', 'rows[*][*].ref', 'dictionary[*]',
  'dictionary{missing}', '$defs.absent.ref', 'shared.absent', 'composed.absent', 'rows[*].refjunk'])
  assert.deepEqual(location(schema, path), [], path);
const escaped = {properties: {'a/b~c': {type: 'string'}}};
assert.equal(pointer(escaped, '/properties/a~1b~0c'), escaped.properties['a/b~c']);
assert.deepEqual(parse('{"left":{"key":1},"right":{"key":2},"text":"{\\\"key\\\":3}"}'),
  {left: {key: 1}, right: {key: 2}, text: '{"key":3}'});
for (const text of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"rows":[{"x":1,"x":2}]}'])
  assert.throws(() => parse(text), /duplicate JSON key/);
assert.throws(() => parse('{'), SyntaxError);
console.log('PASS schema traversal: arrays, shared definitions, map keys, combinators and invalid paths');
console.log('PASS unique JSON keys: nested and escaped duplicates rejected; independent objects retained');
const classify = require('../reference-registry-classification.cjs')(schemas, pointer);
for (const node of [{type: 'string'}, {type: ['null', 'string']}, {enum: ['text']},
  {const: 'text'}, {}, {anyOf: [{type: 'null'}, {type: 'string'}]},
  {allOf: [{type: 'string'}, {pattern: '^x$'}]}, {$ref: '#/properties/dictionary/additionalProperties'}])
  assert(classify.canString(node, schema), JSON.stringify(node));
for (const node of [{type: 'integer'}, {type: 'object'}, {type: 'array'}, {enum: [1, 2]},
  {const: null}, {allOf: [{type: 'integer'}, {}]}, {$ref: '#/properties/rows'}])
  assert(!classify.canString(node, schema), JSON.stringify(node));
// Each site is independently required even beneath a classified array/combinator.
const nested = {$id:'https://spec-driven.local/format/v2/nested.schema.json',type: 'array', 'x-spec-ref': false, 'x-spec-ref-reason': 'Literal array container.',
  items: {anyOf: [{type: 'string'}, {$ref: '#/$defs/text'}]}, $defs: {text: {type: 'string'}}};
const nestedSchemas = new Map([['nested.schema.json', nested]]), diagnostics = [];
const nestedClassify = require('../reference-registry-classification.cjs')(nestedSchemas, pointer);
nestedClassify.audit(new Map(), (ok, text) => {if (!ok) diagnostics.push(text);},
  {marked: () => false, hints: () => '', hidesTyped: () => false, declaresReference: () => false});
for (const site of ['/items', '/items/anyOf/0', '/items/anyOf/1', '/$defs/text'])
  assert(diagnostics.some(t => t.includes('unannotated reference nested.schema.json#' + site)), site);
console.log('PASS mandatory classification: plain/mixed strings, enums, const, aliases, definitions and non-inheritance');
// Mutate all shipped rules in memory; each direction AND causal flag must reject.
const registry = require('../reference-registry.json');
const direction = require('../reference-registry-direction-contract.cjs');
let mutations = 0;
for (const original of registry.entries) for (const field of ['edge', 'causal']) {
  const altered = structuredClone(original);
  if (field === 'edge') altered.edge = {from: original.edge.to, to: original.edge.from};
  else altered.causal = !original.causal;
  const entries = new Map(registry.entries.map(e => [e.id, e.id === altered.id ? altered : e])), errors = [];
  direction.audit(entries, (ok, text) => {if (!ok) errors.push(text);});
  assert(errors.some(t => t.startsWith(field === 'edge' ? 'source-contract direction ' : 'source-contract causal edge ')), original.id);
  mutations++;
}
assert.deepEqual(Object.keys(direction.relationContract).sort(),
  ['derives', 'implements', 'verifies', 'uses', 'governs', 'renders', 'supersedes', 'mentions'].sort());
console.log('PASS all-relation direction/causality sweep: ' + mutations + ' mutations rejected; disk untouched');

'use strict';
// Exercise the coverage guard against unsupported encodings, restoring every byte.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const schema = 'format/schema/front-matter.schema.json';
const classification = 'format/reference-registry-source-classifications/source-02.json';
const saved = new Map([schema, classification].map(f => [f, fs.readFileSync(path.join(root, f))]));
const field = node => () => {
  const value = JSON.parse(saved.get(schema)); value.properties.source_lookup = node;
  return [schema, value];
};
const identity = node => () => {
  const value = JSON.parse(saved.get(schema));
  value.properties.id = {...node, 'x-spec-ref':'front-matter-id'};
  return [schema, value];
};
const controls = [
  ['registered-id-object', identity({type:'object',additionalProperties:false}), 'registered reference must be a string location'],
  ['registered-id-integer-array', identity({type:'array',items:{type:'integer'}}), 'registered reference must be a string location'],
  ['registered-id-string-object-union', identity({type:['string','object'],additionalProperties:false}), 'registered reference must be a string location'],
  ['registered-id-union-via-ref', () => {
    const [file, value] = identity({$ref:'#/properties/epic'})();
    value.properties.epic.type = ['string','object'];
    value.properties.epic.additionalProperties = false;
    return [file, value];
  }, 'registered reference must be a string location'],
  ['closed-reference-pattern-keys', field({type:'object', additionalProperties:false, patternProperties:{'^REQ-\\d+$':{type:'integer'}}}), 'unsupported schema construct patternProperties'],
  ['numeric-reference-suffix', field({type:'integer', minimum:1, description:'Reference to REQ-n by its numeric suffix n.'}), 'forbidden non-string reference'],
  ['registered-source-non-reference', () => {
    const rows = JSON.parse(saved.get(classification));
    const row = rows.find(([, c]) => c.entry === 'pipeline-review-rubric');
    assert(row); row[1] = {category:'non-reference'};
    return [classification, rows];
  }, 'source classification contradicts registry binding'],
  ['closed-path-pattern-keys', field({type:'object', additionalProperties:false, patternProperties:{'^(?!/)[^\\s]+\\.md$':{type:'integer'}}}), 'unsupported schema construct patternProperties'],
  ['unevaluated-reference-pattern-keys', field({type:'object', unevaluatedProperties:false, patternProperties:{'^REQ-\\d+$':{type:'integer'}}}), 'unsupported schema construct patternProperties'],
  ['composed-reference-pattern-keys', field({allOf:[{type:'object', additionalProperties:false, patternProperties:{'^REQ-\\d+$':{type:'integer'}}}]}), 'unsupported schema construct patternProperties'],
  ['non-reference-open-pattern-keys', field({type:'object', additionalProperties:false, patternProperties:{'^label-':{type:'integer'}}}), 'unsupported schema construct patternProperties'],
  ['open-property-name-labels', field({type:'object', propertyNames:{type:'string'}, additionalProperties:{type:'integer'}}), 'unclassified open object key namespace'],
  ['false-open-keys-without-category', field({type:'object', additionalProperties:{type:'integer'}, 'x-spec-ref':false}), 'unclassified open object key namespace'],
  ['new-reference-property-names', field({type:'object', additionalProperties:false, propertyNames:{type:'string',pattern:'^REQ-\\d+$'}}), 'forbidden reference-bearing object keys'],
  ['new-path-property-names', field({type:'object', additionalProperties:false, propertyNames:{$ref:'https://spec-driven.local/format/v2/model-common.schema.json#/$defs/path'}}), 'forbidden reference-bearing object keys'],
  ...['number','boolean','object','array'].map(type => [type+'-reference-description', field({type, description:'Reference to the source record.', ...(type==='object'?{additionalProperties:false}:{}), ...(type==='array'?{items:{type:'integer'}}:{})}), 'forbidden non-string reference']),
  ['numeric-reference-pattern', field({type:'integer',pattern:'^REQ-\\d+$'}), 'forbidden non-string reference'],
  ...['anyOf','oneOf','allOf'].map(keyword => [keyword+'-numeric-reference', field({[keyword]:[{type:'integer'}],description:'Reference to REQ-n by numeric suffix.'}), 'forbidden non-string reference']),
  ['empty-pattern-namespace', field({type:'object',additionalProperties:false,patternProperties:{}}), 'unsupported schema construct patternProperties'],
  ['numeric-reference-false-exclusion', field({type:'integer',description:'Reference to REQ-n.', 'x-spec-ref':false, 'x-spec-exclusion':{category:'human-label'}}), 'forbidden non-string reference'],
  ['mixed-reference-type', field({type:['string','integer'],description:'Reference to REQ-n.'}), 'forbidden non-string reference'],
  ['numeric-reference-annotation', field({type:'integer','x-spec-ref':'front-matter-id'}), 'forbidden non-string reference'],
  ['source-reference-wrong-entry', () => {
    const rows = JSON.parse(saved.get(classification));
    rows.find(([, c]) => c.entry === 'pipeline-review-rubric')[1].entry = 'pipeline-review-log-dir';
    return [classification, rows];
  }, 'source-derived binding mismatch']
];
const observe = process.argv.includes('--observe-green');
const coverage = () => spawnSync(process.execPath, ['format/checks/reference-registry-coverage.cjs'], {cwd:root,env:process.env,encoding:'utf8'});
if (!observe) assert.equal(coverage().status,0,'restored baseline must be GREEN before controls');
let count = 0;
try {
  for (const [name, mutate, message] of controls) {
    const [file, value] = mutate();
    fs.writeFileSync(path.join(root,file), JSON.stringify(value));
    let result;
    try { result = spawnSync(process.execPath, ['format/checks/reference-registry-coverage.cjs'], {cwd:root,env:process.env,encoding:'utf8'}); }
    finally { for (const [f, bytes] of saved) fs.writeFileSync(path.join(root,f), bytes); }
    assert.ifError(result.error);
    console.log(JSON.stringify({control:name,exit:result.status,diagnostic:result.stderr.split('\n').filter(Boolean),restored:true}));
    if (!observe) { assert.equal(result.status,1,name); assert(result.stderr.includes(message),name+' specific diagnostic'); }
    count++;
  }
  for (const [f, bytes] of saved) assert(fs.readFileSync(path.join(root,f)).equals(bytes),f);
  if (!observe) assert.equal(coverage().status,0,'restored baseline must be GREEN after controls');
  console.log(`${observe?'OBSERVED':'PASS'} ${count}/${controls.length} controls; bytes restored`);
} finally { for (const [f, bytes] of saved) fs.writeFileSync(path.join(root,f), bytes); }

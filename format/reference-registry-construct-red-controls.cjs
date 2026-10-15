'use strict';
// Future applicators cannot inherit a GREEN proof from an incomplete traversal.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..'), file = 'format/schema/model-common.schema.json';
const saved = fs.readFileSync(path.join(root,file)), numeric = {type:'integer'};
const probes = [
  ['dependentSchemas', scope => {
    delete scope.additionalProperties; delete scope.required;
    scope.unevaluatedProperties = false;
    scope.dependentSchemas = {count:{type:'object',properties:{count:numeric},additionalProperties:false}};
  }],
  ['if', scope => {scope.if = {properties:{count:numeric}};}],
  ['then', scope => {scope.then = {properties:{count:numeric}};}],
  ['else', scope => {scope.else = {properties:{count:numeric}};}],
  ['not', scope => {scope.not = {properties:{count:numeric}};}],
  ['unevaluatedProperties', scope => {scope.unevaluatedProperties = numeric;}],
  ['contains', scope => {scope.contains = numeric;}],
  ['prefixItems', scope => {scope.prefixItems = [numeric];}],
  ['unevaluatedItems', scope => {scope.unevaluatedItems = numeric;}],
  ['patternProperties', scope => {scope.patternProperties = {'^count$':numeric};}],
  ['dependentRequired', scope => {scope.dependentRequired = {count:['count']};}],
  ['$dynamicRef', scope => {scope.$dynamicRef = '#/$defs/criterion/properties/score';}],
  ['$anchor', scope => {scope.$anchor = 'numericScope';}],
  ['$recursiveRef', scope => {scope.$recursiveRef = '#';}],
  ['futureApplicator', scope => {scope.futureApplicator = {properties:{count:numeric}};}],
  ['definitions', scope => {scope.definitions = {count:numeric};}],
  ['additionalItems', scope => {scope.additionalItems = numeric;}],
  ['contentSchema', scope => {scope.contentSchema = numeric;}]
];
const coverage = () => spawnSync(process.execPath,['format/checks/reference-registry-coverage.cjs'],
  {cwd:root,env:process.env,encoding:'utf8'});
const observe = process.argv.includes('--observe-green');
assert.equal(coverage().status,0,'restored baseline GREEN before controls');
try {
  for (const [keyword,mutate] of probes) {
    const value = JSON.parse(saved); mutate(value.$defs.scope);
    fs.writeFileSync(path.join(root,file),JSON.stringify(value));
    let result;
    try {result = coverage();} finally {fs.writeFileSync(path.join(root,file),saved);}
    assert.ifError(result.error);
    const diagnostic = 'unsupported schema construct '+keyword+' at model-common.schema.json#/$defs/scope/'+keyword;
    console.log(JSON.stringify({control:keyword,exit:result.status,diagnostic:result.stderr.split('\n').filter(Boolean),restored:true}));
    if (!observe) {assert.equal(result.status,1,keyword); assert(result.stderr.includes(diagnostic),keyword+' explicit diagnostic');}
  }
  assert(fs.readFileSync(path.join(root,file)).equals(saved),'exact schema bytes restored');
  assert.equal(coverage().status,0,'restored baseline GREEN after controls');
  console.log((observe?'OBSERVED':'PASS')+' '+probes.length+'/'+probes.length+' unsupported construct controls; bytes restored');
} finally {fs.writeFileSync(path.join(root,file),saved);}

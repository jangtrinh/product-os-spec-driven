'use strict';
const assert=require('node:assert/strict');
const {a}=require('./compatibility-suite.cjs');
const {audit,base}=require('../reference-registry-schema-identity.cjs');
const one={$id:base+'one.schema.json',$defs:{value:{type:'string'}}};
const two={$id:base+'two.schema.json',type:'string'};
const schemas=new Map([['one.schema.json',one],['two.schema.json',two]]);
schemas.uriResolver=a.opts.uriResolver;
const errors=[];audit(schemas,(ok,message)=>{if(!ok)errors.push(message);});assert.deepEqual(errors,[]);
const {resolve}=require('../reference-registry-schema-path.cjs')(schemas);
for(const ref of ['two.schema.json','./two.schema.json','../v2/two.schema.json',base+'two.schema.json',
  '#/$defs/value','#/%24defs/value',base+'%2E/two.schema.json',base+'two.schema.json?x=1',
  'https://foreign.invalid/two.schema.json']) {
  const ajv=new a.constructor({strict:true});ajv.addSchema(one);ajv.addSchema(two);
  const actual=resolve({$ref:ref},one);
  let validator;
  try {validator=ajv.compile({$id:base+'probe.schema.json',$ref:ref.startsWith('#')?one.$id+ref:ref});}
  catch(error) {assert.equal(typeof error.missingRef,'string','Ajv reports an unresolved reference: '+error.message);}
  assert.equal(actual.node!==undefined,!!validator,'same Ajv resource identity '+ref);
}
console.log('PASS canonical root ids and 9 Ajv URI identity parity cases');
require('../reference-registry-root-identity-red-controls.cjs');

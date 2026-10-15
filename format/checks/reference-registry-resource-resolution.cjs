'use strict';
const assert = require('node:assert/strict');
const constructs = require('../reference-registry-schema-constructs.cjs');
const a = {$id:'https://spec-driven.local/format/v2/a.json',
  $defs:{'a/b~c':{type:'string'},no:false,zero:{const:0},list:[{type:'string'}]}};
const b = {$id:'https://spec-driven.local/format/v2/b.json',type:'string'};
const schemas = new Map([['a.json',a],['b.json',b]]);
const {pointer} = require('../reference-registry-schema-path.cjs')(schemas);
const {resolve} = require('../reference-registry-classification.cjs')(schemas,pointer);
const target = ref => resolve({$ref:ref},a);
function audit(node) {
  const errors=[];
  constructs.audit(new Map([['a.json',node],['b.json',b]]),pointer,
    {strip:v=>v,prior:()=>undefined},(ok,message)=>{if(!ok)errors.push(message);});
  return errors;
}
assert.deepEqual(audit(a),[],'document root ids remain supported');
assert(audit({...a,$defs:{nested:{$id:'nested.json',type:'string'}}})
  .includes('unsupported schema construct $id (nested resource) at a.json#/$defs/nested/$id'));
assert.equal(target('#/$defs/a~1b~0c').node,a.$defs['a/b~c']);
assert.equal(target('#/%24defs/a~1b~0c').node,a.$defs['a/b~c'],'URI fragment decoding');
assert.equal(target('#/$defs/no').node,false,'boolean target exists');
assert.equal(target('').node,a,'empty reference targets document root');
assert.equal(target('#').node,a);
for (const ref of ['b.json','./b.json','https://spec-driven.local/format/v2/b.json']) {
  assert.equal(target(ref).node,b,'known document '+ref);
  assert.equal(target(ref).owner,b,'target owner '+ref);
}
for (const ref of ['https://untrusted.invalid/b.json','https://untrusted.invalid/a.json#/$defs/a~1b~0c',
  '../elsewhere/b.json','b.json?foreign=true','#missing','#/$defs/missing','#/%ZZ',
  '#/$defs/a~2b','#/__proto__','#/constructor','#/$defs/list/01','#/$defs/list/1',7,null])
  assert.equal(target(ref).node,undefined,'unresolved reference '+ref);
for (const [keyword,value] of [['$anchor','screen'],['$dynamicAnchor','screen']])
  assert(audit({...a,[keyword]:value}).includes('unsupported schema construct '+keyword+' at a.json#/'+keyword));
assert(audit({...a,$defs:{unused:{$ref:'https://untrusted.invalid/b.json'}}})
  .some(e=>e.startsWith('unresolved schema reference at a.json#/$defs/unused/$ref')),
  'every ref is preflighted, including unused definitions');
assert.equal(constructs.understood({$id:'nested.json',type:'string'},a,resolve),false);
console.log('PASS root resource restrictions and known-document JSON pointer resolution; disk untouched');
require('../reference-registry-resource-red-controls.cjs');

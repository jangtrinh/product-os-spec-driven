'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..'), file = 'format/schema/model-common.schema.json';
const saved = fs.readFileSync(path.join(root,file));
// Reuse the existing check's approved Ajv loading path; controls inherit its environment.
const {a} = require('./checks/compatibility-suite.cjs');
const location = 'model-common.schema.json#/$defs/screen';
const nested = target => ({$id:'https://spec-driven.local/format/v2/scoped-screen.schema.json',
  $ref:'#/$defs/path',$defs:{path:target},'x-spec-ref':'model-common-defs-screen'});
const probes = [
  ['nested-id-integer',nested({type:'integer'}),'unsupported schema construct $id (nested resource) at '+location+'/$id'],
  ['nested-id-numeric-enum',nested({enum:[7]}),'unsupported schema construct $id (nested resource) at '+location+'/$id'],
  ['nested-id-nullable-integer',nested({anyOf:[{type:'integer'},{type:'null'}]}),
    'unsupported schema construct $id (nested resource) at '+location+'/$id'],
  ['anchor',{$ref:'#/$defs/path',$anchor:'screen','x-spec-ref':'model-common-defs-screen'},
    'unsupported schema construct $anchor at '+location+'/$anchor'],
  ['external-ref',{$ref:'https://untrusted.invalid/model-common.schema.json#/$defs/path',
    'x-spec-ref':'model-common-defs-screen'},'unresolved schema reference at '+location+'/$ref'],
  ['dynamic-anchor',{$ref:'#/$defs/path',$dynamicAnchor:'screen','x-spec-ref':'model-common-defs-screen'},
    'unsupported schema construct $dynamicAnchor at '+location+'/$dynamicAnchor'],
  ['missing-pointer',{$ref:'#/$defs/missing','x-spec-ref':'model-common-defs-screen'},
    'unresolved schema reference at '+location+'/$ref'],
  ['named-fragment',{$ref:'#screen','x-spec-ref':'model-common-defs-screen'},
    'unresolved schema reference at '+location+'/$ref']
];
const coverage = () => spawnSync(process.execPath,['format/checks/reference-registry-coverage.cjs'],
  {cwd:root,env:process.env,encoding:'utf8'});
const observe = process.argv.includes('--observe-green');
assert.equal(coverage().status,0,'restored baseline GREEN before controls');
try {
  for (const [name,screen,diagnostic] of probes) {
    const schema = JSON.parse(saved); schema.$defs.screen = screen;
    fs.writeFileSync(path.join(root,file),JSON.stringify(schema));
    let result;
    try {result = coverage();} finally {fs.writeFileSync(path.join(root,file),saved);}
    assert.ifError(result.error);
    const receipt = {control:name,exit:result.status,stdout:result.stdout,stderr:result.stderr,
      restored:fs.readFileSync(path.join(root,file)).equals(saved)};
    if (name.startsWith('nested-id-')) {
      const ajv = new a.constructor({strict:true,allErrors:true});
      ajv.addKeyword({keyword:'x-spec-ref',schemaType:['string','boolean'],valid:true});
      const mutant = ajv.compile({$id:schema.$id,$defs:{screen},$ref:'#/$defs/screen'});
      const prior = ajv.compile(JSON.parse(saved).$defs.screen);
      receipt.integerAccepted = mutant(7); receipt.originalIntegerAccepted = prior(7);
      assert.equal(receipt.integerAccepted,true,name+' actual numeric witness');
      assert.equal(receipt.originalIntegerAccepted,false,name+' original string contract');
    }
    console.log(JSON.stringify(receipt));
    assert(receipt.restored,name+' exact bytes restored');
    if (!observe) {assert.equal(result.status,1,name); assert(result.stderr.includes(diagnostic),name+' explicit diagnostic');}
  }
  assert.equal(coverage().status,0,'restored baseline GREEN after controls');
  console.log((observe?'OBSERVED':'PASS')+' '+probes.length+'/'+probes.length+' resource controls; bytes restored');
} finally {fs.writeFileSync(path.join(root,file),saved);}

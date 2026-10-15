'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const files = ['model-common.schema.json','clarify-record.schema.json'];
const saved = new Map(files.map(file => [file,fs.readFileSync(path.join(__dirname,'schema',file))]));
const fresh = file => JSON.parse(saved.get(file));
// Reuse the established strict Ajv constructor/formats; no extra environment lookup.
const {a} = require('./checks/compatibility-suite.cjs');
const cases = [
  ...[['integer',{type:'integer'}],['numeric-enum',{enum:[7]}],
    ['nullable-integer',{anyOf:[{type:'integer'},{type:'null'}]}]].map(([label,target]) => [
    'encoded-root-'+label, () => {
      const common = fresh(files[0]), other = fresh(files[1]);
      other.$id = 'https://spec-driven.local/format/v2/%2E/model-common.schema.json';
      other.$defs = {path:target};
      common.$defs.screen = {$ref:other.$id+'#/$defs/path','x-spec-ref':'model-common-defs-screen'};
      return [[files[0],common],[files[1],other]];
    },'noncanonical schema root identity',true]),
  ['duplicate-root', () => {
    const other = fresh(files[1]); other.$id = fresh(files[0]).$id;
    return [[files[1],other]];
  },'duplicate schema root identity'],
  ['wrong-root-filename', () => {
    const other = fresh(files[1]); other.$id = 'https://spec-driven.local/format/v2/other.schema.json';
    return [[files[1],other]];
  },'noncanonical schema root identity'],
  ['dot-segment-root', () => {
    const other = fresh(files[1]); other.$id = 'https://spec-driven.local/format/v2/./clarify-record.schema.json';
    return [[files[1],other]];
  },'noncanonical schema root identity']
];
const observe = process.argv.includes('--observe-green');
try {
  for (const [control,mutate,diagnostic,witness] of cases) {
    const changed = mutate();
    for (const [file,schema] of changed) fs.writeFileSync(path.join(__dirname,'schema',file),JSON.stringify(schema));
    let result;
    try {
      result = spawnSync(process.execPath,['format/checks/reference-registry-coverage.cjs'],
        {cwd:root,env:process.env,encoding:'utf8'});
      assert.ifError(result.error);
      if (witness) {
        const ajv = new a.constructor({strict:true,allErrors:true});
        for (const [keyword,schemaType] of [['x-spec-ref',['string','boolean']],
          ['x-spec-ref-reason','string'],['x-spec-exclusion','object']]) ajv.addKeyword({keyword,schemaType,valid:true});
        for (const [name,format] of Object.entries(a.formats)) ajv.addFormat(name,format);
        const common = changed[0][1], other = changed[1][1];
        ajv.addSchema(other);
        const mutant = ajv.compile({$id:common.$id,$defs:{screen:common.$defs.screen},$ref:'#/$defs/screen'});
        const prior = ajv.compile(fresh(files[0]).$defs.screen);
        assert.equal(mutant(7),true,control+' actual numeric witness');
        assert.equal(prior(7),false,control+' original string contract');
      }
    } finally {
      for (const [file,bytes] of saved) fs.writeFileSync(path.join(__dirname,'schema',file),bytes);
    }
    const restored = [...saved].every(([file,bytes])=>fs.readFileSync(path.join(__dirname,'schema',file)).equals(bytes));
    console.log(JSON.stringify({control,exit:result.status,stdout:result.stdout,stderr:result.stderr,
      numericWitness:!!witness,restored}));
    assert(restored,control+' exact bytes restored');
    if (observe) { if (witness) assert.equal(result.status,0,control+' defect passes before fix'); }
    else {assert.equal(result.status,1,control+' rejected');assert(result.stderr.includes(diagnostic),control+' intended diagnostic');}
  }
  console.log((observe?'OBSERVED':'PASS')+' '+cases.length+'/'+cases.length+' root identity negative test cases; bytes restored');
} finally {for (const [file,bytes] of saved) fs.writeFileSync(path.join(__dirname,'schema',file),bytes);}

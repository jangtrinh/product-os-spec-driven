'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const registry = 'format/reference-registry.json', schema = 'format/schema/front-matter.schema.json';
const format = 'format/SPEC-FORMAT-v2.md', spec = 'SPEC.md';
const classification='format/reference-registry-source-classifications/source-01.json';
const files = [registry, schema, format, spec, classification];
const originals = new Map(files.map(f => [f, fs.readFileSync(path.join(root, f))]));
const fresh = f => JSON.parse(originals.get(f));
const field = node => () => {const s = fresh(schema); s.properties.required_source = node; return [schema, JSON.stringify(s)];};
const entry = change => () => {const r = fresh(registry); change(r.entries.find(e => e.id === 'front-matter-trace-req')); return [registry, JSON.stringify(r)];};
const controls = [
  ['false-id-reason', field({type:'string', pattern:'^BR-\\d+$', 'x-spec-ref':false, 'x-spec-ref-reason':'This is only a metadata string.'})],
  ['false-path-reason', field({type:'string', description:'Relative path to the required source document.', 'x-spec-ref':false, 'x-spec-ref-reason':'This is only a metadata string.'})],
  ['fabricated-alias', field({type:'string','x-spec-ref':false,'x-spec-ref-reason':'Shared value grammar; not a separate dependency at this alias.', 'x-spec-exclusion':{category:'alias-of',owner:'front-matter.schema.json#/properties/title'}})],
  ['implicit-object', field({type:'object'})],
  ['implicit-array', field({type:'array'})],
  ['tuple-tail', field({type:'array',prefixItems:[{type:'integer'}]})],
  ['contradictory-source', entry(e => {e.source.id='req:{value}';})],
  ['unavailable-placeholder', entry(e => {e.target.id='req:{nonexistent-context}';})],
  ['causal-self-template', entry(e => {e.target=structuredClone(e.source);})],
  ['contradictory-case', () => {const r=fresh(registry);r.entries.find(e=>e.id==='screen-inventory-screens-source-ref').cases[0].target.id='req:{value}';return [registry,JSON.stringify(r)];}],
  ['new-prd-column', () => [format,originals.get(format).toString().replace('columns requirement and source.', 'columns requirement and source. Optional `Governing decision` column names the governing decision.')]],
  ['new-config-field', () => [spec,originals.get(spec).toString().replace('  log_dir: review/log','  log_dir: review/log\n  required_source: spec/contract/master.md')]],
  ['deleted-declaration', () => [spec,originals.get(spec).toString().replace('  rubric: rules/review-rubric.md\n','')]]
];
for (const id of ['pipeline-stages-context','pipeline-review-rubric','pipeline-review-log-dir','pipeline-gates-dir','pipeline-evals-per-file'])
  controls.push(['remove-'+id,()=>{const r=fresh(registry);r.entries=r.entries.filter(e=>e.id!==id);return [registry,JSON.stringify(r)];}]);
for (const keyword of ['allOf','anyOf','oneOf','prefixItems'])
  controls.push(['implicit-'+keyword,field({[keyword]:[{type:'object'}]})]);
for (const keyword of ['if','then','else','not','additionalProperties','unevaluatedProperties','items','contains'])
  controls.push(['implicit-'+keyword,field({[keyword]:{type:'array'}})]);
controls.push(
  ['delete-structured-declaration',()=>[spec,originals.get(spec).toString().replace(/,?\{"doc_type":"pipeline","location":\{"kind":"json","path":"evals\.\*\[\]\.per_file"\}\}/,'')]],
  ['duplicate-source-declaration',()=>[spec,originals.get(spec).toString().replace('```spec-grammar\n[','```spec-grammar\n[{"doc_type":"pipeline","location":{"kind":"json","path":"review.rubric"}},')]],
  ['missing-source-classification',()=>{const rows=fresh(classification);rows.shift();return [classification,JSON.stringify(rows)];}],
  ['duplicate-source-classification',()=>{const rows=fresh(classification);rows.push(rows[0]);return [classification,JSON.stringify(rows)];}],
  ['stale-source-classification',()=>{const rows=fresh(classification);rows.push(['missing-source-location',{category:'human-label'}]);return [classification,JSON.stringify(rows)];}],
  ['unsupported-schema-construct',field({type:'object',additionalProperties:false,unrecognizedKeyword:{type:'string'}})],
  ['unresolved-classified-alias',field({$ref:'#/$defs/absent','x-spec-ref':false,'x-spec-exclusion':{category:'alias-of',owner:'front-matter.schema.json#/$defs/absent'}})],
  ['cyclic-unclassified-definition',()=>{const s=fresh(schema);s.$defs.cycle={type:'object',additionalProperties:{$ref:'#/$defs/cycle'}};return [schema,JSON.stringify(s)];}]
);
const observe = process.argv.includes('--observe-green'), receipts=[];
try {
  for (const [label, mutate] of controls) {
    const [file, bytes]=mutate();
    fs.writeFileSync(path.join(root,file),bytes);
    let result;
    try {result=spawnSync(process.execPath,['format/checks/reference-registry-coverage.cjs'],{cwd:root,env:process.env,encoding:'utf8'});}
    finally {for(const [f,b] of originals)fs.writeFileSync(path.join(root,f),b);}
    receipts.push({control:label,command:'node format/checks/reference-registry-coverage.cjs',exit:result.status,stdout:result.stdout,stderr:result.stderr,restored:true});
    if(!observe) {assert.equal(result.status,1,label+' must reject'); assert.match(result.stderr,/RED/);}
    console.log(`${observe?'PRE-FIX':'RED'} ${label}: exit ${result.status}; bytes restored`);
  }
  for(const [f,b] of originals)assert(fs.readFileSync(path.join(root,f)).equals(b),f);
  console.log(`${observe?'OBSERVED':'PASS'} ${receipts.length}/${receipts.length} controls; original bytes restored`);
} finally {
  for(const [f,b] of originals)fs.writeFileSync(path.join(root,f),b);
  const prefix=observe?'closure-pre-fix':'closure-red-controls';
  // One receipt per line, split to keep each artifact under the file-size cap.
  fs.writeFileSync(path.join(__dirname,'evidence/reference-registry',prefix+'.jsonl'),receipts.map(r=>JSON.stringify(r)).join('\n')+'\n');
}

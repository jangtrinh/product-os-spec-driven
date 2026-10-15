'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),file=path.join(__dirname,'reference-registry.json');
const saved=fs.readFileSync(file);
const cases=[
  ['missing-ownership',registry=>{registry.entries=registry.entries.filter(e=>e.id!=='prd-req-identity');},'missing document ownership entry prd-req-identity'],
  ['non-causal-ownership',registry=>{const e=registry.entries.find(e=>e.id==='decision-ledger-identity');e.causal=false;},'non-causal document ownership decision-ledger-identity'],
  ['reversed-ownership',registry=>{registry.entries.find(e=>e.id==='prd-req-identity').edge={from:'target',to:'source'};},'reversed document ownership prd-req-identity'],
  ['missing-document-parent',registry=>{delete registry.entries.find(e=>e.id==='us-ac-identity').ownership;},'document ownership source us-ac-identity'],
  ...['crosswalk-row-id','source-ledger-item-id'].flatMap(id=>[
    [id+'-missing',registry=>{registry.entries=registry.entries.filter(e=>e.id!==id);},'missing document ownership entry '+id],
    [id+'-without-ownership',registry=>{const e=registry.entries.find(e=>e.id===id);e.effect='context';e.causal=false;},'non-causal document ownership '+id],
    [id+'-non-causal',registry=>{registry.entries.find(e=>e.id===id).causal=false;},'non-causal document ownership '+id],
    [id+'-reversed',registry=>{registry.entries.find(e=>e.id===id).edge={from:'target',to:'source'};},'reversed document ownership '+id],
    [id+'-missing-document',registry=>{registry.entries.find(e=>e.id===id).source={kinds:['artifact'],id:'artifact:{record-path}#item'};},'document ownership source '+id]
  ]),
  ['mention-gains-ownership',registry=>{registry.entries.find(e=>e.id==='body-id-mention').ownership={kinds:['artifact'],id:'artifact:{document-or-record-path}'};},'ownership on non-declaring reference body-id-mention']
];
try {
  for(const [control,mutate,diagnostic]of cases) {
    const registry=JSON.parse(saved);mutate(registry);fs.writeFileSync(file,JSON.stringify(registry));
    let result;
    try {result=spawnSync(process.execPath,['format/checks/reference-registry-coverage.cjs'],{cwd:root,env:process.env,encoding:'utf8'});}
    finally {fs.writeFileSync(file,saved);}
    assert.ifError(result.error);const restored=fs.readFileSync(file).equals(saved);
    console.log(JSON.stringify({control,exit:result.status,stdout:result.stdout,stderr:result.stderr,restored}));
    assert.equal(result.status,1,control+' rejected');assert(result.stderr.includes(diagnostic),control+' intended diagnostic');assert(restored,control+' exact bytes restored');
  }
  console.log('PASS '+cases.length+'/'+cases.length+' document ownership negative test cases; bytes restored');
} finally {fs.writeFileSync(file,saved);}

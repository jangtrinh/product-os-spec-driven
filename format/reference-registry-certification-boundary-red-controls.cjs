'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const file = path.join(__dirname,'reference-registry.json'), saved = fs.readFileSync(file);
const registry = JSON.parse(saved), entryId = 'candidate-manifest-members-artifacts';
const controls = [
  ['silent omission', r => {delete r.entries.find(e=>e.id===entryId).certification_boundary;}],
  ['wrong entry', r => {r.entries[0].certification_boundary=r.entries.find(e=>e.id===entryId).certification_boundary; delete r.entries.find(e=>e.id===entryId).certification_boundary;}],
  ['unknown token', r => {r.entries.find(e=>e.id===entryId).certification_boundary='whole-proof-envelope';}],
  ['duplicated capability', r => {r.entries[0].certification_boundary=r.entries.find(e=>e.id===entryId).certification_boundary;}],
];
const check = () => spawnSync(process.execPath,[path.join(__dirname,'checks/reference-registry-coverage.cjs')],{encoding:'utf8',env:process.env,maxBuffer:8*1024*1024});
try {
  const green = check(); assert.equal(green.status,0,green.stdout+green.stderr);
  for (const [name,mutate] of controls) {
    const changed = structuredClone(registry); mutate(changed);
    fs.writeFileSync(file,JSON.stringify(changed));
    assert.notDeepEqual(fs.readFileSync(file),saved);
    const red = check(); assert.equal(red.status,1,name+': '+red.stdout+red.stderr);
    assert.match(red.stderr,/graph certification boundary|registry shape/);
    const shared = spawnSync(process.execPath,['--input-type=module','-e',"import {loadReferenceRegistry} from './tools/lib/census-registry.mjs'; loadReferenceRegistry();"],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
    assert.equal(shared.status,1,name+': shared loader must refuse');
    assert.match(shared.stderr,/graph certification boundary/);
    fs.writeFileSync(file,saved);
    const restored = check(); assert.equal(restored.status,0,restored.stdout+restored.stderr);
    console.log('PASS RED '+name+'; restored Format/shared registry control');
  }
} finally {fs.writeFileSync(file,saved);}
assert.deepEqual(fs.readFileSync(file),saved);

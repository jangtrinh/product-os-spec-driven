import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {observe,nodeCommand} from './process-observation.mjs';
import {sha256} from '../lib/config/path-selection.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const accounting=path.join(repo,'tools/evals/result-accounting.mjs');
const suite=path.join(repo,'tools/evals/run-evals.mjs');
const originals=new Map([accounting,suite].map(file=>[file,fs.readFileSync(file)]));
const probes=[
  ['per-case-zero',accounting,'denominator: ac.length','denominator: 0'],
  ['suite-zero',suite,"selected.reduce((n,id)=>n+requested[id].ac.total,0)",'0'],
  ['remove-unverified',accounting,'const ac = model.stories.flatMap(story => story.ac.rows.map(row => `${story.doc.id}.${row.id}`));','const ac = model.stories.flatMap(story => story.ac.rows.map(row => `${story.doc.id}.${row.id}`)).filter(()=>false);'],
  ['exclude-blocked-ui',suite,'selected.reduce((n,id)=>n+requested[id].ac.total,0)',"selected.filter(id=>id!=='ui-feature').reduce((n,id)=>n+requested[id].ac.total,0)"],
];
const observations=[];
try {
  for(const [id,file,from,to] of probes) {
    const source=originals.get(file).toString();assert.ok(source.includes(from),`Missing mutation target ${id}`);
    fs.writeFileSync(file,source.replace(from,to));
    try {
      const row=await observe(nodeCommand('--test',path.join(repo,'tools/evals/test/selection-accounting.test.mjs')),repo);
      observations.push({id,...row});assert.equal(row.exit,1,`${id}: ${row.stdout}${row.stderr}`);
      assert.match(row.stdout,/ERR_ASSERTION|AssertionError/);
    } finally {fs.writeFileSync(file,originals.get(file));}
  }
  const restored=await observe(nodeCommand('--test',path.join(repo,'tools/evals/test/selection-accounting.test.mjs')),repo);
  assert.equal(restored.exit,0,restored.stdout+restored.stderr);
  for(const [file,bytes] of originals)assert.deepEqual(fs.readFileSync(file),bytes);
  const evidence=path.join(repo,'evals/results/evidence/accounting-mutation-controls.json');
  fs.writeFileSync(evidence,JSON.stringify({kind:'Reversible accounting regression mutations; not quality acceptance',observations,restored,restored_sha256:Object.fromEntries([...originals].map(([file,bytes])=>[path.relative(repo,file),sha256(bytes)]))},null,2)+'\n');
  console.log(`Four denominator/member mutations rejected with exit 1; restored positive exit 0; ${evidence}`);
} finally {for(const [file,bytes] of originals)fs.writeFileSync(file,bytes);}

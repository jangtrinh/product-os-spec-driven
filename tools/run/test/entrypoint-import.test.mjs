import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const name of ['run','init','doctor']) test(`${name} can be imported from stdin without treating the stdin marker as a file`,()=>{
 const url=new URL(`../${name}.mjs`,import.meta.url).href;
 const r=spawnSync(process.execPath,['--input-type=module','-'],{input:`await import(${JSON.stringify(url)}); console.log('imported');`,encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);assert.equal(r.stdout,'imported\n');
});

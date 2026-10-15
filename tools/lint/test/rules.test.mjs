import { recordedControl } from '../recorded-controls.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const CLI=fileURLToPath(new URL('../lint.mjs',import.meta.url));
import { spawnSync } from 'node:child_process';
import { lintSpec } from '../index.mjs';
import { CONTROLS,EXAMPLE,plant,ruleCodes } from '../self-test.mjs';
const baseline=lintSpec(EXAMPLE);
for(const [index,[code,mutate,severity='error']] of CONTROLS.entries()) {
  test(`${code} positive valid full bundle`,()=>assert.equal(baseline.problems.list.some(p=>p.code===code),false,JSON.stringify(baseline.problems.list)));
  test(`${code} negative seeded defect`,()=>{const f=plant(t=>recordedControl(index,t));try{const r=lintSpec(f.root,f.options);assert.ok(r.problems.list.some(p=>p.code===code && p.severity===severity),JSON.stringify(r.problems.list));if(severity==='error')assert.notEqual(r.exitCode,0);}finally{f.cleanup();}});
}
test('every normative code has a negative control',()=>assert.deepEqual(ruleCodes().filter(c=>c!=='E-OPTION' && !CONTROLS.some(([code])=>code===c)),[]));
test('full fixture is green with >0 documents',()=>assert.equal(baseline.exitCode,0,JSON.stringify(baseline.problems.list)));
test('E-OPTION positive supported arguments',()=>assert.equal(spawnSync(process.execPath,[CLI,EXAMPLE,'--json']).status,0));
test('E-OPTION negative obsolete lenient flag',()=>{const r=spawnSync(process.execPath,[CLI,EXAMPLE,'--lenient','--json'],{encoding:'utf8'});assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).problems[0].code,'E-OPTION');});

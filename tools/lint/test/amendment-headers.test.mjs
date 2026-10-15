import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {plant} from '../self-test.mjs';
import {lintSpec} from '../index.mjs';

const canonical='| # | Change (already applied to body) | Affected ids | Source |';
const localized='| # | Thay đổi (đã áp dụng vào body) | Id bị ảnh hưởng | Nguồn |';
for(const header of [localized,...['#','Change (already applied to body)','Affected ids','Source'].map(name=>canonical.replace(name,'Renamed'))]) {
  test(`amendment structural headers reject ${header}`,()=>{
    const f=plant(()=>{}), file=path.join(f.root,'contract/FC-001.md');
    try {
      const original=fs.readFileSync(file,'utf8');
      assert.equal(lintSpec(f.root).exitCode,0);
      const mutated=original.replaceAll(canonical,header);
      assert.notEqual(mutated,original);
      fs.writeFileSync(file,mutated);
      const result=lintSpec(f.root);
      assert.equal(result.exitCode,1);
      const errors=result.problems.errors.filter(p=>p.code==='S-AMENDMENT-ROWS' && p.message.includes('noncanonical structural table headers'));
      assert.equal(errors.length,2);
      assert.ok(errors.every(p=>p.file==='contract/FC-001.md' && p.line>1));
      fs.writeFileSync(file,original);
      assert.equal(lintSpec(f.root).exitCode,0);
    } finally {f.cleanup();}
  });
}

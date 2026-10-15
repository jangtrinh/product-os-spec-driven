import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadExpected} from './expected-checks.mjs';
import {observe, nodeCommand} from './process-observation.mjs';

const repo=fileURLToPath(new URL('../../',import.meta.url));
const evidence=path.join(repo,'evals/results/evidence');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eval-planted-case-'));
try {
  const directory=path.join(temp,'baseline');
  fs.cpSync(path.join(repo,'evals/cases/baseline'),directory,{recursive:true});
  const file=path.join(directory,'expected.md'), data=loadExpected(file);
  data.must_have.push({file:'prd/prd.md',text:'PLANTED_UNMET_CLI_ITEM'});
  fs.writeFileSync(file,`\`\`\`eval-expectations\n${JSON.stringify(data)}\n\`\`\`\n`);
  const command=nodeCommand(path.join(repo,'tools/evals/run-evals.mjs'),'--fake','--cases-root',temp,'--case','baseline','--results',path.join(evidence,'planted-results'));
  const row=await observe(command,repo);
  fs.mkdirSync(evidence,{recursive:true});
  fs.writeFileSync(path.join(evidence,'planted-cli.json'),JSON.stringify(row,null,2)+'\n');
  assert.equal(row.exit,1,row.stdout+row.stderr);
  const resultPath=row.stdout.trim().split('; ').at(-1);
  assert.ok(resultPath,'CLI must persist its result');
  const result=JSON.parse(fs.readFileSync(resultPath,'utf8'));
  assert.ok(result.findings.some(item=>item.includes('must_have')));
  console.log(`RED as expected: planted unmet CLI item; observed exit ${row.exit}; ${resultPath}`);
} finally {fs.rmSync(temp,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const forbidden=['pc'+'p','v'+'sf','/Use'+'rs/','orca/'+'workspaces','~/'+'Products','Spec Driven '+'by Jang','Ask '+'P'+'CP','claude\\.ai/'+'(artifact|code)','plans/'+'reports','kong'+'ming'];
// Each exception names a file and the sha256 of one exact line, so the allowed text never appears in this file
// and edits elsewhere in the file do not move the entry.
const exception=(file,reason,sha256,phase)=>({file,reason,sha256,...(phase?{phase}:{})});
const lineHash=text=>createHash('sha256').update(text).digest('hex');
const allow=[
  exception('tools/lint/test/pipeline-skill-rules.test.mjs','legacy migration input','05075b124602b9f1457b02e8377bfc5d161d041810cba6ef06d1b4cbf954d59b'),
  exception('tools/lint/test/pipeline-skill-rules.test.mjs','legacy migration input','de5ed68b6eea5772817ae7310a5aa6d82ec41603a2ca016d445f1b322f5593ad'),
  exception('tools/lint/test/pipeline-skill-rules.test.mjs','legacy migration input','05ec736e5e9659c11ef498e1ff4abb0ec91097dfb956d452c97e99a70d5dd795'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','c07df2b73690bdd8374088cfb446d54fc0c93fb594c818718c7f6b1bbf266c89'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','3d6c38ac43e594ca72b8ab733d507c83b1849fe45afbc626ed52e3786d30c9fe'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','5377ebaf38658e661c21ccb699071f4077124349116f0c6d06a31f0656b1cabf'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','84b62dba72ecf552e5e945c45be24af31fd1d8532cba8a5f24f4a3e4d9233fd4'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','e020c0a1181b70c37fe575b525b092f5f92bfe208ed0f904613b65f65f269b71'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','0762afa8db7e5834b9c7b3f696bdd92222408a471de5ecd1e8a7a6859e7c681b'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','7218cd67313b0ef017e7c36f575f5204a286b0b96e56633b776f4f5afea2c80d'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','50b7fbd5f02978c68e245e11ba6d673b12dd7344bc683861474f1ec94c15e948'),
  exception('tools/run/test/project-upgrade.test.mjs','legacy migration input','3f6223d2745ef7f0414bc3f121ba9676d9c64eb11388734852b992cf827c78be'),
  exception('tools/run/test/fixtures/grok-structured-review.ndjson','encoded fixture false positive','a168bd10ab32e188c6215602eb78735ce62644718d358d5447089319246a45ec'),
];

test('tracked public kit content contains no retired product or machine-specific text',()=>{
  const used=new Set();
  const failures=[];
  const files=execFileSync('git',['ls-files'],{cwd:root,encoding:'utf8'}).trim().split('\n');
  for(const file of files){
    if(file.startsWith('reference/'))continue;
    const absolute=path.join(root,file);
    if(!fs.existsSync(absolute))continue;
    const bytes=fs.readFileSync(absolute);
    // Binary files (git's heuristic: a NUL byte in the first 8000 bytes) carry no readable text to check.
    if(bytes.subarray(0,8000).includes(0))continue;
    const lines=bytes.toString('utf8').split(/\r?\n/);
    for(const [index,line] of lines.entries())for(const term of forbidden){
      if(!new RegExp(term,'i').test(line))continue;
      const exception=allow.find(entry=>entry.file===file&&entry.sha256===lineHash(line));
      if(exception){used.add(exception);continue;}
      failures.push(`${file}:${index+1}: ${term}`);
    }
  }
  const stale=allow.filter(entry=>!used.has(entry));
  assert.deepEqual(stale,[],`stale hygiene exceptions:\n${stale.map(entry=>`${entry.file} ${entry.sha256}`).join('\n')}`);
  assert.deepEqual(failures,[],failures.join('\n'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { splitFrontMatter } from '../../lib/front-matter.mjs';
import { diagnosticLines } from '../diagnostic-locations.mjs';
import { migrate } from '../v1-to-v2.mjs';
import { traceDefects } from '../source-defects.mjs';
function fixture(t,{raw,converted=raw,problems,lineMap}){
 const doc={lines:raw.split('\n'),original:splitFrontMatter(raw),converted:splitFrontMatter(converted),map:lineMap};
 return {defects:problems.map(p=>{const locations=diagnosticLines(p,doc);return {attribution:locations.length===1?'EXACT':'AMBIGUOUS',source:locations.length===1?{line:locations[0]}:{candidates:locations.map(line=>({line}))}};})};
}
const p=(line,code='D-PERSON',message='Approver must be an email or role')=>({file:'note.md',line,code,message,severity:'error'});
const fm='---\nid: source-note\ntype: note\ntitle: Note\nupdated: 2026-10-06\n---\n';
test('repeated diagnostics bind to their own original occurrence',t=>{
 const raw=fm+'| Label | Approver |\n|---|---|\n| first | 3 |\n| second | 5 |\n';
 const result=fixture(t,{raw,problems:[p(9),p(10)]});
 assert.deepEqual(result.defects.map(d=>d.source.line),[9,10]);
});
test('ambiguous diagnostic locations retain all source candidates',t=>{
 const raw=fm+'| ID | Change | Affected | Source |\n|---|---|---|---|\n| A01-01 | first | SC-06 | owner |\n| A02-01 | second | SC-06 | owner |\n';
 const result=fixture(t,{raw,problems:[p(2,'S-AMENDMENT-ROWS','affected reference does not resolve: SC-06')]});
 assert.equal(result.defects[0].attribution,'AMBIGUOUS');assert.deepEqual(result.defects[0].source.candidates.map(c=>c.line),[9,10]);
});
test('global table diagnostics cite the defective table rather than body start',t=>{
 const raw=fm.replace('type: note','type: prd')+'Intro\n\n| ID | Other | Source |\n|---|---|---|\n| REQ-01 | content | request |\n';
 const result=fixture(t,{raw,problems:[p(7,'S-PRD-REQ','REQ table needs ID, Requirement, Source and complete rows')]});
 assert.equal(result.defects[0].source.line,9);
});
test('screen diagnostics cite the declaration field',t=>{
 const raw=fm.replace('---\n', '---\n')+'Intro\n';
 const withScreen=raw.replace('updated:','screens: [S01-a]\nupdated:');
 const result=fixture(t,{raw:withScreen,problems:[p(8,'S-SCREEN','screen S01-a has no inventory or contract')]});
 assert.equal(result.defects[0].source.line,5);
});
test('changelog diagnostics cite actual change-log section',t=>{
 const raw=fm+'Intro\n\n## 10. Change log\n| Revision | Date | Change | Approver |\n|---|---|---|---|\n| 1 | 06/10 | amendment | Owner |\n';
 const result=fixture(t,{raw,problems:[p(7,'S-CHANGELOG','contract has amendments but no change log table')]});
 assert.ok([9,10].includes(result.defects[0].source.line)||result.defects[0].source.candidates?.some(c=>c.line===9));
});
test('index diagnostics cite actual story-table rows',t=>{
 const raw=fm+'Intro\n\n| Story | REQ |\n|---|---|\n| US-01 | REQ-01 |\n';
 const result=fixture(t,{raw,problems:[p(7,'S-US-INDEX','index story set or REQ association differs from stories')]});
 assert.equal(result.defects[0].source.line,11);
});

test('scenario ranges reproduce missing associations from actual source lint',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scenario-trace-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'),out=path.join(dir,'out');fs.mkdirSync(source);
 fs.writeFileSync(path.join(source,'spec.manifest.json'),JSON.stringify({format:'1',title:'Range',artifacts:[{id:'notes',n:1,name:'Notes',folder:'notes'}]}));
 fs.writeFileSync(path.join(source,'note.md'),fm.replace('id: source-note','id: US-01').replace('type: note','type: us')+'- Merged scenarios: SCN-08-01..SCN-08-09\n');
 migrate(source,out);const result=traceDefects(source,out),defect=result.defects.find(d=>d.code==='S-SCN-AC'&&d.message.startsWith('SCN-08-05 '));
 assert.equal(defect.source.line,7);assert.equal(defect.classification,'pre-existing-source-invariant');
});

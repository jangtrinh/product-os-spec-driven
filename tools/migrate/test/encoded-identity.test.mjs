import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { migrate } from '../v1-to-v2.mjs';
import { verify } from '../verify-output.mjs';
import { lintSpec } from '../../lint/index.mjs';
import { traceDefects } from '../source-defects.mjs';
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migration-boundary-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'),out=path.join(dir,'out');fs.mkdirSync(path.join(source,'notes'),{recursive:true});
 fs.writeFileSync(path.join(source,'notes/context.md'),'---\nid: context-note\ntype: note\ntitle: Context\nupdated: 2026-10-06\n---\nSource context.\n');
 fs.writeFileSync(path.join(source,'spec.manifest.json'),JSON.stringify({format:'1',title:'Boundary',artifacts:[{id:'notes',n:1,name:'Notes',folder:'notes'}]}));
 fs.writeFileSync(path.join(source,'note.md'),'---\nid: authority-note\ntype: note\ntitle: Authorities\nupdated: 2026-10-06\n---\n| Item | Approver |\n|---|---|\n| existing-invalid | controller |\n| valid-source | PO |\n');
 return {dir,source,out};
}
for(const [rel,raw] of [
 ['board.js',String.raw`globalThis.screen = '\u0053CR-PUB-01';`],
 ['board.mjs',String.raw`globalThis.screen = `+'`'+String.raw`\u0053CR-PUB-01`+'`;'],
 ['board.ts',String.raw`globalThis.screen = "\x53CR-PUB-01";`],
 ['board.html',String.raw`<script>globalThis.screen = '\u{53}CR-PUB-01';</script>`],
 ['board.js','globalThis.screen = "SCR-PUB-01";']
 ,['board.js',String.raw`globalThis.screen = '\123CR-PUB-01';`]
 ,['board.js',"globalThis.screen = 'SCR-PUB-\\\n01';"]
])test(`executable legacy identity refuses before export: ${rel} ${raw}`,t=>{
 const {source,out}=setup(t);fs.writeFileSync(path.join(source,rel),raw);
 assert.throws(()=>migrate(source,out),/EXECUTABLE-LEGACY-ID/);assert.equal(fs.existsSync(out),false);assert.equal(fs.readFileSync(path.join(source,rel),'utf8'),raw);
});
test('checker independently rejects a planted escaped executable identity',t=>{
 const {source,out}=setup(t);migrate(source,out);fs.writeFileSync(path.join(out,'extra.js'),String.raw`globalThis.screen = '\u0053CR-PUB-01';`);
 assert.ok(verify(source,out).failures.some(f=>/EXECUTABLE-LEGACY-ID.*extra.js/.test(f)));
});
test('executable asset without legacy identities remains byte-identical',t=>{
 const {source,out}=setup(t),raw=String.raw`globalThis.screen = '\u0053CR-01';`;fs.writeFileSync(path.join(source,'board.js'),raw);migrate(source,out);
 assert.equal(fs.readFileSync(path.join(out,'board.js'),'utf8'),raw);
});
for(const [name,rel,raw] of [
 ['JSON value','records.json','{"screen":"\\u0053CR-PUB-01"}'],
 ['JSON key','records.json','{"\\u0053CR-PUB-01":"Legacy obligation"}'],
 ['JSON entity','records.json','{"screen":"&#x53;CR-PUB-01"}'],
 ['JSON escaped entity','records.json','{"screen":"\\u0026#83;CR-PUB-01"}'],
 ['HTML decimal entity','board.html','<div id="&#83;CR-PUB-01">Source</div>'],
 ['HTML hex entity','board.html','<div id="SCR&#x2d;PUB-01">Source</div>'],
 ['embedded JSON','board.html','<script type="application/json">{"screen":"\\u0053CR-PUB-01"}</script>'],
 ['Markdown JSON literal','payload.md','---\nid: payload-note\ntype: note\ntitle: Payload\nupdated: 2026-10-06\n---\n{"screen":"\\u0053CR-PUB-01"}'],
 ['HTML named entity','board.html','<div id="SCR&hyphen;PUB-01">Source</div>']
])test(`encoded legacy identity in ${name} is crosswalked or refused before raw export`,t=>{
 const {source,out}=setup(t);fs.writeFileSync(path.join(source,rel),raw);
 let result;try{result=migrate(source,out);}catch(e){assert.match(e.message,/encoded legacy identity/);assert.equal(fs.existsSync(out),false);return;}
 assert.ok(result.report.blockers.some(b=>/encoded|identity/i.test(b.reason)),JSON.stringify(result.report.blockers));
 assert.notEqual(result.exit,0);
});
test('checker decodes escaped output aliases even with no crosswalk',t=>{
 const {source,out}=setup(t);migrate(source,out);
 fs.writeFileSync(path.join(out,'extra.json'),'{"\\u0053CR-PUB-01":"source obligation"}');
 const checked=verify(source,out);assert.equal(checked.ok,false);assert.ok(checked.failures.some(f=>/unexpected legacy identity.*extra.json/.test(f)));
});
test('checker decodes entity-encoded output aliases',t=>{
 const {source,out}=setup(t);migrate(source,out);
 fs.writeFileSync(path.join(out,'extra.html'),'<div id="SCR&hyphen;PUB-01">source obligation</div>');
 assert.ok(verify(source,out).failures.some(f=>/unexpected legacy identity.*extra.html/.test(f)));
});
test('actual output-only lint occurrence is converter-induced and the attribution CLI fails',t=>{
 const {dir,source,out}=setup(t);migrate(source,out);
 const file=path.join(out,'note.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('| valid-source | PO |','| valid-source | controller |'));
 const lint=lintSpec(out);fs.writeFileSync(path.join(out,'provenance/lint-result.json'),JSON.stringify({problems:lint.problems.list}));
 const baseline=path.join(dir,'baseline.json');fs.writeFileSync(baseline,JSON.stringify({problems:[{file:'note.md',line:9,code:'D-PERSON',message:'Approver must be an email or role',severity:'error'}]}));
 const result=traceDefects(source,out,baseline),person=result.defects.filter(d=>d.code==='D-PERSON');
 assert.equal(person.find(d=>d.source.line===9).classification,'pre-existing-source-invariant');
 assert.equal(person.find(d=>d.source.line===10).classification,'CONVERTER-INDUCED');
 assert.equal(result.converter_induced_errors,1);
 assert.ok(verify(source,out).failures.some(f=>f.startsWith('CONVERTER-INDUCED lint diagnostic: D-PERSON')));
 const cli=spawnSync(process.execPath,['tools/migrate/source-defects.mjs',source,out,baseline],{encoding:'utf8'});
 assert.equal(cli.status,1,cli.stdout+cli.stderr);
});
test('forged baseline cannot certify a valid source occurrence',t=>{
 const {dir,source,out}=setup(t);migrate(source,out);
 const file=path.join(out,'note.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('| valid-source | PO |','| valid-source | controller |'));
 fs.writeFileSync(path.join(out,'provenance/lint-result.json'),JSON.stringify({problems:lintSpec(out).problems.list}));
 const baseline=path.join(dir,'forged.json');fs.writeFileSync(baseline,fs.readFileSync(path.join(out,'provenance/lint-result.json')));
 assert.equal(traceDefects(source,out,baseline).converter_induced_errors,1);
});
test('duplicate authority cells on one line cannot reuse one source diagnostic',t=>{
 const {source,out}=setup(t),file=path.join(source,'note.md');
 fs.writeFileSync(file,'---\nid: authority-note\ntype: note\ntitle: Authorities\nupdated: 2026-10-06\n---\n| Item | Approver | Approver |\n|---|---|---|\n| same-row | controller | PO |\n');
 migrate(source,out);fs.writeFileSync(path.join(out,'note.md'),fs.readFileSync(path.join(out,'note.md'),'utf8').replace('| controller | PO |','| controller | controller |'));
 const result=traceDefects(source,out);assert.equal(result.converter_induced_errors,1);
 assert.equal(result.defects.filter(d=>d.code==='D-PERSON'&&d.classification==='CONVERTER-INDUCED').length,1);
});
test('scenario schema defects stay bound to their owning identity on a shared source line',t=>{
 const {source,out}=setup(t),file=path.join(source,'note.md');
 fs.writeFileSync(file,'---\nid: US-01\ntype: us\ntitle: Associations\nupdated: 2026-10-06\nreq: [REQ-01]\nscenarios: [SCN-01-01, SCN-01-02]\n---\n## 4. Acceptance criteria\n| ID | Given | When | Then | Scenario |\n|---|---|---|---|---|\n| AC-01 | Given | When | Then | SCN-01-01 |\n');
 migrate(source,out);const current=fs.readFileSync(path.join(out,'note.md'),'utf8');
 const line=current.split('\n').find(l=>l.startsWith('scenarios:')),scenarios=JSON.parse(line.slice('scenarios:'.length));
 scenarios[0].ac=[];scenarios[1].ac=['AC-01'];fs.writeFileSync(path.join(out,'note.md'),current.replace(line,'scenarios: '+JSON.stringify(scenarios)));
 const result=traceDefects(source,out),schema=result.defects.filter(d=>d.code==='S-SCN-SCHEMA');
 assert.ok(schema.some(d=>d.classification==='CONVERTER-INDUCED'&&d.proof.occurrence_scope==='SCN-01-01'),JSON.stringify({schema,all:result.defects.filter(d=>d.code==='S-SCN-AC')}));
});
test('output-only schema errors are converter-induced even without a source locator',t=>{
 const {source,out}=setup(t);migrate(source,out);
 const file=path.join(out,'note.md'),lines=fs.readFileSync(file,'utf8').split('\n');lines.splice(5,0,'mystery: true');fs.writeFileSync(file,lines.join('\n'));
 const mapFile=path.join(out,'provenance/source-line-map.json'),map=JSON.parse(fs.readFileSync(mapFile));map.documents['note.md'].splice(5,0,null);fs.writeFileSync(mapFile,JSON.stringify(map));
 const result=traceDefects(source,out),added=result.defects.find(d=>d.code==='D-FRONTMATTER-SCHEMA'&&d.message.includes('mystery'));
 assert.equal(added.classification,'CONVERTER-INDUCED');assert.equal(result.converter_induced_errors,1);
});

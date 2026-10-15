import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { migrate } from '../v1-to-v2.mjs';
import { traceDefects } from '../source-defects.mjs';
import { sourceLintProjection } from '../source-lint-projection.mjs';
import { normalizeHeaders } from '../document-transform.mjs';
import { parseTables } from '../../lib/md.mjs';
function setup(t,header,row){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'declared-columns-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'),out=path.join(dir,'out');fs.mkdirSync(path.join(source,'prd'),{recursive:true});
 fs.writeFileSync(path.join(source,'spec.manifest.json'),JSON.stringify({format:'1',title:'Requirements',artifacts:[{id:'prd',n:1,name:'Requirements',folder:'prd'}]}));
 fs.writeFileSync(path.join(source,'prd/requirements.md'),'---\nid: requirements\ntype: prd\ntitle: Requirements\nupdated: 2026-10-06\n---\n| '+header.join(' | ')+' |\n| '+header.map(()=>'---').join(' | ')+' |\n| '+row.join(' | ')+' |\n');
 return {source,out};
}
test('declared REQ Source moves with its cells; unexpected Approver is preserved and reported',t=>{
 const {source,out}=setup(t,['ID','Requirement','Approver','Source'],['REQ-01','Read a page','controller','Owner request']);
 const before=sourceLintProjection(source);assert.ok(before.problems.some(p=>p.code==='S-PRD-REQ'));assert.ok(before.problems.some(p=>p.code==='D-PERSON'));
 const result=migrate(source,out),table=parseTables(fs.readFileSync(path.join(out,'prd/requirements.md'),'utf8'))[0];
 assert.deepEqual(table.header,['ID','Requirement','Source','Approver']);assert.deepEqual(table.rows[0],['REQ-01','Read a page','Owner request','controller']);
 assert.ok(result.report.blockers.some(b=>b.code==='SOURCE-TABLE-COLUMN'&&b.column==='Approver'));assert.equal(result.exit,1);
 const trace=traceDefects(source,out);assert.equal(trace.converter_induced_errors,0);
 assert.ok(trace.defects.some(d=>d.code==='D-PERSON'&&d.classification==='pre-existing-source-invariant'));
 assert.ok(trace.defects.some(d=>d.code==='S-PRD-REQ'&&d.disposition==='absent-from-output'&&d.source.line===7));
 assert.ok(trace.removed_source_defect_errors>=1);
});
test('source-only authority defect remains in attribution after an output header removes it',t=>{
 const {source,out}=setup(t,['ID','Requirement','Source','Approver'],['REQ-01','Read a page','Owner request','controller']);migrate(source,out);
 const file=path.join(out,'prd/requirements.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('| Source | Approver |','| Source | Commentary |'));
 const trace=traceDefects(source,out),defect=trace.defects.find(d=>d.code==='D-PERSON');
 assert.ok(defect);assert.equal(defect.disposition,'absent-from-output');assert.equal(defect.source.line,9);assert.equal(defect.classification,'pre-existing-source-invariant');
});
for(const [name,header,row,expected] of [
 ['REQ',['ID','Source','Requirement'],['REQ-01','request','Read a page'],['ID','Requirement','Source']],
 ['REQ with displaced identity',['Source','Requirement','ID'],['request','Read a page','REQ-01'],['ID','Requirement','Source']],
 ['amendment',['#','Source','Change','Affected ids'],['A01-01','owner','Read a page','US-01'],['#','Change (already applied to body)','Affected ids','Source']],
 ['decision',['Id','Detail','Decision'],['D1','owner request','Read a page'],['Id','Decision','Detail']]
])test(`${name} normalization follows declared headers, including reordered cells`,()=>{
 const doc={rel:'table.md',bodyLine:7,data:{ledger:true},body:'| '+header.join(' | ')+' |\n| '+header.map(()=>'---').join(' | ')+' |\n| '+row.join(' | ')+' |'},report={renames:[],blockers:[]};
 normalizeHeaders(doc,report);const table=parseTables(doc.body)[0];assert.deepEqual(table.header,expected);
 for(const label of ['Source','Requirement','Decision','Detail','Affected ids'])if(header.includes(label)&&expected.includes(label))assert.equal(table.rows[0][expected.indexOf(label)],row[header.indexOf(label)]);
});
for(const [kind,header,row]of [
 ['amendment',['#','Change','Approver','Affected ids','Source'],['A01-01','Read a page','controller','US-01','Owner request']],
 ['decision',['Id','Decision','Approver','Detail'],['D1','Read a page','controller','Owner request']]
])test(`${kind} unexpected columns retain meaning instead of supplying required fields`,()=>{
 const doc={rel:'table.md',bodyLine:7,data:{ledger:true},body:'| '+header.join(' | ')+' |\n| '+header.map(()=>'---').join(' | ')+' |\n| '+row.join(' | ')+' |'},report={renames:[],blockers:[]};normalizeHeaders(doc,report);
 const table=parseTables(doc.body)[0];assert.equal(table.rows[0][table.header.indexOf('Approver')],'controller');assert.ok(report.blockers.some(b=>b.code==='SOURCE-TABLE-COLUMN'&&b.column==='Approver'));
});
for(const header of [['ID','Requirement','Approver'],['ID','Requirement','Source','Source']])test(`ambiguous REQ layout is retained and reported: ${header.join('/')}`,t=>{
 const row=header.map((_,i)=>['REQ-01','Read a page','controller','request'][i]),{source,out}=setup(t,header,row),result=migrate(source,out);
 const table=parseTables(fs.readFileSync(path.join(out,'prd/requirements.md'),'utf8'))[0];assert.deepEqual(table.header,header);assert.deepEqual(table.rows[0],row);
 assert.ok(result.report.blockers.some(b=>b.code==='SOURCE-TABLE-SHAPE'));assert.equal(result.exit,1);
});

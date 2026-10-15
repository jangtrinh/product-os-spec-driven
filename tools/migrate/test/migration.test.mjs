import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeHeaders } from '../document-transform.mjs';
const cli=path.resolve('tools/migrate/v1-to-v2.mjs');
test('extra amendment columns retain the actual source authority under its header',()=>{const doc={rel:'contract/source.md',data:{type:'contract'},bodyLine:1,body:'| # | Change | Local ids | Upstream ids | Source |\n|---|---|---|---|---|\n| A01-01 | Exact behavior | AC-01 | FR-01 | Owner decision |'},report={renames:[]};normalizeHeaders(doc,report);assert.match(doc.body,/\| A01-01 \| Exact behavior \| AC-01 \| Owner decision \| FR-01 \|/);assert.match(doc.body,/\| # \| Change \(already applied to body\) \| Affected ids \| Source \| Upstream ids \|/);});
const story=`---\nid: US-01\ntype: us\ntitle: Read\nupdated: 2026-10-06\nepic: Reading\ntrace: {req: [REQ-01]}\nscenarios: [SCN-01-01]\n---\n## 1. User Story\nAs a reader, read a page.\n## 2. Flow\n\`\`\`mermaid\nflowchart LR\nA[Open] --> B[Read]\n\`\`\`\n## 3. Data and rules\nRead the page.\n## 4. Acceptance Criteria\n| ID | Given / When | Then | Scenario |\n|---|---|---|---|\n| AC-01 | Open page | Page visible | SCN-01-01 |\n## 5. Edge cases\nMissing page shows absence.\n## 6. UI\nSource absent.\n`;
function setup(t,text=story){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spec-migrate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const source=path.join(dir,'in');fs.mkdirSync(path.join(source,'us'),{recursive:true});fs.mkdirSync(path.join(source,'prd'));fs.writeFileSync(path.join(source,'spec.manifest.json'),JSON.stringify({format:'1',title:'Reader',artifacts:[{id:'us',n:1,name:'Stories',folder:'us'},{id:'prd',n:2,name:'Requirements',folder:'prd'}]}));fs.writeFileSync(path.join(source,'us/US-01.md'),text);fs.writeFileSync(path.join(source,'prd/requirements.md'),'---\nid: requirements\ntype: prd\ntitle: Requirements\nupdated: 2026-10-06\n---\n| ID | Requirement | Source |\n|---|---|---|\n| REQ-01 | Read a page | Owner request |\n');return {dir,source};}
const run=(source,out,...args)=>spawnSync(process.execPath,[cli,source,'--out',out,...args],{encoding:'utf8'});
test('determinism, input bytes and counted warnings',t=>{const {dir,source}=setup(t);const before=fs.readFileSync(path.join(source,'us/US-01.md'));const a=run(source,path.join(dir,'a')),b=run(source,path.join(dir,'b'));assert.equal(a.status,0,a.stderr+a.stdout);assert.equal(b.status,0,b.stderr+b.stdout);assert.deepEqual(fs.readFileSync(path.join(source,'us/US-01.md')),before);assert.deepEqual(fs.readFileSync(path.join(dir,'a/migration-report.json')),fs.readFileSync(path.join(dir,'b/migration-report.json')));const report=JSON.parse(fs.readFileSync(path.join(dir,'a/migration-report.json')));assert.equal(report.lint.errors,0);assert.equal(report.lint.warnings['W-SCN-UNASSIGNED'],1);assert.equal(report.lint.warnings['W-UI-CONTRACT-LEGACY'],1);});
test('refuses nonempty output without overwriting',t=>{const {dir,source}=setup(t);const out=path.join(dir,'out');fs.mkdirSync(out);fs.writeFileSync(path.join(out,'keep'),'original');assert.notEqual(run(source,out).status,0);assert.equal(fs.readFileSync(path.join(out,'keep'),'utf8'),'original');});
test('refuses output equal to or contained by input',t=>{const {source}=setup(t);assert.notEqual(run(source,source).status,0);assert.notEqual(run(source,path.join(source,'child')).status,0);assert.equal(fs.existsSync(path.join(source,'child')),false);});
test('missing explicit scenario association is a refusal',t=>{const {dir,source}=setup(t,story.replace('scenarios: [SCN-01-01]','scenarios: [SCN-01-01, SCN-01-02]'));const r=run(source,path.join(dir,'out'));assert.equal(r.status,1);assert.match(fs.readFileSync(path.join(dir,'out/migration-report.json'),'utf8'),/SCENARIO-UNMAPPED/);});
test('missing images stay missing; never substituted',t=>{const {dir,source}=setup(t,story+'\n![Missing](../assets/missing.png)\n');assert.equal(run(source,path.join(dir,'out')).status,1);const body=fs.readFileSync(path.join(dir,'out/us/US-01.md'),'utf8');assert.match(body,/assets\/missing.png/);assert.equal(fs.existsSync(path.join(dir,'out/assets/missing.png')),false);});
test('text-only flows are not invented',t=>{const {dir,source}=setup(t,story.replace(/```mermaid[\s\S]*?```/,'Open → Read.'));assert.equal(run(source,path.join(dir,'out')).status,1);assert.doesNotMatch(fs.readFileSync(path.join(dir,'out/us/US-01.md'),'utf8'),/```mermaid/);});
test('outside symlinks refuse before output mutation',t=>{const {dir,source}=setup(t);fs.symlinkSync(path.join(dir,'outside'),path.join(source,'escape'));assert.notEqual(run(source,path.join(dir,'out')).status,0);assert.equal(fs.existsSync(path.join(dir,'out')),false);});
const adverse=JSON.parse(fs.readFileSync('fixtures/migrate/adverse-cases.json','utf8'));
for(const [name,fixture]of Object.entries(adverse))test(`adverse source retained: ${name}`,t=>{
 const text=fixture.replace?story.replace(...fixture.replace):story+(fixture.append||'');const {dir,source}=setup(t,text);
 for(const [rel,value]of Object.entries(fixture.extra||{})){fs.mkdirSync(path.dirname(path.join(source,rel)),{recursive:true});fs.writeFileSync(path.join(source,rel),JSON.stringify(value));}
 const out=path.join(dir,'out'),r=run(source,out);assert.notEqual(r.status,2,r.stderr);
 const report=JSON.parse(fs.readFileSync(path.join(out,'migration-report.json')));
 if(fixture.lint){assert.equal(r.status,1);const lint=JSON.parse(fs.readFileSync(path.join(out,'provenance/lint-result.json')));assert.ok(lint.problems.some(p=>p.code===fixture.lint));}
 if(fixture.blocker){assert.equal(r.status,1);assert.ok(report.blockers.some(p=>p.code===fixture.blocker));}
 if(fixture.locale)assert.ok(fs.readFileSync(path.join(out,'us/US-01.md'),'utf8').includes(fixture.locale));
 for(const rel of Object.keys(fixture.extra||{})){if(fixture.extra[rel].freshness==='CURRENT')assert.equal(JSON.parse(fs.readFileSync(path.join(out,rel))).freshness,'STALE');else assert.deepEqual(fs.readFileSync(path.join(out,rel)),fs.readFileSync(path.join(source,rel)));assert.deepEqual(fs.readFileSync(path.join(out,'provenance/input-snapshot',rel+'.txt')),fs.readFileSync(path.join(source,rel)));}
 if(fixture.history)assert.ok(report.unverified_inputs.some(x=>Object.keys(fixture.extra).includes(x.file)));
 if(fixture.unverified){assert.equal(r.status,1);assert.ok(report.blockers.some(p=>p.code==='UNVERIFIED-INVENTORY'));}
});
test('denied asset remains denied and fails lint',t=>{const {dir,source}=setup(t,story+'\n![Old](../assets/denied.png)\n');fs.mkdirSync(path.join(source,'assets'));fs.writeFileSync(path.join(source,'assets/denied.png'),'real source bytes');const file=path.join(source,'spec.manifest.json'),m=JSON.parse(fs.readFileSync(file));m.images={deny:['assets/denied.png']};fs.writeFileSync(file,JSON.stringify(m));const out=path.join(dir,'out');assert.equal(run(source,out).status,1);assert.ok(JSON.parse(fs.readFileSync(path.join(out,'provenance/lint-result.json'))).problems.some(p=>p.code==='L-IMG-DENIED'));assert.equal(fs.readFileSync(path.join(out,'assets/denied.png'),'utf8'),'real source bytes');});
test('reused scenario labels retain distinct owning associations',t=>{const {dir,source}=setup(t);fs.writeFileSync(path.join(source,'us/US-02.md'),story.replace('id: US-01','id: US-02'));const out=path.join(dir,'out');assert.equal(run(source,out).status,0);for(const id of ['US-01','US-02'])assert.match(fs.readFileSync(path.join(out,'us/'+id+'.md'),'utf8'),/SCN-01-01/);});
test('legacy scenario crosswalk uses explicit owning AC and canonical ids',t=>{const {dir,source}=setup(t,story.replaceAll('SCN-01-01','SCN-PUB-01-01'));const out=path.join(dir,'out');assert.equal(run(source,out).status,0);const c=JSON.parse(fs.readFileSync(path.join(out,'provenance/id-crosswalk.json')));assert.equal(c.rows[0].owner,'US-01');assert.equal(c.rows[0].canonical_id,'US-01.SCN-01-01');assert.doesNotMatch(fs.readFileSync(path.join(out,'us/US-01.md'),'utf8'),/SCN-PUB-/);const ledger=JSON.parse(fs.readFileSync(path.join(out,'provenance/source-ledger.json')));assert.ok(ledger.items.some(x=>x.id===c.rows[0].id&&x.crosswalk_row===c.rows[0].id));});
test('legacy ownership collision fails without collapsing either story',t=>{const {dir,source}=setup(t,story.replaceAll('SCN-01-01','SCN-PUB-01-01'));fs.writeFileSync(path.join(source,'us/US-02.md'),story.replace('id: US-01','id: US-02').replaceAll('SCN-01-01','SCN-PUB-01-01'));const out=path.join(dir,'out');assert.equal(run(source,out).status,1);const r=JSON.parse(fs.readFileSync(path.join(out,'migration-report.json')));assert.ok(r.blockers.some(p=>p.code==='CROSSWALK-OWNER'));assert.equal(r.counts.out.stories,2);});
test('generated report collisions refuse before writing output',t=>{const {dir,source}=setup(t);fs.writeFileSync(path.join(source,'migration-report.json'),'original');assert.equal(run(source,path.join(dir,'out')).status,2);assert.equal(fs.existsSync(path.join(dir,'out')),false);});
test('owner mapping refuses a stale source hash before output',t=>{const {dir,source}=setup(t);const file=path.join(dir,'map.json');fs.writeFileSync(file,JSON.stringify({version:1,source_sha256:'0'.repeat(64),mappings:[]}));const out=path.join(dir,'out');assert.equal(run(source,out,'--owner-map',file).status,2);assert.equal(fs.existsSync(out),false);});
test('historical gate model is archived and cannot establish current approval',t=>{const {dir,source}=setup(t);const file=path.join(source,'spec.manifest.json'),value=JSON.parse(fs.readFileSync(file));value.gate_model={records:{receipts:[{freshness:'CURRENT',verdict:'PASS'}]}};fs.writeFileSync(file,JSON.stringify(value));const out=path.join(dir,'out');assert.equal(run(source,out).status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'spec.manifest.json'))).gate_model,undefined);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'provenance/input-snapshot/spec.manifest.json.txt'))).gate_model,value.gate_model);});
test('raw board snapshot bytes do not introduce unmatched visible board assets',t=>{const {dir,source}=setup(t);const file=path.join(source,'ux/wireframes/png/W-01-home.png');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'source image bytes');const html=path.join(source,'ux/wireframes/html/W-01-home.html');fs.mkdirSync(path.dirname(html),{recursive:true});fs.writeFileSync(html,'<html>source board</html>');const out=path.join(dir,'out');assert.equal(run(source,out).status,0);assert.equal(fs.readFileSync(path.join(out,'provenance/input-snapshot/ux/wireframes/png/W-01-home.png.bin'),'utf8'),'source image bytes');});
test('generated hidden snapshot prefix collision refuses before output',t=>{const {dir,source}=setup(t);fs.mkdirSync(path.join(source,'provenance/input-snapshot'),{recursive:true});fs.writeFileSync(path.join(source,'provenance/input-snapshot/old'),'source');assert.equal(run(source,path.join(dir,'out')).status,2);assert.equal(fs.existsSync(path.join(dir,'out')),false);});
test('current history follows mechanical detail-row conversion; before text stays exact',t=>{
 const row='| SCN-01-01 | AC-01 | A page | Open page | Page visible | manual |';
 const {dir,source}=setup(t,story+'\n| Scenario | AC | Precondition / data | Steps | Expected | Method / evidence |\n|---|---|---|---|---|---|\n'+row+'\n');
 fs.mkdirSync(path.join(source,'decisions'));fs.writeFileSync(path.join(source,'decisions/ledger.md'),'---\nid: source-ledger\ntype: decisions\ntitle: Decisions\nupdated: 2026-10-06\nledger: true\n---\n| Id | Decision | Detail |\n|---|---|---|\n| D1 | Read | Owner request |\n');
 const mf=path.join(source,'spec.manifest.json'),m=JSON.parse(fs.readFileSync(mf));m.artifacts.push({id:'decisions',n:3,name:'Decisions',folder:'decisions'});m.changes={blocks:'changes/history.json'};fs.writeFileSync(mf,JSON.stringify(m));fs.mkdirSync(path.join(source,'changes'));
 const history={version:1,entries:[{id:'block-01',page:'us-01',date:'2026-10-06',kind:'row',before:'Exact earlier source wording',after:row,refs:['D1'],source:'us/US-01.md',previous_commit:'0'.repeat(40)}]};fs.writeFileSync(path.join(source,'changes/history.json'),JSON.stringify(history));
 const out=path.join(dir,'out'),r=run(source,out);assert.equal(r.status,0,r.stdout+r.stderr);const current=JSON.parse(fs.readFileSync(path.join(out,'changes/history.json'))).entries[0];assert.equal(current.before,history.entries[0].before);assert.match(current.after,/unassigned; historical source/);assert.ok(fs.readFileSync(path.join(out,'us/US-01.md'),'utf8').includes(current.after));
});
test('unresolved legacy ledger items keep C9 joins and refuse semantic completeness',t=>{const {dir,source}=setup(t,story.replaceAll('SCN-01-01','SCN-PUB-01-01'));fs.writeFileSync(path.join(source,'email.md'),'---\nid: email-source\ntype: note\ntitle: Pending owner\nupdated: 2026-10-06\n---\n| ID | Given | When | Then |\n|---|---|---|---|\n| EMAIL-07 | Form | Open | Source obligation |\n');const out=path.join(dir,'out');assert.equal(run(source,out).status,1);const report=JSON.parse(fs.readFileSync(path.join(out,'migration-report.json'))),pending=report.blockers.find(x=>x.code==='CROSSWALK-OWNER'),ledger=JSON.parse(fs.readFileSync(path.join(out,'provenance/source-ledger.json')));assert.equal(ledger.items.find(x=>x.id===pending.row)?.crosswalk_row,pending.row);assert.ok(report.blockers.some(x=>x.code==='SOURCE-LEDGER-CROSSWALK'&&x.row===pending.row));});
test('malformed known legacy numeric identity fails closed without prefix repair',t=>{const {dir,source}=setup(t);fs.writeFileSync(path.join(source,'email.md'),'---\nid: email-source\ntype: note\ntitle: Source identity\nupdated: 2026-10-06\n---\n| ID | Given | When | Then |\n|---|---|---|---|\n| EMAIL-7 | Form | Open | Source obligation |\n');const out=path.join(dir,'out');assert.equal(run(source,out).status,1);assert.ok(JSON.parse(fs.readFileSync(path.join(out,'migration-report.json'))).blockers.some(x=>x.code==='UNKNOWN-LEGACY-ID'));assert.match(fs.readFileSync(path.join(out,'provenance/input-snapshot/email.md.txt'),'utf8'),/EMAIL-7/);});
test('structured readable records use the same canonical crosswalk as Markdown',t=>{const {dir,source}=setup(t,story+'\nScreen SCR-PUB-01.\n');fs.mkdirSync(path.join(source,'provenance'));fs.writeFileSync(path.join(source,'provenance/readable-map.json'),JSON.stringify({screen:'SCR-PUB-01'}));const out=path.join(dir,'out');assert.equal(run(source,out).status,0);const map=JSON.parse(fs.readFileSync(path.join(out,'provenance/readable-map.json')));assert.match(map.screen,/^S\d{2}$/);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'provenance/input-snapshot/provenance/readable-map.json.txt'))).screen,'SCR-PUB-01');});
test('upstream source digest excludes id and bullet framing',t=>{
 const {dir,source}=setup(t,story+'\nScreen SCR-PUB-01.\n');
 fs.writeFileSync(path.join(source,'intake.md'),'---\nid: intake-source\ntype: note\ntitle: Intake\nupdated: 2026-10-06\n---\n- AC-001.1: Trang chủ hiển thị đúng thông điệp sản phẩm.\n');
 const out=path.join(dir,'out');assert.equal(run(source,out).status,0);
 const ledger=JSON.parse(fs.readFileSync(path.join(out,'provenance/source-ledger.json')));
 assert.equal(ledger.items.find(x=>x.id==='AC-001.1').text_sha256,'c52b38ecc8ff2144600d9c24e5d4edcee0fcd0e4b35c81f360ca103b26151904');
});
test('canonical JSON keys are reserved without dropping obligations',t=>{
 const {dir,source}=setup(t,story+'\nScreen SCR-PUB-01.\n');
 const value={S01:'Existing canonical obligation','SCR-PUB-01':'Distinct legacy obligation'};
 fs.writeFileSync(path.join(source,'records.json'),JSON.stringify(value));const out=path.join(dir,'out'),r=run(source,out);
 assert.equal(r.status,0,r.stdout+r.stderr);const records=JSON.parse(fs.readFileSync(path.join(out,'records.json')));
 assert.equal(Object.keys(records).length,2);assert.equal(records.S01,value.S01);assert.ok(Object.values(records).includes(value['SCR-PUB-01']));
});
test('JSON-only identity produces a canonical crosswalk and retained raw snapshot',t=>{
 const {dir,source}=setup(t);fs.writeFileSync(path.join(source,'records.json'),JSON.stringify({screen:'SCR-PUB-01'}));const out=path.join(dir,'out');
 assert.equal(run(source,out).status,0);assert.equal(fs.existsSync(path.join(out,'provenance/id-crosswalk.json')),true);
 assert.match(JSON.parse(fs.readFileSync(path.join(out,'records.json'))).screen,/^S\d{2}$/);
});
test('HTML-only identity is inventoried and blocks export while asset bytes stay exact',t=>{
 const {dir,source}=setup(t);const html='<div id="SCR-PUB-01">Source board</div>';fs.writeFileSync(path.join(source,'board.html'),html);const out=path.join(dir,'out');
 assert.equal(run(source,out).status,1);assert.ok(JSON.parse(fs.readFileSync(path.join(out,'provenance/id-crosswalk.json'))).rows.some(r=>r.legacy_id==='SCR-PUB-01'));
 assert.equal(fs.readFileSync(path.join(out,'board.html'),'utf8'),html);assert.ok(JSON.parse(fs.readFileSync(path.join(out,'migration-report.json'))).blockers.some(b=>b.code==='UNREWRITTEN-ASSET-ID'));
});
test('rewritten key collision refuses even with a supplied conflicting allocation',async()=>{
 const {rewriteRecordIds}=await import('../id-crosswalk.mjs');
 const crosswalk={rows:[{id:'CW-001',legacy_id:'SCR-PUB-01',canonical_kind:'screen-state',canonical_id:'S01'}]};
 assert.throws(()=>rewriteRecordIds({S01:'canonical','SCR-PUB-01':'legacy'},'records.json',crosswalk,{renames:[]}),/key collision/);
 assert.throws(()=>rewriteRecordIds({'SCR-PUB-01':'legacy',S01:'canonical'},'records.json',crosswalk,{renames:[]}),/key collision/);
});
test('preservation checker rejects legacy exports even when crosswalk is absent',async t=>{
 const {verify}=await import('../verify-output.mjs');const {dir,source}=setup(t);fs.writeFileSync(path.join(source,'records.json'),JSON.stringify({screen:'SCR-PUB-01'}));const out=path.join(dir,'out');assert.equal(run(source,out).status,0);
 fs.rmSync(path.join(out,'provenance/id-crosswalk.json'));fs.writeFileSync(path.join(out,'records.json'),JSON.stringify({screen:'SCR-PUB-01'}));
 const result=verify(source,out);assert.equal(result.ok,false);assert.ok(result.failures.some(f=>/legacy identity|crosswalk/.test(f)));
});
test('independent preservation checker validates extracted-text digests and active JSON records',async t=>{
 const {verify}=await import('../verify-output.mjs');const {dir,source}=setup(t,story+'\nScreen SCR-PUB-01.\n');
 fs.writeFileSync(path.join(source,'records.json'),JSON.stringify({S01:'canonical','SCR-PUB-01':'legacy'}));const out=path.join(dir,'out');assert.equal(run(source,out).status,0);
 assert.equal(verify(source,out).ok,true);
 const file=path.join(out,'records.json'),records=JSON.parse(fs.readFileSync(file));delete records.S01;fs.writeFileSync(file,JSON.stringify(records));
 assert.ok(verify(source,out).failures.some(f=>/record conservation/.test(f)));
});
test('JSON prototype-named keys retain their own values',t=>{
 const {dir,source}=setup(t);const raw='{"__proto__":{"obligation":"source"},"constructor":"existing"}';fs.writeFileSync(path.join(source,'records.json'),raw);const out=path.join(dir,'out');assert.equal(run(source,out).status,0);
 const records=JSON.parse(fs.readFileSync(path.join(out,'records.json')));assert.equal(Object.hasOwn(records,'__proto__'),true);assert.equal(records.__proto__.obligation,'source');assert.equal(records.constructor,'existing');
});
test('manifest-only legacy references are crosswalked in active JSON',t=>{
 const {dir,source}=setup(t);const file=path.join(source,'spec.manifest.json'),manifest=JSON.parse(fs.readFileSync(file));manifest.title='SCR-PUB-01';fs.writeFileSync(file,JSON.stringify(manifest));const out=path.join(dir,'out');assert.equal(run(source,out).status,0);
 assert.match(JSON.parse(fs.readFileSync(path.join(out,'spec.manifest.json'))).title,/^S\d{2}$/);
});
test('colliding rewritten JSON keys refuse before output is written',t=>{
 const {dir,source}=setup(t,story+'\nScreen SCR-PUB-01.\n');const raw='{"SCR-PUB-01":"first","scr-pub-01":"second"}';fs.writeFileSync(path.join(source,'records.json'),raw);const out=path.join(dir,'out'),result=run(source,out);
 assert.equal(result.status,2);assert.match(result.stderr,/key collision/);assert.equal(fs.existsSync(out),false);assert.equal(fs.readFileSync(path.join(source,'records.json'),'utf8'),raw);
});
test('preservation checker detects aliases in extra exported assets without a crosswalk',async t=>{
 const {verify}=await import('../verify-output.mjs');const {dir,source}=setup(t),out=path.join(dir,'out');assert.equal(run(source,out).status,0);fs.writeFileSync(path.join(out,'extra.html'),'<a id="SCR-PUB-01">Unmapped</a>');
 assert.ok(verify(source,out).failures.some(f=>/unexpected legacy identity.*extra.html/.test(f)));
});
test('qualified scenario identities in JSON reserve their owning suffix',t=>{
 const {dir,source}=setup(t,story.replaceAll('SCN-01-01','SCN-PUB-01-01'));fs.writeFileSync(path.join(source,'records.json'),JSON.stringify({retired:'US-01.SCN-01-40'}));const out=path.join(dir,'out'),result=run(source,out);assert.equal(result.status,0,result.stdout+result.stderr);
 const rows=JSON.parse(fs.readFileSync(path.join(out,'provenance/id-crosswalk.json'))).rows;assert.equal(rows.find(r=>r.legacy_id==='SCN-PUB-01-01').canonical_id,'US-01.SCN-01-41');
});
test('qualified AC identities in JSON reserve the shared email/control suffix',t=>{
 const {dir,source}=setup(t);fs.writeFileSync(path.join(source,'records.json'),JSON.stringify({retired:'US-01.AC-40'}));fs.writeFileSync(path.join(source,'email.md'),'---\nid: email-source\ntype: note\ntitle: Controls\nupdated: 2026-10-06\n---\n## US-01 controls\n| ID | Given | When | Then |\n|---|---|---|---|\n| EMAIL-01 | Page | Open | Obligation |\n');const out=path.join(dir,'out'),result=run(source,out);assert.equal(result.status,0,result.stdout+result.stderr);
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'provenance/id-crosswalk.json'))).rows.find(r=>r.legacy_id==='EMAIL-01').canonical_id,'US-01.AC-41');
});
test('crosswalk-item digest excludes its legacy identity in an AC association cell',t=>{
 const {dir,source}=setup(t,story.replaceAll('SCN-01-01','SCN-PUB-01-01'));const out=path.join(dir,'out'),result=run(source,out);assert.equal(result.status,0,result.stdout+result.stderr);
 const row=JSON.parse(fs.readFileSync(path.join(out,'provenance/id-crosswalk.json'))).rows[0],ledger=JSON.parse(fs.readFileSync(path.join(out,'provenance/source-ledger.json')));
 const item=ledger.items.find(i=>i.id===row.id);assert.equal(item.text_sha256,'a3e9d5e30cbd75dda86aa84ba10691c5a17cf8b54249fa5c6427916eac43bf27');
});
test('escaped canonical JSON reservations remain distinct from a literal legacy key',t=>{
 const {dir,source}=setup(t);fs.writeFileSync(path.join(source,'records.json'),'{"\\u005301":"Existing canonical obligation","SCR-PUB-01":"Distinct legacy obligation"}');
 const out=path.join(dir,'out');assert.equal(run(source,out).status,0);
 const records=JSON.parse(fs.readFileSync(path.join(out,'records.json')));assert.equal(records.S01,'Existing canonical obligation');assert.equal(records.S02,'Distinct legacy obligation');
});

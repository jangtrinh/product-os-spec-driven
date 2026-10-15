import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {contextLoadPlan} from '../context-load-plan.mjs';
import {commitContext} from '../load-context.mjs';
const kit=fileURLToPath(new URL('../../../',import.meta.url));
function fixture(t) {
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'context-load-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const project=path.join(dir,'project'),source=path.join(dir,'prepared');fs.mkdirSync(project);fs.mkdirSync(source);
 const put=(name,bytes)=>{const file=path.join(source,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);return file;};
 const call=(args=[])=>spawnSync(process.execPath,[path.join(kit,'tools/run/load-context.mjs'),'--project',project,'--kind','sources',...args],{encoding:'utf8'});
 return {dir,project,source,put,call};
}
test('recursive copy preserves exact UTF-8 bytes and root-relative paths; identical reload is no-op',t=>{
 const p=fixture(t),bytes=Buffer.from('\ufeff# Luật\r\n  exact  \r\n');p.put('nested/rules.md',bytes);p.put('.git/private.txt','skip');p.put('node_modules/private.txt','skip');
 let r=p.call(['--from',p.source,'--json']);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).files.length,1);
 const dest=path.join(p.project,'context/sources/nested/rules.md');assert.deepEqual(fs.readFileSync(dest),bytes);const mtime=fs.statSync(dest).mtimeMs;
 r=p.call(['--from',p.source,'--json']);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).files[0].action,'identical');assert.equal(fs.statSync(dest).mtimeMs,mtime);
});
test('dry-run reports files and bytes without creating even the context directory',t=>{
 const p=fixture(t);p.put('guide.html','<main>Prepared</main>');const r=p.call(['--from',p.source,'--dry-run','--json']);assert.equal(r.status,0,r.stdout+r.stderr);
 const plan=JSON.parse(r.stdout);assert.equal(plan.total_bytes,21);assert.equal(plan.files[0].destination,'context/sources/guide.html');assert.equal(fs.existsSync(path.join(p.project,'context')),false);
});
for(const [extension,bytes,advice] of [['png',Buffer.from([0x89,0x50]),/describe.*\.md/i],['jpg','image',/describe.*\.md/i],['pdf','PDF',/export.*\.md/i],['docx','zip',/export.*\.md/i],['fig','raw',/export.*\.md/i],['zip','zip',/export.*\.md/i],['md',Buffer.from([0xc3,0x28]),/UTF-8/],['txt',Buffer.from([0,1,2]),/binary/i]]) {
 test(`refuses ${extension} or invalid text and lists preparation advice without partial writes`,t=>{
  const p=fixture(t);p.put('good.md','good');p.put('bad.'+extension,bytes);const r=p.call(['--from',p.source,'--dry-run','--json']);assert.equal(r.status,3,r.stdout+r.stderr);const plan=JSON.parse(r.stdout);assert.match(plan.refusals.join('\n'),advice);assert.match(plan.refusals.join('\n'),/bad\./);assert.equal(fs.existsSync(path.join(p.project,'context')),false);
  assert.equal(p.call(['--from',p.source]).status,3);assert.equal(fs.existsSync(path.join(p.project,'context')),false);
 });
}
test('a batch lists every refused file and differing destination; no files are copied',t=>{
 const p=fixture(t);const first=p.put('same.md','original');assert.equal(p.call(['--from',first]).status,0);
 p.put('same.md','changed');p.put('other.md','new');p.put('a.png','image');p.put('b.pdf','pdf');const r=p.call(['--from',p.source,'--json']);assert.equal(r.status,3);
 const plan=JSON.parse(r.stdout);for(const name of ['same.md','a.png','b.pdf'])assert.ok(plan.refusals.some(x=>x.includes(name)),name);
 assert.equal(fs.readFileSync(path.join(p.project,'context/sources/same.md'),'utf8'),'original');assert.equal(fs.existsSync(path.join(p.project,'context/sources/other.md')),false);
});
test('multiple roots keep relative names, coalesce identical aliases and refuse differing aliases',t=>{
 const p=fixture(t);const a=p.put('a/topic.md','same'),b=p.put('b/topic.md','same');assert.equal(p.call(['--from',a,'--from',b]).status,0);
 fs.writeFileSync(b,'different');const r=p.call(['--from',a,'--from',b]);assert.equal(r.status,3);assert.match(r.stdout,/conflict/i);
});
for(const location of ['spec','input','config'])test(`refuses sources in project ${location}`,t=>{
 const p=fixture(t),file=path.join(p.project,location,'source.md');fs.mkdirSync(path.dirname(file));fs.writeFileSync(file,'owned');const r=p.call(['--from',file]);assert.equal(r.status,3);assert.match(r.stdout,/project.*(spec|input|config)/i);assert.equal(fs.existsSync(path.join(p.project,'context')),false);
});
test('refuses kit source, symlink root, symlink ancestor, nested symlink and destination symlink',t=>{
 const p=fixture(t);p.put('real.md','text');assert.equal(p.call(['--from',path.join(kit,'README.md')]).status,3);
 fs.symlinkSync(p.source,path.join(p.dir,'alias'));assert.equal(p.call(['--from',path.join(p.dir,'alias')]).status,3);assert.equal(p.call(['--from',path.join(p.dir,'alias/real.md')]).status,3);
 fs.symlinkSync(path.join(p.source,'real.md'),path.join(p.source,'link.md'));assert.equal(p.call(['--from',p.source]).status,3);
 fs.mkdirSync(path.join(p.project,'context'));fs.symlinkSync(p.source,path.join(p.project,'context/sources'));assert.equal(p.call(['--from',path.join(p.source,'real.md')]).status,3);
});
test('file and accumulated kind caps refuse with byte counts including prior loads',t=>{
 const p=fixture(t);let r=p.call(['--from',p.put('large.md','x'.repeat(65537)),'--json']);assert.equal(r.status,3);assert.match(JSON.parse(r.stdout).refusals.join('\n'),/65537.*65536/);
 fs.unlinkSync(path.join(p.source,'large.md'));for(let i=0;i<4;i++)p.put(`${i}.txt`,'x'.repeat(65536));assert.equal(p.call(['--from',p.source]).status,0);
 r=p.call(['--from',p.put('extra.md','x'),'--json']);assert.equal(r.status,3);assert.match(JSON.parse(r.stdout).refusals.join('\n'),/262145.*262144/);assert.equal(fs.existsSync(path.join(p.project,'context/sources/extra.md')),false);
});
test('all accepted extensions load without interpretation; ui selects the ui destination',t=>{
 const p=fixture(t);for(const ext of ['md','txt','html','htm','css','json','yaml','yml','csv','svg'])p.put('file.'+ext,'valid text');
 const r=spawnSync(process.execPath,[path.join(kit,'tools/run/load-context.mjs'),'--project',p.project,'--kind','ui','--from',p.source,'--json'],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).files.length,10);assert.ok(fs.existsSync(path.join(p.project,'context/ui/file.svg')));
});
for(const args of [[],['--from','missing'],['--kind','unknown'],['--from'],['--json','--json']])test(`invalid command refuses ${JSON.stringify(args)}`,t=>{const p=fixture(t);assert.equal(p.call(args).status,3);assert.equal(fs.existsSync(path.join(p.project,'context')),false);});
test('planned file/directory collisions refuse during preview without partial writes',t=>{
 const p=fixture(t),a=p.put('one/topic.md','file'),b=p.put('two/topic.md/note.md','child');const r=p.call(['--from',a,'--from',path.dirname(path.dirname(b)),'--dry-run','--json']);assert.equal(r.status,3,r.stdout+r.stderr);assert.match(JSON.parse(r.stdout).refusals.join('\n'),/conflict/);assert.equal(fs.existsSync(path.join(p.project,'context')),false);
});
test('destination os junk and disallowed files do not block the next load',t=>{
 const p=fixture(t);const first=p.put('note.md','Prepared context');assert.equal(p.call(['--from',first]).status,0);
 const dir=path.join(p.project,'context/sources');
 fs.writeFileSync(path.join(dir,'.DS_Store'),Buffer.from([0,1,2,0]));fs.writeFileSync(path.join(dir,'._note.md'),Buffer.from([0,1]));
 fs.writeFileSync(path.join(dir,'Thumbs.db'),Buffer.from([0]));fs.writeFileSync(path.join(dir,'desktop.ini'),'[.ShellClassInfo]\n');fs.writeFileSync(path.join(dir,'shot.png'),'png');
 const extra=path.join(p.dir,'extra.md');fs.writeFileSync(extra,'More prepared context');
 const r=p.call(['--from',extra,'--json']);assert.equal(r.status,0,r.stdout+r.stderr);
 assert.equal(fs.readFileSync(path.join(dir,'extra.md'),'utf8'),'More prepared context');assert.equal(fs.readFileSync(path.join(dir,'note.md'),'utf8'),'Prepared context');
});
test('refuses case-variant SPEC, Input, Config and kit sources',t=>{
 const p=fixture(t);
 for(const name of ['SPEC','Input','Config']){
  const file=path.join(p.project,name,'source.md');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'owned');
  const r=p.call(['--from',file]);assert.equal(r.status,3,name+'\n'+r.stdout+r.stderr);assert.match(r.stdout,/project.*(spec|input|config)/i);assert.equal(fs.existsSync(path.join(p.project,'context')),false,name);
 }
 const parts=kit.split(path.sep);const index=parts.length-1;const segment=parts[index];
 parts[index]=segment.replace(/^./,ch=>ch===ch.toLowerCase()?ch.toUpperCase():ch.toLowerCase());
 const readme=path.join(parts.join(path.sep),'README.md');const r=p.call(['--from',readme]);
 assert.equal(r.status,3,r.stdout+r.stderr);assert.match(r.stdout,/kit/i);assert.equal(fs.existsSync(path.join(p.project,'context')),false);
});
test('unreadable disallowed and oversize files exit 3 before any byte read',t=>{
 const p=fixture(t);const png=p.put('huge.png','');fs.truncateSync(png,8*1024*1024);fs.chmodSync(png,0);t.after(()=>{if(fs.existsSync(png))fs.chmodSync(png,0o644);});
 let r=p.call(['--from',png,'--json']);assert.equal(r.status,3,r.stdout+r.stderr);assert.match(r.stdout,/unsupported format/);assert.match(r.stdout,/8388608.*65536/);assert.doesNotMatch(r.stdout+r.stderr,/EACCES|ERR_FS_FILE_TOO_LARGE/);
 const md=p.put('large.md','');fs.truncateSync(md,65537);fs.chmodSync(md,0);t.after(()=>{if(fs.existsSync(md))fs.chmodSync(md,0o644);});
 r=p.call(['--from',md,'--json']);assert.equal(r.status,3,r.stdout+r.stderr);assert.match(r.stdout,/65537.*65536/);assert.doesNotMatch(r.stdout+r.stderr,/EACCES|ERR_FS_FILE_TOO_LARGE/);
 assert.equal(fs.existsSync(path.join(p.project,'context')),false);
});
test('projected kind cap stops the walk before a later unreadable file',t=>{
 const p=fixture(t);for(let i=0;i<4;i++)p.put(`${i}.txt`,'x'.repeat(65536));assert.equal(p.call(['--from',p.source]).status,0);
 const later=p.put('zz.md','later');fs.chmodSync(later,0);t.after(()=>{if(fs.existsSync(later))fs.chmodSync(later,0o644);});p.put('extra.md','x');
 const r=p.call(['--from',p.source,'--json']);assert.equal(r.status,3,r.stdout+r.stderr);assert.match(r.stdout,/262145.*262144/);assert.doesNotMatch(r.stdout+r.stderr,/EACCES/);
 assert.equal(fs.existsSync(path.join(p.project,'context/sources/extra.md')),false);
});
test('destination open EEXIST and ELOOP follow lstat: a symlink is refused and anything else asks for a rerun',t=>{
 const openSync=fs.openSync;
 function commitWithOpenCode(plan,code){
  fs.openSync=()=>{const error=new Error(code);error.code=code;throw error;};
  try{commitContext(plan);}finally{fs.openSync=openSync;}
 }
 const loopFile=fixture(t);const loopSource=loopFile.put('loop.md','prepared');const loopPlan=contextLoadPlan(loopFile.project,'sources',[loopSource]);assert.equal(loopPlan.refusals.length,0);
 const loopDest=path.join(loopFile.project,'context/sources/loop.md');fs.mkdirSync(path.dirname(loopDest),{recursive:true});fs.writeFileSync(loopDest,'present');
 let thrown=null;try{commitWithOpenCode(loopPlan,'ELOOP');}catch(e){thrown=e;}
 assert.equal(thrown?.code,3);assert.match(thrown?.message??'',/destination file appeared during the load; rerun load-context/);assert.doesNotMatch(thrown?.message??'',/Refusing symlink/);assert.equal(fs.readFileSync(loopDest,'utf8'),'present');
 const loopLink=fixture(t);const loopLinkSource=loopLink.put('loop-link.md','prepared');const loopLinkPlan=contextLoadPlan(loopLink.project,'sources',[loopLinkSource]);assert.equal(loopLinkPlan.refusals.length,0);
 const loopLinkPath=path.join(loopLink.project,'context/sources/loop-link.md');fs.mkdirSync(path.dirname(loopLinkPath),{recursive:true});fs.symlinkSync(loopLinkSource,loopLinkPath);
 thrown=null;try{commitWithOpenCode(loopLinkPlan,'ELOOP');}catch(e){thrown=e;}
 assert.equal(thrown?.code,3);assert.match(thrown?.message??'',/Refusing symlink/);assert.doesNotMatch(thrown?.message??'',/appeared during the load/);assert.equal(fs.lstatSync(loopLinkPath).isSymbolicLink(),true);
 const appeared=fixture(t);const source=appeared.put('note.md','prepared');const plan=contextLoadPlan(appeared.project,'sources',[source]);assert.equal(plan.refusals.length,0);
 const dest=path.join(appeared.project,'context/sources/note.md');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,'appeared');
 thrown=null;try{commitContext(plan);}catch(e){thrown=e;}
 assert.equal(thrown?.code,3);assert.match(thrown?.message??'',/destination file appeared during the load; rerun load-context/);assert.doesNotMatch(thrown?.message??'',/Refusing symlink/);assert.equal(fs.readFileSync(dest,'utf8'),'appeared');
 const linked=fixture(t);const linkSource=linked.put('linked.md','prepared');const linkPlan=contextLoadPlan(linked.project,'sources',[linkSource]);assert.equal(linkPlan.refusals.length,0);
 const link=path.join(linked.project,'context/sources/linked.md');fs.mkdirSync(path.dirname(link),{recursive:true});fs.symlinkSync(linkSource,link);
 thrown=null;try{commitContext(linkPlan);}catch(e){thrown=e;}
 assert.equal(thrown?.code,3);assert.match(thrown?.message??'',/Refusing symlink/);assert.doesNotMatch(thrown?.message??'',/appeared during the load/);assert.equal(fs.lstatSync(link).isSymbolicLink(),true);
});
test('refuses a context parent swapped to a symlink after planning',t=>{
 const p=fixture(t);const outside=path.join(p.dir,'outside');fs.mkdirSync(path.join(outside,'sources'),{recursive:true});
 const source=p.put('note.md','prepared');const plan=contextLoadPlan(p.project,'sources',[source]);assert.equal(plan.refusals.length,0);
 fs.symlinkSync(outside,path.join(p.project,'context'));let thrown=null;try{commitContext(plan);}catch(e){thrown=e;}
 assert.equal(fs.existsSync(path.join(outside,'sources','note.md')),false);assert.match(thrown?.message??'',/symlink/i);
});
test('unreadable source is an environment error without partial copies',t=>{
 const p=fixture(t),file=p.put('unreadable.md','prepared');p.put('good.md','good');fs.chmodSync(file,0);t.after(()=>{if(fs.existsSync(file))fs.chmodSync(file,0o600);});
 const r=p.call(['--from',p.source,'--json']);assert.equal(r.status,4,r.stdout+r.stderr);assert.equal(fs.existsSync(path.join(p.project,'context')),false);
});

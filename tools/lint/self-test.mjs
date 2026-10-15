import { evidenceHeadControls } from './controls-evidence-heads.mjs';
import { recordedControl,cliControl } from './recorded-controls.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintSpec } from './index.mjs';
import { coreControls } from './controls-core.mjs';
import { v2Controls } from './controls-v2.mjs';
import { historyControls } from './controls-history.mjs';
import { gateControls } from './controls-gates.mjs';
import { currentReceiptControls } from './controls-current-receipts.mjs';
import { v3Controls } from './controls-v3.mjs';
export const EXAMPLE=fileURLToPath(new URL('../../fixtures/v2/full/',import.meta.url));
export const CONTROLS=[...coreControls,...v2Controls,...historyControls,...gateControls,
 ['E-INPUT',t=>{for(const f of t.files().filter(f=>f.endsWith('.md')))t.remove(f);}],
 ['E-SCHEMA',t=>{const folder=path.join(t.root,'tests/schemas');fs.cpSync(fileURLToPath(new URL('../../format/schema/',import.meta.url)),folder,{recursive:true});fs.rmSync(path.join(folder,'manifest.schema.json'));t.options.schemaDir=folder;}],
 ['E-RULE',t=>{t.options.rules={planted:()=>{throw new Error('seeded exception');}};}],
...v3Controls,...currentReceiptControls,...evidenceHeadControls];
export function plant(mutate) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'spec-driven-lint-'));fs.cpSync(EXAMPLE,root,{recursive:true});
  const abs=rel=>path.join(root,rel),options={},t={root,options,
    edit(rel,fn){const before=fs.readFileSync(abs(rel),'utf8'),after=fn(before);if(before===after)throw new Error(`mutation changed nothing: ${rel}`);fs.writeFileSync(abs(rel),after);return t;},
    write(rel,text){fs.mkdirSync(path.dirname(abs(rel)),{recursive:true});fs.writeFileSync(abs(rel),text);return t;},
    remove(rel){fs.rmSync(abs(rel),{recursive:true,force:true});return t;},
    rename(a,b){fs.mkdirSync(path.dirname(abs(b)),{recursive:true});fs.renameSync(abs(a),abs(b));return t;},
    copy(a,b,fn=s=>s){return t.write(b,fn(fs.readFileSync(abs(a),'utf8')));},
    json(rel,fn){return t.edit(rel,s=>{const j=JSON.parse(s);fn(j);return JSON.stringify(j,null,2)+'\n';});},
    scenarios(rel,fn){return t.edit(rel,s=>s.replace(/^scenarios: (.*)$/m,(_,raw)=>{const value=JSON.parse(raw);fn(value);return 'scenarios: '+JSON.stringify(value);}));},
    files(){const out=[];function walk(rel=''){for(const e of fs.readdirSync(abs(rel),{withFileTypes:true})){const p=rel?rel+'/'+e.name:e.name;if(e.isDirectory())walk(p);else if(e.isFile())out.push(p);}}walk();return out;},
    packet(fn){const rel=t.files().find(f=>f.endsWith('/packet-data.json'));return t.json(rel,fn);}
  };
  try{mutate(t);return {root,options,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};}catch(e){fs.rmSync(root,{recursive:true,force:true});throw e;}
}
export function ruleCodes() {
  return [...fs.readFileSync(new URL('../../format/SPEC-FORMAT-v2.md',import.meta.url),'utf8').matchAll(/^\| ((?:M|D|S|W|L|R|U|G|O|B|E|DS|Q)-[A-Z0-9-]+) \|/gm)].map(m=>m[1]);
}
export function receiptSelectionGuard() {
  const source=['current-receipts','receipt-evidence-key','receipt-supersession'].map(name=>fs.readFileSync(new URL(`./${name}.mjs`,import.meta.url),'utf8')).join('\n');
  return !/Date\s*\.\s*parse|\.\s*at\b|\[\s*['"]at['"]\s*\]/.test(source);
}
export function selfTest() {
  let ok=receiptSelectionGuard();console.log(`${ok?'GREEN as expected':'NOT GREEN'} receipt selection has no timestamp reads or parsing`);const base=lintSpec(EXAMPLE);
  console.log(`${base.exitCode===0?'GREEN as expected':'NOT GREEN'} full fixture (${base.stats.documents} documents)`);ok &&= base.exitCode===0;
  const missing=ruleCodes().filter(c=>c!=='E-OPTION' && !CONTROLS.some(([code])=>code===c));
  for(const code of missing){console.log(`NOT CAUGHT ${code}: no seeded control`);ok=false;}
  for(const [index,[code,mutate,severity='error']] of CONTROLS.entries()) {
    let fixture;
    try {
      fixture=plant(t=>recordedControl(index,t));const result=lintSpec(fixture.root,fixture.options),hit=result.problems.list.find(p=>p.code===code && p.severity===severity);
      console.log(`${hit?'RED as expected':'NOT CAUGHT'} ${code}${hit?`: ${hit.file}:${hit.line}`:''}`);ok &&= !!hit;
    }catch(e){console.log(`NOT CAUGHT ${code}: ${e.message}`);ok=false;}finally{fixture?.cleanup();}
  }
  const cli=spawnSync(process.execPath,[fileURLToPath(new URL('./lint.mjs',import.meta.url)),EXAMPLE,...cliControl().args],{encoding:'utf8'});
  const optionHit=cli.status===2 && JSON.parse(cli.stdout).problems.some(p=>p.code==='E-OPTION');
  console.log(`${optionHit?'RED as expected':'NOT CAUGHT'} E-OPTION`);ok &&= optionHit;
  console.log(ok?'lint self-test OK':'lint self-test FAILED');return ok;
}

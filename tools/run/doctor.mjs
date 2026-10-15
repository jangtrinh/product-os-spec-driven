#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../lib/config/config-loader.mjs';
import {commandArgv} from './command-process.mjs';
import {findChromium} from '../reader/lib/playwright.mjs';
import {kitStatus} from './kit-upgrade.mjs';
function executable(name,root) {
 const candidates=name.includes('/')?[path.resolve(root,name)]:(process.env.PATH??'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,name));
 return candidates.find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return fs.statSync(file).isFile();}catch{return false;}});
}
export async function checkReadiness({project,nodeVersion=process.versions.node}={},print=console.log) {
 let failed=false,unknown=false;
 const line=(status,name,detail)=>{print(`${status} ${name}: ${detail}`);if(status==='FAIL')failed=true;};
 const major=Number(nodeVersion.split('.')[0]);
 line(major>=18?'PASS':'FAIL','Node',major>=18?`${nodeVersion} (requires >=18)`:`${nodeVersion}; use Node >=18 and rerun doctor`);
 const root=path.resolve(project??process.cwd());
 const kitState=kitStatus(root);
 line(kitState==='current'?'PASS':kitState.startsWith('drift')?'WARN':'NOT RUN','kit',kitState);
 try {
  const require=createRequire(path.join(root,'config','doctor.cjs'));
  const module=require(process.env.SPEC_AJV_MODULE||'ajv/dist/2020');const Ajv=module.default??module;
  const ajv=new Ajv({strict:false});ajv.compile({$schema:'https://json-schema.org/draft/2020-12/schema',type:'object'});
  line('PASS','Ajv 2020','Draft 2020-12 schema compiles');
 }catch {line('FAIL','Ajv 2020','set SPEC_AJV_MODULE to an installed ajv/dist/2020 module or make ajv/dist/2020 resolvable in this project');}
 const chromium=findChromium(root);
 let browser;
 try {
  if(!chromium) throw new Error('Playwright unavailable');
  browser=await chromium.launch({timeout:5000});await browser.close();
  line('PASS','Playwright','Chromium launch/close succeeded for reader verify');
 }catch {
  await browser?.close().catch(()=>{});
  line('NOT RUN','Playwright','reader verify/screenshots unavailable (Chromium/headless shell not launchable); set PLAYWRIGHT_FROM=<directory containing node_modules/playwright>, then run npx playwright install chromium there');
 }
 const configPath=path.join(root,'config/pipeline.yaml');
 if(project||fs.existsSync(configPath)) {
  try {
   const config=loadConfig(root);
   for(const role of ['writer','reviewer']) {
    const command=config.agents[role].command;
    if(command==='manual') {line('PASS',role,'manual; no agent CLI required');continue;}
    const args=commandArgv(command),vendor=/tools\/agents\/(codex|claude|grok)-(?:writer|reviewer)/.exec(command)?.[1];
    const override=args.indexOf('--cli');const cli=vendor?(override>=0?args[override+1]:vendor):args[0];
    const wrapper=vendor?args.find(arg=>/tools\/agents\//.test(arg)):null;
    const ready=executable(cli,root)&&executable(args[0],root)&&(!wrapper||fs.existsSync(path.resolve(root,wrapper)));
    line(ready?'PASS':'FAIL',role,ready?`${cli} available (not invoked)`:`${cli} unavailable; put it on PATH or configure an installed agent command, or select manual`);
   }
  }catch {unknown=true;line('NOT RUN','Project','config unreadable/invalid; run init for a fresh project or repair config/pipeline.yaml, then rerun doctor');}
 }else line('NOT RUN','Project','no project config selected; rerun with --project <initialized-dir> to check agent commands');
 return unknown?2:failed?1:0;
}
export async function doctor(argv=process.argv.slice(2),print=console.log) {
 let project;const seen=new Set();
 for(let i=0;i<argv.length;i++) {
  const flag=argv[i];
  if(flag==='--help') {print('doctor [--project <initialized-dir>]: required Node >=18, Ajv 2020 and configured agent CLIs; optional Playwright/Chromium. Exits 0 ready, 1 required failure, 2 cannot check.');return 0;}
  if(flag!=='--project'||seen.has(flag)||!argv[i+1]||argv[i+1].startsWith('--')) {print('NOT RUN Options: use doctor [--project <initialized-dir>]');return 2;}
  seen.add(flag);project=argv[++i];
 }
 return checkReadiness({project},print);
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode=await doctor();

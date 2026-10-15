#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RunnerError} from '../lib/config/path-selection.mjs';
import {contextLoadPlan, noSymlinks} from './context-load-plan.mjs';
import {pathCollisionKey} from '../lib/path-collision-key.mjs';
export function commitContext(plan) {
 const written=[],directories=[];
 const flags=fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0);
 function mkdir(dir) {
  if(dir===plan.root)return;
  noSymlinks(dir);
  const stat=fs.lstatSync(dir,{throwIfNoEntry:false});
  if(stat?.isSymbolicLink())throw new RunnerError(`Refusing symlink: ${dir}; provide real exported files.`);
  if(stat?.isDirectory())return;
  if(stat)throw new RunnerError(`${dir}: destination ancestor is not a directory`);
  const parent=path.dirname(dir);mkdir(parent);noSymlinks(parent);fs.mkdirSync(dir);directories.push(dir);
 }
 try {
  for(const row of plan.files.filter(row=>row.action==='copy')) {
   const file=path.join(plan.root,row.destination);mkdir(path.dirname(file));noSymlinks(path.dirname(file));
   let fd;try{fd=fs.openSync(file,flags);}catch(error){if(error.code==='EEXIST'||error.code==='ELOOP'){const stat=fs.lstatSync(file,{throwIfNoEntry:false});if(stat?.isSymbolicLink())throw new RunnerError(`Refusing symlink: ${file}; provide real exported files.`);throw new RunnerError(`${row.destination}: destination file appeared during the load; rerun load-context`);}throw error;}
   written.push(file);try{fs.writeFileSync(fd,plan.entries.get(pathCollisionKey(row.destination.slice(`context/${plan.kind}/`.length))).bytes);}finally{fs.closeSync(fd);}
  }
 }catch(e){
  for(const file of written.reverse())fs.unlinkSync(file);
  for(const dir of directories.reverse())fs.rmdirSync(dir);
  if(e instanceof RunnerError)throw e;
  throw new RunnerError(`Context copy failed; batch rolled back: ${e.message}`,4);
 }
}
export function loadContext(argv=process.argv.slice(2),print=console.log) {
 let json=argv.includes('--json');
 try {
  const opt={from:[]},seen=new Set();
  for(let i=0;i<argv.length;i++) {
   const flag=argv[i];if(flag!=='--from'&&seen.has(flag))throw new RunnerError(`Duplicate ${flag}`);seen.add(flag);
   if(flag==='--help'){print('load-context --project <dir> --kind sources|ui --from <path> [--from <path> ...] [--dry-run] [--json]; copy prepared UTF-8 text only; refusals write nothing.');return 0;}
   if(['--dry-run','--json'].includes(flag)){opt[flag.slice(2)]=true;continue;}
   if(!['--project','--kind','--from'].includes(flag)||!argv[i+1]?.trim()||argv[i+1].startsWith('--'))throw new RunnerError(`Unknown or missing option ${flag}`);
   const value=argv[++i];if(flag==='--from')opt.from.push(value);else opt[flag.slice(2)]=value;
  }
  if(!opt.project||!['sources','ui'].includes(opt.kind)||!opt.from.length)throw new RunnerError('Required --project, --kind sources|ui and at least one --from');
  const plan=contextLoadPlan(opt.project,opt.kind,opt.from);
  if(!opt['dry-run']&&!plan.refusals.length) commitContext(plan);
  const {entries,root,...publicPlan}=plan;publicPlan.dry_run=!!opt['dry-run'];
  if(json)print(JSON.stringify(publicPlan));
  else {for(const row of plan.files)print(`${row.action}: ${row.destination} (${row.bytes} bytes)`);print(`Total: ${plan.total_bytes} bytes; caps ${plan.caps.file}/file, ${plan.caps.total}/kind${opt['dry-run']?'; dry run, no writes':''}`);for(const reason of plan.refusals)print(`REFUSED: ${reason}`);}
  return plan.refusals.length?3:0;
 }catch(e){const code=e instanceof RunnerError?e.code:['ENOENT','ENOTDIR'].includes(e.code)?3:4;if(json)print(JSON.stringify({files:[],refusals:[e.message]}));else print(e.message);return code;}
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fs.realpathSync(fileURLToPath(import.meta.url)))process.exitCode=loadContext();

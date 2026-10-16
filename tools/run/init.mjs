#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {kitContentPaths} from '../lib/kit-content-paths.mjs';
import {loadConfig} from '../lib/config/config-loader.mjs';
import {localPath, RunnerError, writeLocal} from '../lib/config/path-selection.mjs';
import {loadRegistries} from './registries.mjs';
import {materializeRegistries} from './project-registries.mjs';
import {planUpgrade,applyUpgrade,recordInstalledKit,withUpgradeLock} from './kit-upgrade.mjs';
import {emptyAnswers} from './answer-source.mjs';
const kit=fs.realpathSync(fileURLToPath(new URL('../../',import.meta.url)));
function canonicalTarget(target) {
 if(fs.existsSync(target)) return fs.realpathSync(target);
 return path.join(canonicalTarget(path.dirname(target)),path.basename(target));
}
function contains(parent,child) {
 const relative=path.relative(parent,child);
 return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));
}
function options(argv) {
 const result={}, seen=new Set();
 for(let i=0;i<argv.length;i++) {
  const flag=argv[i];
  if(seen.has(flag)) throw new RunnerError(`Duplicate option ${flag}`); seen.add(flag);
  if(['--force','--help','--upgrade','--dry-run'].includes(flag)) {result[flag.slice(2)]=true;continue;}
  if(!['--project','--name','--lang','--writer','--reviewer','--agent'].includes(flag)||!argv[i+1]?.trim()||argv[i+1].startsWith('--')) throw new RunnerError(`Unknown or missing option ${flag}`);
  result[flag.slice(2)]=argv[++i];
 }
 if(result.help) return result;
 if(result.upgrade) {
  if(!result.project)throw new RunnerError('Required --project');
  if(Object.keys(result).some(key=>!['project','upgrade','dry-run'].includes(key)))throw new RunnerError('--upgrade accepts only --project and --dry-run');
  return result;
 }
 if(result['dry-run'])throw new RunnerError('--dry-run requires --upgrade');
 for(const key of ['project','name','lang']) if(!result[key]) throw new RunnerError(`Required --${key}`);
 if(!['vi','en'].includes(result.lang)) throw new RunnerError('--lang must be vi or en');
 if(result.writer==='grok'||result.agent==='grok') throw new RunnerError('Grok is reviewer-only; no grok writer is shipped. Select --writer codex|claude|manual with --reviewer grok.');
 for(const role of ['writer','reviewer']) if(result[role]&&!['manual','codex','claude',...(role==='reviewer'?['grok']:[])].includes(result[role])) throw new RunnerError(`--${role} must be manual, codex or claude${role==='reviewer'?', or grok':''}`);
 if(result.agent&&(result.writer||result.reviewer)) throw new RunnerError('--agent excludes --writer/--reviewer');
 return result;
}
function agentCommand(agent,role) { return ['codex','claude','grok'].includes(agent)?`node tools/agents/${agent}-${role}`:agent; }
function safeTree(directory) {
 for(const ent of fs.readdirSync(directory,{withFileTypes:true})) {
  if(ent.name==='.git') continue;
  if(ent.isSymbolicLink()) throw new RunnerError(`Refusing symlink in target: ${ent.name}`);
  if(ent.isDirectory()) safeTree(path.join(directory,ent.name));
 }
}
function copyMissing(source,target,relative='') {
 const stat=fs.lstatSync(source);
 if(stat.isSymbolicLink()) throw new RunnerError(`Unsupported kit symlink: ${relative}`);
 if(stat.isDirectory()) {
  if(fs.existsSync(target)&&!fs.statSync(target).isDirectory()) throw new RunnerError(`Expected directory: ${relative}`);
  fs.mkdirSync(target,{recursive:true});
  for(const name of fs.readdirSync(source).sort()) {
   const rel=relative?`${relative}/${name}`:name;
   if(name==='node_modules'||name==='.git'||rel==='evals/results'||rel==='evals/promoted') continue;
   copyMissing(path.join(source,name),path.join(target,name),rel);
  }
 } else if(!fs.existsSync(target)) fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
}
export function init(argv=process.argv.slice(2),print=console.log) {
 try {
  const opt=options(argv);
  if(opt.help) {print('init --project <empty-dir> --name <name> --lang vi|en [--writer codex|claude|manual --reviewer codex|claude|grok|manual | --agent <name|command>] [--force (copy missing files only)]; grok is reviewer-only. Upgrade: init --project <existing-dir> --upgrade [--dry-run]');return 0;}
  const target=path.resolve(opt.project);
  if(fs.existsSync(target)&&(fs.lstatSync(target).isSymbolicLink()||!fs.statSync(target).isDirectory())) throw new RunnerError('Target must be a real directory');
  const root=canonicalTarget(target);
  if(contains(kit,root)||contains(root,kit)) throw new RunnerError('Target overlaps the source kit');
  if(fs.existsSync(target)) {
   if(!opt.upgrade)safeTree(target);
   if(fs.readdirSync(target).length&&!opt.force&&!opt.upgrade) throw new RunnerError('Target is non-empty; use another empty directory or --force to copy only missing kit files');
  }
  if(opt.upgrade) {
   if(!fs.existsSync(root))throw new RunnerError('--upgrade requires an existing initialized project');
   return withUpgradeLock(root,()=>{
   safeTree(root);
   const plan=planUpgrade(kit,root);
   if(plan.legacy)print('Installed by an unknown kit: differing kit bytes are listed; existing config keys are preserved because installing defaults are unknown.');
   for(const row of plan.rows)print(row);
   if(!plan.operations.length)print('already current');
   else if(opt['dry-run'])print(`Dry run: ${plan.operations.length} planned changes; no writes.`);
   else {applyUpgrade(root,plan);print(`Upgraded ${root}: ${plan.operations.length} changes; owner records and existing definitions preserved.`);}
   return 0;
   });
  }
  const reusing=fs.existsSync(root)&&fs.readdirSync(root).length>0;
  fs.mkdirSync(root,{recursive:true});
  // Preserve configuration and project-owned trees before any kit copy.
  const configFile=localPath(root,'config/pipeline.yaml'), existing=fs.existsSync(configFile);
  if(existing) {
   // Existing config is never rewritten; a differing agent flag must be refused before any copy.
   const current=loadConfig(root),labels={writer:'Writer',reviewer:'Reviewer'};
   const differs=Object.keys(labels).filter(role=>(opt.agent??opt[role])!==undefined&&agentCommand(opt.agent??opt[role],role)!==current.agents[role].command);
   if(differs.length) throw new RunnerError(differs.map(role=>`${labels[role]} differs from config: config/pipeline.yaml agents.${role}.command is ${JSON.stringify(current.agents[role].command)}; to switch, set it to ${JSON.stringify(agentCommand(opt.agent??opt[role],role))}, then run doctor.`).join('\n'));
  }
  for(const owned of kitContentPaths) if(owned!=='config/pipeline.yaml') copyMissing(path.join(kit,owned),localPath(root,owned),owned.replace(/\/$/,''));
  if(!existing) {
   let yaml=fs.readFileSync(path.join(kit,'config/pipeline.yaml'),'utf8');
   yaml=yaml.replace(/^  name: .*$/m,()=>`  name: ${JSON.stringify(opt.name)}`).replace(/^  doc_language: .*$/m,()=>`  doc_language: ${opt.lang}`);
   const writer=agentCommand(opt.agent??opt.writer??'manual','writer'),reviewer=agentCommand(opt.agent??opt.reviewer??'manual','reviewer');
   yaml=yaml.replace(/(  writer:\n    command:) .*\n(  reviewer:\n    command:) .*\n/,(_,writerKey,reviewerKey)=>`${writerKey} ${JSON.stringify(writer)}\n${reviewerKey} ${JSON.stringify(reviewer)}\n`);
   writeLocal(root,'config/pipeline.yaml',yaml,{immutable:true});
  }
  const put=(file,text)=>{if(!fs.existsSync(localPath(root,file))) writeLocal(root,file,text,{immutable:true});};
  put('input/po-spec.md', opt.lang==='vi'?'# Thông tin spec của PO\n\nOPEN: PO điền vấn đề, kết quả cần quan sát, phạm vi và nguồn đã xác nhận.\n':'# PO source specification\n\nOPEN: PO supplies the problem, observable outcome, scope and confirmed sources.\n');
  put('input/answers.md',emptyAnswers);
  put('context/tech.md',fs.readFileSync(path.join(kit,'templates/tech-context.md'),'utf8'));
  const config=loadConfig(root);
  for(const dir of ['spec','ui','tests','review/log','review/gates','review/manual','review/transitions','review/evidence',...Object.entries(config.gates).filter(([key])=>key.endsWith('dir')).map(([,value])=>value)]) fs.mkdirSync(localPath(root,dir),{recursive:true});
  materializeRegistries(root,config); loadRegistries(root,config);
  if(!reusing)writeLocal(root,'kit.lock.json',recordInstalledKit(kit,root),{immutable:true});
  print(`Initialized ${root}; existing files preserved${existing?' (existing config reused)':''}.`);
  print('PO must supply real owner emails and roles.po.approvers before decision import; no approvers invented. Baseline is unpublished: replace it with a real immutable baseline before G5/import.');
  print('Definition revisions bind exact membership. Content rewrites retain the definition; changed membership requires a new exact-version binding (scope-version-required). Product-allocated output ids are declared as strict patterns; adding or removing a concrete file remains a membership change.');
  print(`Run: node tools/run/run.mjs --project ${JSON.stringify(root)} --head fresh-source --build not-built`);
  return 0;
 } catch(error) {print(error.message);return error instanceof RunnerError?error.code:3;}
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode=init();

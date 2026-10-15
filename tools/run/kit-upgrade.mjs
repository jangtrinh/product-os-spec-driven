import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {kitContentPaths} from '../lib/kit-content-paths.mjs';
import {kitIdentity} from '../lib/kit-version.mjs';
import {loadConfig,validateConfig,STAGES} from '../lib/config/config-loader.mjs';
import {parseYaml} from '../lib/config/yaml-parser.mjs';
import {editYaml} from '../lib/config/yaml-in-place.mjs';
import {canonical,parseJson} from '../lib/config/strict-json.mjs';
import {localPath,sha256,RunnerError} from '../lib/config/path-selection.mjs';
import {definitionRevision} from '../lib/definition-scope.mjs';
import {declaredOutputs,gateDefinition} from './project-registries.mjs';
import {schema,validateSchema} from '../lib/config/schema-validation.mjs';
import {fileURLToPath} from 'node:url';
import {pathCollisionKey} from '../lib/path-collision-key.mjs';
import {isLegacySkillId,migrateLegacySkillIds,replacementForLegacySkillId} from '../lib/config/skill-ids.mjs';

import {emptyAnswers} from './answer-source.mjs';

const configFile='config/pipeline.yaml',lockFile='kit.lock.json';
const ownerKeys=['project.name','project.doc_language','agents.writer.command','agents.reviewer.command'];
// Drift-only: owner-editable config keys ignored when comparing config/pipeline.yaml with the lock.
const driftIgnoredKeys=[...ownerKeys,'agents.*','roles.*','stages.*.enabled'];
function removeConfigPath(node,[head,...rest]) {
 if(!node||typeof node!=='object'||head===undefined)return;
 for(const name of head==='*'?Object.keys(node):Object.hasOwn(node,head)?[head]:[]) {
  if(rest.length)removeConfigPath(node[name],rest);else delete node[name];
 }
}
// Kit-owned part of config/pipeline.yaml: owner selections removed, everything else hashed.
function kitOwnedConfigDigest(bytes) {
 const config=parseYaml(bytes.toString(),configFile);
 for(const key of driftIgnoredKeys)removeConfigPath(config,key.split('.'));
 return sha256(canonical(config));
}
const activeLocks=new Set();
function processStart(pid) {
 const result=spawnSync('ps',['-p',String(pid),'-o','lstart='],{encoding:'utf8'});
 return result.status===0?result.stdout.trim():null;
}
export function withUpgradeLock(root,action) {
 root=fs.realpathSync(root);
 const file=localPath(root,'.kit-upgrade.lock');let acquired=false;
 const holder={pid:process.pid,startTime:processStart(process.pid),acquiredAt:new Date().toISOString()};
 function acquire() {
  const fd=fs.openSync(file,'wx',0o600);acquired=true;
  try {fs.writeFileSync(fd,canonical(holder)+'\n');}finally{fs.closeSync(fd);}
 }
 try {
  try {acquire();}
  catch(error) {
   if(error.code!=='EEXIST')throw error;
   const manual=`confirm that process has exited, then delete ${file} and rerun`;
   const bytes=fs.readFileSync(file);let previous;
   try {previous=parseJson(bytes.toString(),'.kit-upgrade.lock');}catch{throw new RunnerError(`Unknown upgrade lock holder (pid unknown, start unknown); ${manual}`);}
   if(!Number.isSafeInteger(previous?.pid)||previous.pid<=0)throw new RunnerError(`Invalid upgrade lock holder (pid ${previous?.pid??'unknown'}, start ${previous?.startTime??'unknown'}); ${manual}`);
   let live=true;
   try {process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')live=false;else if(e.code!=='EPERM')throw e;}
   const start=live?processStart(previous.pid):null;
   if(live&&start&&previous.startTime&&start!==previous.startTime)live=false;
   const description=`pid ${previous.pid}, start ${previous.startTime??previous.acquiredAt??'unknown'}`;
   throw new RunnerError(`Upgrade locked by holder ${description} (looks ${live?'live':'exited'}); ${manual}`);
  }
  activeLocks.add(root);
  return action();
 }catch(error) {
  if(acquired) {fs.unlinkSync(file);acquired=false;}
  throw error;
 }finally {activeLocks.delete(root);if(acquired)fs.unlinkSync(file);}
}
const excluded=file=>file.split('/').some(part=>part==='node_modules'||part==='.git')||file==='evals/results'||file.startsWith('evals/results/');
const owned=file=>!excluded(file)&&kitContentPaths.some(prefix=>prefix.endsWith('/')?file.startsWith(prefix):file===prefix);
const equal=(a,b)=>canonical(a)===canonical(b);
const read=(root,file)=>fs.readFileSync(localPath(root,file));
function kitFiles(root) {
 const result=[];
 function walk(file) {
  if(excluded(file))return;
  const full=localPath(root,file);if(!fs.existsSync(full))return;
  const stat=fs.lstatSync(full);
  if(stat.isSymbolicLink())throw new RunnerError(`Refusing kit symlink: ${file}`);
  if(stat.isDirectory())for(const name of fs.readdirSync(full).sort())walk(`${file}/${name}`);
  else if(stat.isFile())result.push(file);
  else throw new RunnerError(`Unsupported kit entry: ${file}`);
 }
 for(const file of kitContentPaths)walk(file.replace(/\/$/,''));return result.sort();
}
// Config compares by kit-owned digest when the lock has one; legacy locks keep whole-file bytes.
function lockedDigest(root,file,lock) {
 const bytes=read(root,file);
 if(file!==configFile||lock.configDigest===undefined)return sha256(bytes);
 return kitOwnedConfigDigest(bytes)===lock.configDigest?lock.files[file]:sha256(bytes);
}
function readLock(root) {
 if(!fs.existsSync(localPath(root,lockFile)))return null;
 const lock=parseJson(read(root,lockFile).toString(),lockFile);
 if(lock.lockVersion!==1||typeof lock.kitVersion!=='string'||!(lock.kitCommit===null||/^[a-f0-9]{40,64}$/.test(lock.kitCommit))||!lock.files||typeof lock.files!=='object'||Array.isArray(lock.files))throw new RunnerError('Invalid kit.lock.json');
 if(lock.configDigest!==undefined&&!/^[a-f0-9]{64}$/.test(lock.configDigest))throw new RunnerError('Invalid kit.lock.json configDigest');
 for(const [file,digest] of Object.entries(lock.files)) {
  localPath(root,file);
  if(!owned(file)||!/^[a-f0-9]{64}$/.test(digest))throw new RunnerError(`Invalid kit.lock.json file: ${file}`);
 }
 validateConfig(lock.configDefaults, {legacyStages:true});return lock;
}
function inventoryHash(lock) {
 return sha256(canonical({kitVersion:lock.kitVersion,kitCommit:lock.kitCommit,files:lock.files,shippedFiles:lock.shippedFiles,configDefaults:lock.configDefaults,ownerSelections:lock.ownerSelections??ownerKeys,...(lock.configDigest===undefined?{}:{configDigest:lock.configDigest})}));
}
function consistentLock(lock) {
 if(!lock?.shippedFiles||!Object.keys(lock.files).length)return false;
 if(!equal(Object.keys(lock.files).sort(),Object.keys(lock.shippedFiles).sort()))return false;
 if(Object.entries(lock.files).some(([file,digest])=>file!==configFile&&digest!==lock.shippedFiles[file]))return false;
 return lock.inventoryHash===inventoryHash(lock);
}
function kitRecord(kit,files,configDefaults,configDigest) {
 const {version:kitVersion,commit:kitCommit}=kitIdentity(kit);
 const shippedFiles=Object.fromEntries(kitFiles(kit).map(file=>[file,sha256(read(kit,file))]));
 const lock={lockVersion:1,kitCommit,kitVersion,files,shippedFiles,configDefaults,ownerSelections:ownerKeys,configDigest};
 lock.inventoryHash=inventoryHash(lock);return lock;
}
export function recordInstalledKit(kit,root) {
 const files=Object.fromEntries(kitFiles(kit).map(file=>[file,sha256(read(root,file))]));
 const defaults=validateConfig(parseYaml(read(kit,configFile).toString(),configFile));
 return canonical(kitRecord(kit,files,defaults,kitOwnedConfigDigest(read(root,configFile))))+'\n';
}
// True when the project carries the lock `init` wrote: full shape, valid digests and a consistent inventory.
export function hasInstalledKitLock(root) {
 try {const lock=readLock(root);return !!lock&&consistentLock(lock);} catch {return false;}
}
export function kitStatus(root,kit=fileURLToPath(new URL('../../',import.meta.url))) {
 try {
  const lock=readLock(root);if(!lock)return 'unknown (no lock)';
  const changed=new Set();
  for(const [file,digest] of Object.entries(lock.files))try {if(lockedDigest(root,file,lock)!==digest)changed.add(file);}catch{changed.add(file);}
  for(const file of kitFiles(kit))try {
   const expected=file===configFile?lock.files[file]:sha256(read(kit,file));
   if(!expected||lock.files[file]!==expected||lockedDigest(root,file,lock)!==expected)changed.add(file);
  }catch{changed.add(file);}
  if(!consistentLock(lock))return 'drift (inconsistent lock inventory)';
  return changed.size?`drift (${changed.size} files)`:'current';
 }catch{return 'unknown (invalid lock)';}
}
function mergeConfig(previous,project,next,rows,key='') {
 const map=value=>value&&typeof value==='object'&&!Array.isArray(value);
 if(map(project)&&map(next)&&(previous===undefined||map(previous))) {
  const result={};
  for(const name of new Set([...Object.keys(previous??{}),...Object.keys(project),...Object.keys(next)])) {
   const value=mergeConfig(previous?.[name],project[name],next[name],rows,key?`${key}.${name}`:name);
   if(value!==undefined)result[name]=value;
  }
  return result;
 }
 let value,action;
 if(/^stages\.[^.]+\.optional_context$/.test(key)&&Array.isArray(project)&&Array.isArray(next)) {value=[...new Set([...project,...next])];action='add-optional-context-preserve-project';}
 else if(/^stages\.[^.]+\.context$/.test(key)&&Array.isArray(previous)&&Array.isArray(project)&&Array.isArray(next)&&next.includes('input/answers.md')&&!previous.includes('input/answers.md')&&equal(next.filter(file=>file!=='input/answers.md'),previous)) {
  value=[...project];if(!value.includes('input/answers.md')&&(key==='stages.clarify.context'||value.includes('spec/decisions/decisions.md')))value.push('input/answers.md');action='add-answer-source-preserve-project-context';
 }
 else if(ownerKeys.includes(key)&&project!==undefined) {value=project;action='preserve-owner-selection';}
 else if(previous===undefined) {value=project===undefined?next:project;action=project===undefined?'new-default':'preserve-unknown';}
 else if(equal(project,previous)) {value=next;action=equal(next,previous)?'default-current':'update-default';}
 else if(!equal(next,previous)&&!equal(next,project))throw new RunnerError(`Config conflict: ${key}; project and new kit both changed the installing default`);
 else {value=project;action='preserve-project';}
 rows.push(`config ${key}: ${action}${action==='preserve-owner-selection'&&!equal(project,next)?`; kept project ${canonical(project)}; new kit default ${canonical(next)}`:''}`);return value;
}
export function planUpgrade(kit,root) {
 root=fs.realpathSync(root);
 const previous=readLock(root),originalConfig=read(root,configFile),jsonConfig=originalConfig.toString().trimStart().startsWith('{');
 if(jsonConfig&&previous?.files[configFile]!==sha256(originalConfig))throw new RunnerError(`Cannot repair ${configFile}: bytes do not match the previous upgrade lock; manually restore readable block YAML with your project values, then rerun upgrade`);
 const current=loadConfig(root,configFile,{legacyStages:true});
 const {version:sourceVersion,commit:sourceCommit}=kitIdentity(kit);
 const version=value=>{const match=/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);if(!match)throw new RunnerError(`Unknown kit version: ${value}`);return match;};
 if(previous) {
  const old=version(previous.kitVersion),next=version(sourceVersion);
  let comparison=0;for(let i=1;i<=3&&!comparison;i++)comparison=BigInt(old[i])>BigInt(next[i])?1:BigInt(old[i])<BigInt(next[i])?-1:0;
  if(!comparison)comparison=!old[4]&&next[4]?1:old[4]&&!next[4]?-1:0;
  if(!comparison&&old[4]&&next[4]) {
   const a=old[4].split('.'),b=next[4].split('.');
   for(let i=0;i<Math.max(a.length,b.length)&&!comparison;i++) {
    if(a[i]===b[i])continue;
    const numeric=value=>/^\d+$/.test(value);
    comparison=a[i]===undefined?-1:b[i]===undefined?1:numeric(a[i])&&numeric(b[i])?(BigInt(a[i])>BigInt(b[i])?1:-1):numeric(a[i])?-1:numeric(b[i])?1:a[i]>b[i]?1:-1;
   }
  }
  const reverse=previous.kitCommit&&sourceCommit&&previous.kitCommit!==sourceCommit?spawnSync('git',['merge-base','--is-ancestor',sourceCommit,previous.kitCommit],{cwd:kit}):null;
  if(comparison>0||reverse?.status===0)throw new RunnerError(`Refusing kit downgrade: recorded ${previous.kitVersion} (${previous.kitCommit??'commit unknown'}), source ${sourceVersion} (${sourceCommit??'commit unknown'})`);
 }
 const defaults=validateConfig(parseYaml(read(kit,configFile).toString(),configFile)),rows=[];
 for(const [stage,row] of Object.entries(current.stages)) for(const id of row.skill?.skills ?? []) if(isLegacySkillId(id)) {
  rows.push(`config stages.${stage}.skill.skills: migrate legacy ${id} -> ${replacementForLegacySkillId(id)}`);
 }
 const legacyDefaults=previous?.configDefaults&&migrateLegacySkillIds(structuredClone(previous.configDefaults));
 const migratedCurrent=migrateLegacySkillIds(structuredClone(current));
 const merged=validateConfig(mergeConfig(legacyDefaults,migratedCurrent,defaults,rows));
 for(const stage of STAGES.filter(stage=>stage!=='intake'))if((stage==='clarify'||merged.stages[stage].context.includes('spec/decisions/decisions.md'))&&!merged.stages[stage].context.includes('input/answers.md')) {
  merged.stages[stage].context.push('input/answers.md');rows.push(`config stages.${stage}.context: add PO answer source`);
 }
 for(const file of [merged.project.spec_root,merged.review.rubric,merged.review.log_dir,...Object.entries(merged.gates).filter(([key])=>key.endsWith('dir')||['graph','baseline'].includes(key)).map(([,value])=>value),...(merged.design_adapter?[merged.design_adapter]:[])])localPath(root,file);
 for(const stage of STAGES) {
  for(const file of merged.stages[stage].context)localPath(root,file);
  for(const entry of merged.evals[stage])if(entry.per_file)localPath(root,entry.per_file);
 }
 for (const stage of STAGES) {
  const additions=defaults.stages[stage].optional_context ?? [];
  if (!additions.length) continue;
  merged.stages[stage].optional_context=[...new Set([...(merged.stages[stage].optional_context ?? []),...additions])];
  for (const file of merged.stages[stage].optional_context) localPath(root,file);
 }
 const operations=[],files={},existingPaths=new Map(),sourceKeys=new Map(),plannedKeys=new Map();
 function inventory(directory='') {
  for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true})) {
   const file=directory?`${directory}/${entry.name}`:entry.name;
   if(excluded(file))continue;
   const key=pathCollisionKey(file),prior=existingPaths.get(key);
   if(prior&&prior!==file)throw new RunnerError(`Project path collision: ${prior} and ${file}`);
   existingPaths.set(key,file);if(entry.isDirectory())inventory(file);
  }
 }
 inventory();
 const add=(file,bytes,mode=0o644)=>{
  const key=pathCollisionKey(file),prior=plannedKeys.get(key);
  if(prior&&prior!==file)throw new RunnerError(`Planned path collision: ${prior} and ${file}`);
  plannedKeys.set(key,file);
  const actual=existingPaths.get(key);
  if(actual&&actual!==file) {rows.push(`keep ${file} (project path alias: ${actual})`);return false;}
  const full=localPath(root,file);
  let ancestor=path.dirname(full);
  while(ancestor!==root) {if(fs.existsSync(ancestor)&&!fs.statSync(ancestor).isDirectory())throw new RunnerError(`Expected directory: ${file}`);ancestor=path.dirname(ancestor);}
  if(fs.existsSync(full)&&!fs.lstatSync(full).isFile())throw new RunnerError(`Expected regular file: ${file}`);
  if(!fs.existsSync(full)||!fs.readFileSync(full).equals(Buffer.from(bytes)))operations.push({file,bytes:Buffer.from(bytes),mode});
  return true;
 };
 if(!fs.existsSync(localPath(root,'input/answers.md'))) {add('input/answers.md',emptyAnswers);rows.push('add input/answers.md (empty PO answer source)');}
 for(const file of kitFiles(kit)) {
  if(file===configFile)continue;
  const key=pathCollisionKey(file),prior=sourceKeys.get(key);if(prior&&prior!==file)throw new RunnerError(`Kit path collision: ${prior} and ${file}`);sourceKeys.set(key,file);
  const aliases=file.split('/').map((_,i)=>file.split('/').slice(0,i+1).join('/')).map(prefix=>[prefix,existingPaths.get(pathCollisionKey(prefix))]).filter(([prefix,actual])=>actual&&actual!==prefix);
  if(aliases.length) {
   rows.push(`keep ${file} (project path alias: ${aliases.map(([,actual])=>actual).join(', ')})`);
   for(const actual of new Set(aliases.map(([,actual])=>actual)))rows.push(`keep ${actual} (modified or unknown obsolete file; project path alias of ${file})`);
   continue;
  }
  const bytes=read(kit,file),full=localPath(root,file),changed=!fs.existsSync(full)||!fs.readFileSync(full).equals(bytes);
  files[file]=sha256(bytes);rows.push(`${changed?'replace':'keep'} ${file}${changed&&!previous?' (unknown kit bytes)':''}`);
  add(file,bytes,fs.statSync(localPath(kit,file)).mode&0o777);
 }
 for(const file of new Set([...Object.keys(previous?.files??{}),...kitFiles(root)])) {
  if(file===configFile||Object.hasOwn(files,file)||sourceKeys.has(pathCollisionKey(file))||!fs.existsSync(localPath(root,file)))continue;
  if(consistentLock(previous)&&previous.files[file]===sha256(read(root,file))) {operations.push({file,bytes:null});rows.push(`remove ${file} (unchanged installing-kit bytes)`);}
  else rows.push(`keep ${file} (modified or unknown obsolete file)`);
 }
 if(!merged.gates.definitions_dir.startsWith('review/'))throw new RunnerError('Upgrade definitions_dir must be within review/; protected project trees cannot be modified');
 for(const stage of STAGES) {
  const binding=merged.gates.stage_definitions[stage];
  const file=`${merged.gates.definitions_dir}/${binding.id}/${binding.version}.json`;
  const inputs=[...new Set([...merged.stages[stage].context,'tools/agents/','tools/run/agent-timeouts.mjs','tools/run/process-tree.mjs'])];
  const definition=gateDefinition(merged,stage,{inputs,outputs:declaredOutputs(kit,stage)});
  const existing=fs.existsSync(localPath(root,file))?parseJson(read(root,file).toString(),file):null;
  if(existing&&equal(existing,definition)) {rows.push(`keep definition ${file}`);continue;}
  if(existing) {
   const directory=localPath(root,`${merged.gates.definitions_dir}/${binding.id}`);
   const versions=fs.readdirSync(directory).filter(name=>/^\d+\.json$/.test(name)).map(name=>Number(name.slice(0,-5)));
   if(!/^\d+$/.test(binding.version)||versions.some(v=>!Number.isSafeInteger(v)))throw new RunnerError(`Cannot increment definition version: ${file}`);
   const version=Math.max(Number(binding.version),...versions)+1;
   if(!Number.isSafeInteger(version))throw new RunnerError(`Cannot increment definition version: ${file}`);
   binding.version=String(version);definition.version=binding.version;definition.scope.revision=definitionRevision(definition);
  }
  const destination=`${merged.gates.definitions_dir}/${binding.id}/${binding.version}.json`;
  if(fs.existsSync(localPath(root,destination)))throw new RunnerError(`Definition version exists: ${destination}`);
  validateSchema(definition,schema('gate-definition.schema.json'),destination);
  for(const file of [...definition.inputs,...definition.outputs])localPath(root,file);
  add(destination,canonical(definition)+'\n');rows.push(`new definition ${destination}`);
  if(existing)rows.push(`config gates.stage_definitions.${stage}.version: new-definition-version`);
 }
 const configBytes=jsonConfig?Buffer.from(editYaml(read(kit,configFile).toString(),merged)):equal(current,merged)?originalConfig:Buffer.from(editYaml(originalConfig.toString(),merged));
 if(jsonConfig)rows.push('repair config (written by previous upgrade)');
 if(add(configFile,configBytes))files[configFile]=sha256(configBytes);
 add(lockFile,canonical(kitRecord(kit,files,defaults,kitOwnedConfigDigest(configBytes)))+'\n');
 rows.push(`${operations.some(op=>op.file===lockFile)?'replace':'keep'} ${lockFile}`);
 return {operations,rows,legacy:!previous,snapshot:treeSnapshot(root)};
}
function treeSnapshot(root) {
 const entries=[];
 function walk(directory='') {for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
  const file=directory?`${directory}/${entry.name}`:entry.name;if(excluded(file)||file==='.kit-upgrade.lock')continue;
  const full=localPath(root,file),stat=fs.lstatSync(full);entries.push([file,stat.mode,entry.isDirectory()?null:sha256(fs.readFileSync(full))]);if(entry.isDirectory())walk(file);
 }}walk();return sha256(canonical(entries));
}

// All replacement bytes are staged before the first project mutation. Originals
// are renamed into the journal, so rollback also preserves modes and hardlinks.
export function applyUpgrade(root,plan,{afterMutation=()=>{}}={}) {
 root=fs.realpathSync(root);
 if(!activeLocks.has(root))return withUpgradeLock(root,()=>applyUpgrade(root,plan,{afterMutation}));
 const {operations,snapshot}=plan;
 if(snapshot&&snapshot!==treeSnapshot(root))throw new RunnerError('Upgrade plan is stale; project changed after planning');
 if(!operations.length)return;
 const staging=fs.mkdtempSync(path.join(path.dirname(root),'.kit-upgrade-'));
 const journal=[],directories=[],originals=[];let restored=true,cleaned=false;
 function mkdir(directory) {
  if(fs.existsSync(directory))return;
  mkdir(path.dirname(directory));fs.mkdirSync(directory);directories.push(directory);
 }
 try {
  for(const [index,op] of operations.entries()) {
   const file=localPath(root,op.file);
   originals[index]=fs.existsSync(file)?{bytes:fs.readFileSync(file),mode:fs.statSync(file).mode&0o777}:null;
   if(op.bytes!==null)fs.writeFileSync(path.join(staging,`new-${index}`),op.bytes,{mode:op.mode,flag:'wx'});
  }
  for(const [index,op] of operations.entries()) {
   const file=localPath(root,op.file),backup=path.join(staging,`old-${index}`);
   mkdir(path.dirname(file));const saved=fs.existsSync(file);
   if(saved)fs.renameSync(file,backup);
   const entry={file,backup,saved,written:false,original:originals[index],index};journal.push(entry);
   if(op.bytes!==null) {fs.renameSync(path.join(staging,`new-${index}`),file);entry.written=true;}
   afterMutation(op,index);
  }
  fs.rmSync(staging,{recursive:true,force:true});cleaned=true;
 }catch(error) {
  const failures=[];
  for(const entry of journal.reverse())try {
   if(entry.written)fs.unlinkSync(entry.file);
   if(entry.saved) {
    if(fs.existsSync(entry.backup))fs.renameSync(entry.backup,entry.file);
    else {
     // Cleanup can fail after removing some originals. Retained bytes provide
     // the same rollback even when a journal entry has already been deleted.
     fs.mkdirSync(staging,{recursive:true});const temporary=path.join(staging,`restore-${entry.index}`);
     fs.writeFileSync(temporary,entry.original.bytes,{mode:entry.original.mode,flag:'wx'});fs.chmodSync(temporary,entry.original.mode);fs.renameSync(temporary,entry.file);
    }
   }
  }catch(e){failures.push(e.message);}
  for(const directory of directories.reverse())try {fs.rmdirSync(directory);}catch(e){failures.push(e.message);}
  if(failures.length) {restored=false;throw new RunnerError(`Upgrade rollback failed; originals retained at ${staging}: ${failures.join('; ')}`,4);}
  throw error;
 }finally {if(restored&&!cleaned)fs.rmSync(staging,{recursive:true,force:true});}
}

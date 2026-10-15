import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {STAGES} from '../lib/config/config-loader.mjs';
import {sha256} from '../lib/config/path-selection.mjs';
import {nodeCommand} from './process-observation.mjs';

const {command}=await import('../../fixtures/runner/project-fixture.mjs');   // kit-only fixtures/: run-evals loads this module only after confirming the kit checkout

export function snapshot(p) {
  const files={};
  function walk(relative) {
    const absolute=path.join(p.root,relative);
    if(!fs.existsSync(absolute))return;
    for(const entry of fs.readdirSync(absolute,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file=`${relative}/${entry.name}`;
      if(entry.isDirectory())walk(file);
      else if(entry.isFile()) files[file]=sha256(fs.readFileSync(path.join(p.root,file)));
    }
  }
  for(const directory of ['input','spec','review','config'])walk(directory);
  return files;
}
export function behaviorContext(repo,p,meta) {
  const operations=[],observations=[];
  const read=file=>fs.readFileSync(path.join(p.root,file),'utf8');
  const json=file=>JSON.parse(read(file));
  const check=(id,actual,expected)=>{
    const passed=JSON.stringify(actual)===JSON.stringify(expected);
    observations.push({id,actual,expected,passed});
    assert.deepEqual(actual,expected,id);
  };
  const invoke=(operation,action)=>{
    try {const value=action();operations.push({operation,cwd:p.root,status:'RETURNED',value});return value;}
    catch(error){operations.push({operation,cwd:p.root,status:'REFUSED',exit:error.code??null,diagnostic:error.message});throw error;}
  };
  const run=(label,args=[])=>{
    const r=p.run(args);
    operations.push({operation:label,command:nodeCommand(path.join(repo,'tools/run/run.mjs'),'--project',p.root,'--head','fixture-head','--build','not-built',...args),cwd:p.root,exit:r.code,output:r.out});
    return r;
  };
  return {p,meta,read,json,check,invoke,run,operations,observations};
}
// Start a distinct control phase in the SAME selected case project. Keep the
// observed traversal as a backup; never overwrite selected candidate documents.
export function prepareControl(c,enabled=['prd'],settings={}) {
  const {p}=c;
  const epoch=c.operations.filter(row=>row.operation==='prepare-control').length;
  // OQ34: historical eval evidence is preserved outside the live project.
  c.backupRoot??=fs.mkdtempSync(path.join(os.tmpdir(),'eval-case-observed-'));
  const backup=path.join(c.backupRoot,`phase-${epoch}`);
  const original=Object.fromEntries(Object.entries(snapshot(p)).filter(([file])=>file.startsWith('review/')||file.startsWith('config/')));
  fs.cpSync(path.join(p.root,'review'),path.join(backup,'review'),{recursive:true});
  fs.cpSync(path.join(p.root,'config'),path.join(backup,'config'),{recursive:true});
  const backup_files=snapshot({root:backup});
  assert.deepEqual(backup_files,original,'Every original review/config byte is preserved');
  for(const dir of ['runtime','gates','receipts','freshness','candidates','decisions','exceptions','changes','packets','log']) {
    fs.rmSync(path.join(p.root,'review',dir),{recursive:true,force:true});
    fs.mkdirSync(path.join(p.root,'review',dir),{recursive:true});
  }
  fs.rmSync(path.join(p.root,'review/audit.jsonl'),{force:true});
  p.config.review.enabled=true;p.config.agents.writer.command=command(settings.writer??{});
  p.config.agents.reviewer.command=command(settings.reviewer??{});
  p.config.review.max_rounds=3;p.config.limits.max_fix_rounds=3;
  p.config.roles.po={enabled:true,gate:true,approvers:['po@example.test']};
  p.config.gates.scoped_definitions=[];
  for(const stage of STAGES) {
    p.config.stages[stage].enabled=enabled.includes(stage);
    p.config.stages[stage].context=['input/po-spec.md'];
    p.config.evals[stage]=[{run:command({eval:true}),per_file:`spec/behavior/${stage}.txt`}];
    const def=p.definitions[stage];
    def.inputs=['input/po-spec.md'];def.outputs=[`spec/behavior/${stage}.txt`];
    def.scope={kind:'stage',ids:[stage],revision:def.scope.revision};def.exceptions=[];
    p.write(def.outputs[0],`Generated ${stage}\n`);
  }
  p.write(p.config.gates.graph,{version:'1',complete:false,nodes:[{id:'req:case-source',kind:'req',source:'input/po-spec.md',revision:'1'}],edges:[]});
  p.save();c.operations.push({operation:'prepare-control',cwd:p.root,backup,backup_files,enabled,source_sha256:sha256(c.read('input/po-spec.md'))});
}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {plant} from '../self-test.mjs';
import {recordedControl} from '../recorded-controls.mjs';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';
import {stageHeadFixture} from '../../../fixtures/runner/stage-head-fixture.mjs';
import {headControls,headFixture} from '../../../fixtures/runner/evidence-head-controls.mjs';
import {censusControls,censusFixture} from '../../../fixtures/runner/dependency-census-controls.mjs';
import {amendmentControls,absentVersionHeads,changedMemberHeads} from '../../../fixtures/runner/amendment-controls.mjs';
import {observationControls} from '../../../fixtures/runner/observation-controls.mjs';
import {runtimeSelectionFixtures} from './runtime-selection-fixtures.mjs';

export const repo=fileURLToPath(new URL('../../../',import.meta.url));
const exportConfig={project:{spec_root:'.'}};
export function exportedFixture(relative) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'spec-census-parity-'));
  fs.cpSync(path.join(repo,relative),root,{recursive:true});
  return {root,config:exportConfig,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
function runnerFixture(make,alter=()=>{}) {
  const p=make();
  try {alter(p);return {...p,cleanup:()=>fs.rmSync(p.root,{recursive:true,force:true})};}
  catch(error){fs.rmSync(p.root,{recursive:true,force:true});throw error;}
}
const controls=JSON.parse(fs.readFileSync(path.join(repo,'fixtures/v2/broken/index.json'),'utf8')).entries;
export const parityFixtures=[
  ...runtimeSelectionFixtures,
  ...['full','minimal'].map(name=>({name:`fixtures/v2/${name}`,make:()=>exportedFixture(`fixtures/v2/${name}`)})),
  ...controls.map((name,index)=>({name:`fixtures/v2/broken/${name}`,broken:true,make:()=>({...plant(t=>recordedControl(index,t)),config:exportConfig})})),
  {name:'fixtures/v2/broken/cli-option.json',make:()=>exportedFixture('fixtures/v2/full')},
  {name:'fixtures/runner/project-fixture/default',make:()=>runnerFixture(()=>projectFixture(null))},
  {name:'fixtures/runner/batch-fixture/default',make:()=>runnerFixture(()=>batchFixture(null))},
  ...[false,true].flatMap(manual=>[false,true].map(reviewed=>({
    name:`fixtures/runner/stage-head-fixture/manual=${manual}/reviewed=${reviewed}`,
    make:()=>runnerFixture(()=>stageHeadFixture(null,{manual,reviewed}))}))),
  ...headControls.flatMap(([name,mutate])=>['red','restored'].map(state=>({
    name:`fixtures/runner/evidence-head-controls/${name}/${state}`,
    make:()=>{const {p,green}=headFixture(null,mutate);return runnerFixture(()=>p,()=>{if(state==='restored')green();});}}))),
  ...censusControls.flatMap(control=>['green','red','restored'].map(state=>({
    name:`fixtures/runner/dependency-census-controls/${control[0]}/${state}`,
    make:()=>{const f=censusFixture(null,control);return runnerFixture(()=>f.p,()=>{if(state==='red')f.attack();if(state==='restored'){f.attack();f.restore();}});}}))),
  ...amendmentControls.flatMap(([name,make])=>['red','restored'].map(state=>({
    name:`fixtures/runner/amendment-controls/${name}/${state}`,
    make:()=>{const f=make(null);return runnerFixture(()=>f.p,()=>{if(state==='restored')f.restore();});}}))),
  ...['rules','evaluator'].map(pin=>({name:`fixtures/runner/amendment-controls/absent-${pin}`,make:()=>runnerFixture(()=>absentVersionHeads(null,pin).p)})),
  {name:'fixtures/runner/amendment-controls/changed-member',make:()=>runnerFixture(()=>changedMemberHeads(null).p)},
  ...observationControls.map(([name,output])=>({name:`fixtures/runner/observation-controls/${name}`,make:()=>runnerFixture(()=>projectFixture(null),p=>p.write('answer.txt',output))})),
  {name:'fixtures/runner/provenance-sidecars',make:()=>runnerFixture(()=>batchFixture(null),p=>{
    p.config.project.spec_root='spec';p.save();
    for(const [input,output] of [['crosswalk.json','id-crosswalk.json'],['source-ledger.json','source-ledger.json']]) {
      const data=JSON.parse(fs.readFileSync(path.join(repo,'format/fixtures/source-provenance',input),'utf8'));
      if(input==='source-ledger.json')data.crosswalk='id-crosswalk.json';
      p.write(`spec/provenance/${output}`,data);
    }
    p.write('spec/source.txt','Source snapshot\n');
  })},
];

// Export fixtures and executable factory states are census inputs. Historical
// screenshots, transcripts and verification JSON are receipts, not spec trees.
export function fixtureFileInventory() {
  const files=[];
  function walk(directory) {
    for(const entry of fs.readdirSync(path.join(repo,directory),{withFileTypes:true})) {
      const file=directory+'/'+entry.name;
      if(entry.isDirectory())walk(file);else files.push(file);
    }
  }
  walk('fixtures/v2');walk('fixtures/runner');
  return files.sort().map(file=>({file,role:file.startsWith('fixtures/v2/full/')||file.startsWith('fixtures/v2/minimal/')?'export source':file.startsWith('fixtures/v2/broken/')?'recorded control':/\/(?:project-fixture|batch-fixture|stage-head-fixture|evidence-head-controls|dependency-census-controls|amendment-controls|observation-controls)\.mjs$/.test(file)?'instantiated factory':file.endsWith('.mjs')?'fixture support or evidence producer':'historical evidence receipt'}));
}

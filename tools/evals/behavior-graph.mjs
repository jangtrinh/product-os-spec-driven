import fs from 'node:fs';
import path from 'node:path';
import {loadRegistries} from '../run/registries.mjs';
import {invalidateGates} from '../run/invalidate-gates.mjs';
import {writeGate} from '../run/gate-files.mjs';
import {sha256} from '../lib/config/path-selection.mjs';
import {prepareControl} from './behavior-project.mjs';

const {certifiedFixtureGraph,graphReceipt}=await import('../../fixtures/runner/amendment-controls.mjs');   // kit-only fixtures/: run-evals loads this module only after confirming the kit checkout

export function graphControl(c,complete) {
  const {p,check,run,invoke,json,read}=c;
  prepareControl(c,['prd','us']);p.config.roles.po.enabled=false;
  for(const stage of ['prd','us']) {
    p.write(`source/${stage}.txt`,`${c.meta.name}: ${stage} observable case outcome`);
    p.config.stages[stage].context=[`source/${stage}.txt`];
    p.definitions[stage].inputs=[`source/${stage}.txt`];
  }
  p.write('spec/behavior/scenario.txt','Selected US-01.SCN-01-01 observes the local outcome');
  p.write('spec/behavior/screen.txt','Selected control screen S01/normal consumes local scenario');
  const nodes=[{id:'artifact:source/prd.txt',kind:'artifact',source:'source/prd.txt',revision:'1'},
    {id:'ac:US-01.AC-01',kind:'ac',source:'source/prd.txt',revision:'1'},
    {id:'scenario:US-01.SCN-01-01',kind:'scenario',source:'spec/behavior/scenario.txt',revision:'1'},
    {id:'screen-state:S01/normal',kind:'screen-state',source:'spec/behavior/screen.txt',revision:'1'},
    {id:'ac:US-01.AC-02',kind:'ac',source:'source/us.txt',revision:'1'}];
  const edges=[['artifact:source/prd.txt','ac:US-01.AC-01','derives'],['ac:US-01.AC-01','scenario:US-01.SCN-01-01','verifies'],['scenario:US-01.SCN-01-01','screen-state:S01/normal','implements']].map(([from,to,relation])=>({from,to,relation,source:'source/prd.txt',revision:'1'}));
  p.write(p.config.gates.graph,{version:'1',complete,nodes,edges});p.save();
  check('establish prior eligible gates',run('establish-graph-gates').code,0);
  const receiptId=p.gate('prd').data.model.receipts[0];
  const receipt=json(`review/receipts/${receiptId}.json`);
  const gate=p.gate('prd');gate.data.model.receipts.push('case-graph-proof');writeGate(p.root,p.config,'prd','NOT_REQUIRED',gate.data);
  const graph={version:'1',complete,nodes,edges};
  invoke('materialize-case-graph-observation',()=>graphReceipt(p,receipt,'case-graph-proof'));
  const proof=invoke('materialize-and-certify-case-census',()=>certifiedFixtureGraph(p,graph,receipt,'case-graph-proof'));
  check('proof binds actual certified case graph',proof.artifacts[p.config.gates.graph],sha256(read(p.config.gates.graph)));
  const revision=sha256(read(p.config.gates.graph));
  for(const stage of ['prd','us']) {
    const current=p.gate(stage);current.data.inputs[p.config.gates.graph]=revision;
    writeGate(p.root,p.config,stage,'NOT_REQUIRED',current.data);
  }
  const independent=p.gate('us').raw,original=read(`review/receipts/${receiptId}.json`);
  p.write('source/prd.txt',`${c.meta.name}: changed local acceptance outcome`);
  const result=invoke('reopen-affected-case-gates',()=>{
    const value=invalidateGates(p.root,p.config,loadRegistries(p.root,p.config),{head:'fixture-head',build:'not-built'});
    return {complete:value.impact.complete,impact:value.impact.impact,invalidated:[...value.invalidated]};
  });
  check('census completeness decision',result.complete,complete);
  if(complete) {
    check('local gate reopened',result.invalidated,['prd']);
    check('dependent scenario and screen affected',result.impact.some(row=>row.node==='scenario:US-01.SCN-01-01')&&result.impact.some(row=>row.node==='screen-state:S01/normal'),true);
    check('proved independent scope retained',p.gate('us').raw,independent);
  } else {
    check('incomplete census broadens reopening',result.invalidated,['prd','us']);
    check('downstream BR-14 fallback explicit',p.gate('us').data.invalidation.reason.includes('BR-14 fallback'),true);
  }
  check('old local receipt stale',json(`review/freshness/${receiptId}.json`).freshness,'STALE');
  check('immutable receipt bytes preserved',read(`review/receipts/${receiptId}.json`),original);
}

import {definitionRevision} from '../../lib/definition-scope.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,hash} from '../../lib/digests.mjs';
import {declaredFixtureGraph} from './declared-graph-fixture.mjs';

const checkout=fileURLToPath(new URL('../../../',import.meta.url));
const modes=['independent','declared-ac-missing','declared-ac-restored','declared-us-missing','missing-req','missing-decisions','missing-amendments','missing-screen','missing-board','missing-ui-contract','missing-scenario','missing-transitive'];
for(const mode of modes) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'spec-census-matrix-'));
  fs.cpSync(path.join(checkout,'fixtures/v2/full'),root,{recursive:true});
  const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
  const write=(file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+'\n');};
  try {
    const source=path.join(root,'us/US-01.md');
    if(mode.startsWith('declared-'))fs.writeFileSync(source,fs.readFileSync(source,'utf8').replace('  req: [REQ-01]','  req: [REQ-01]\n  '+(mode==='declared-us-missing'?'us: [US-02]':'ac: [US-02.AC-01]')));
    const artifacts={'us/US-01.md':hash(fs.readFileSync(source))},member={kind:'ac',id:'US-01.AC-01',artifacts,revision:digest(artifacts)};
    const membership={version:'1',members:[member]},scope={kind:'ac',ids:[member.id],revision:digest([member])};
    const dir='assets/records/packets',old=fs.readdirSync(path.join(root,dir))[0],packet=read(`${dir}/${old}/packet-data.json`),receipt=read('assets/receipt.json');
    packet.membership=membership;packet.scope=scope;packet.candidate.manifest=digest(membership);
    receipt.artifacts=artifacts;receipt.scope=scope;receipt.pins={...packet.candidate,head:'prior-head'};write('assets/receipt.json',receipt);
    const definition=read('assets/records/definitions/story/1.json');definition.scope={...scope};definition.scope.revision=definitionRevision(definition);write('assets/records/definitions/story/1.json',definition);
    const gate=read('assets/records/gates/story.json');gate.scope=definition.scope;gate.candidate=packet.candidate;write('assets/records/gates/story.json',gate);
    fs.rmSync(path.join(root,'assets/records/candidates'),{recursive:true});write(`assets/records/candidates/${digest(membership)}.json`,membership);
    packet.evidence=[receipt];packet.change.propagation.forEach(row=>{row.status='verified';row.evidence=[receipt.id];});
    packet.change.impact=[{node:'ac:US-02.AC-01',domain:'spec',classification:'direct',reason:'Changed another member',path:['us:US-02','ac:US-02.AC-01']}];
    const id='packet-'+digest(packet);fs.rmSync(path.join(root,dir,old),{recursive:true});write(`${dir}/${id}/packet-data.json`,packet);
    const decision=read('assets/records/decisions/decision-1.json');Object.assign(decision,{packet_id:id,data_sha256:digest(packet),scope,pins:packet.candidate,default:'approve',overrides:[]});write('assets/records/decisions/decision-1.json',decision);
    const manifest=read('spec.manifest.json');manifest.gate_model.changes=[];write('spec.manifest.json',manifest);
    const graph=declaredFixtureGraph(root);
    const omitted={
      'declared-ac-missing':['ac:US-02.AC-01','artifact:us/US-01.md'],
      'declared-us-missing':['us:US-02','artifact:us/US-01.md'],
      'missing-req':['req:REQ-01','artifact:us/US-01.md'],
      'missing-decisions':['decision:D1','artifact:us/US-01.md'],
      'missing-amendments':['contract:fc-001','amendment:fc-001.A-01'],
      'missing-screen':['us:US-01','screen-state:S01/normal'],
      'missing-board':['us:US-01','board:W-01'],
      'missing-ui-contract':['screen-state:S01/normal','scenario:US-01.SCN-01-01'],
      'missing-scenario':['ac:US-01.AC-01','scenario:US-01.SCN-01-01'],
      'missing-transitive':['amendment:fc-001.A-01','artifact:decisions/decision-log.md'],
    }[mode];
    if(omitted){const before=graph.edges.length;graph.edges=graph.edges.filter(e=>e.from!==omitted[0]||e.to!==omitted[1]);assert.ok(graph.edges.length<before,`${mode} must remove its declared edge`);}
    write('assets/graph.json',graph);
    for(const cwd of [checkout,root]) {
      const result=spawnSync(process.execPath,[path.join(checkout,'tools/lint/lint.mjs'),root,'--json'],{cwd,encoding:'utf8'});
      const output=JSON.parse(result.stdout),codes=[...new Set(output.problems.map(p=>p.code))],expected=mode==='independent'?0:1;
      console.log(JSON.stringify({mode,node:process.execPath,cwd,exit:result.status,expected,codes}));
      if(result.status!==expected||expected===1&&!codes.includes('Q-DECISION'))process.exitCode=1;
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}

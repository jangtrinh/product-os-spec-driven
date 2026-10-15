import {definitionRevision} from '../lib/definition-scope.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {canonical} from '../lib/config/strict-json.mjs';
import {sha256} from '../lib/config/path-selection.mjs';
import {prepareControl} from './behavior-project.mjs';
import {loadPacketSpec} from '../reader/packet/spec-context.mjs';
import {buildPacketData} from '../reader/packet/packet-data.mjs';
import {makeSupportBinder} from '../reader/packet/source-binding.mjs';
import {composedPromptFiles} from '../run/composed-prompt-files.mjs';

// Case-bound fixture plumbing only. Import, propagation and delivery rules stay
// in their existing runner owners; synthetic receipts confer no product quality.
export function preparePacket(c) {
  const {p,run,check,read}=c;prepareControl(c);
  check('packet starts at human checkpoint',run('establish-case-packet-gate').code,2);
  const raw=fs.readFileSync(new URL('../../format/fixtures/review-packet/packet-data.json',import.meta.url),'utf8');
  const packet=JSON.parse(raw.replaceAll('US-16','US-01').replaceAll('SCN-16','SCN-01'));
  packet.change.id=`CS-${c.meta.name}`;
  const artifacts=Object.fromEntries(['input/po-spec.md','spec/us/US-01.md'].map(file=>[file,sha256(read(file))]));
  const ids=['US-01.AC-01','US-01.AC-02'],scenarios=['US-01.SCN-01-01','US-01.SCN-01-02'];
  const membership={version:'1',members:ids.map(id=>({kind:'ac',id,revision:sha256(canonical(artifacts)),artifacts}))};
  const digest=sha256(canonical(membership));
  packet.membership=membership;packet.scope={kind:'ac',ids,revision:sha256(canonical(membership.members))};
  packet.baseline={head:'baseline-head',base:'baseline-head',build:'not-built',manifest:sha256('case baseline')};
  packet.candidate={head:p.gate('prd').data.model.candidate.head,base:'baseline-head',build:'not-built',manifest:digest};
  p.config.gates.baseline='review/baseline.json';p.write(p.config.gates.baseline,{id:'baseline-1',head:packet.baseline.head,manifest:packet.baseline.manifest});
  p.write(`review/candidates/${digest}.json`,membership);
  const receipt=packet.evidence[0];
  receipt.scope=packet.scope;receipt.pins={...packet.candidate,rules:p.config.versions.ruleset,evaluator:p.config.agents.reviewer.command};receipt.domain='spec';
  receipt.artifacts={...artifacts};
  for(const file of [p.config.review.rubric,...composedPromptFiles('reviewer')])receipt.artifacts[file]=sha256(read(file));
  receipt.review.evaluator_version=p.config.agents.reviewer.command;
  receipt.review.ruleset_version=p.config.versions.ruleset;receipt.review.prompt_version=p.config.versions.templates;
  receipt.coverage={ac:ids,passed:ids,scenarios,na:[]};receipt.review.inputs=Object.keys(artifacts);
  receipt.review.criteria.push({id:'semantic-propagation',mandatory:true,score:2,evidence:'Deterministic case source AC and selected scenario control; product review NOT_RUN'});
  receipt.execution.command='Case-bound synthetic eligibility control; not product/model verification';receipt.execution.cwd='.';
  p.write('review/receipts/fixture-receipt.json',receipt);
  packet.change.propagation[0].ac=ids;packet.change.propagation[0].scenario=scenarios;
  packet.change.propagation[0].status='verified';
  packet.requests=ids.map(id=>({id,reason:'Review exact selected case AC'}));
  packet.decisions=[{id:'D1',source:'input/po-spec.md',text:'Synthetic PO control; no actual owner acceptance'}];
  for(const [index,id] of ids.entries()) {
    const scope={kind:'ac',ids:[id]};
    const definition={...p.definitions.prd,id:`case-scope-${index}`,scope};
    scope.revision=definitionRevision(definition);
    p.write(`review/definitions/${definition.id}/1.json`,definition);p.config.gates.scoped_definitions.push({id:definition.id,version:'1'});
    const model={...p.gate('prd').data.model,definition:{id:definition.id,version:'1'},scope,candidate:packet.candidate,receipts:['fixture-receipt']};
    p.write(`review/gates/scoped/${definition.id}/${scope.revision}.json`,model);
  }
  const change={id:packet.change.id,baseline:packet.baseline,candidate:packet.candidate,scope:packet.scope,source:packet.change.source,reason:packet.change.reason,state:'Reviewed',impact:packet.change.impact,propagation:packet.change.propagation,po_decision:null,regates:['case-scope-0','case-scope-1'],packet:null,receivers:[]};
  p.write(`review/changes/${change.id}.json`,change);
  const decision={id:'case-decision',packet_id:'',data_sha256:'',scope:packet.scope,pins:packet.candidate,by:'po@example.test',at:new Date().toISOString(),default:'approve',reason:'Synthetic case authority asserted locally; not owner approval',overrides:[],exceptions:[]};
  const save=()=>{
    const digest=sha256(canonical(packet));decision.packet_id=`packet-${digest}`;decision.data_sha256=digest;
    p.write('packet-data.json',packet);p.write('decision.json',decision);p.save();
  };
  // packet-interchange §§3/7 and import-decision:52-53 require the exact
  // owner-built projection of current selected source and registries.
  const rebuild=()=>{
    const specRoot=p.config.project.spec_root,snapshotDir=path.join(p.root,specRoot);
    const spec=loadPacketSpec(snapshotDir),support=makeSupportBinder({snapshotDir,specRoot});
    Object.assign(packet,buildPacketData({root:p.root,config:p.config,changeId:change.id,spec,specRoot,support}).data);
    save();
  };
  rebuild();
  const importBatch=(label,extra=[])=>run(label,['--import-decision','decision.json','--packet-data','packet-data.json','--as','po@example.test',...extra]);
  const states=()=>p.config.gates.scoped_definitions.map(binding=>{
    const def=c.json(`review/definitions/${binding.id}/1.json`);
    return c.json(`review/gates/scoped/${def.id}/${def.scope.revision}.json`).states.human;
  });
  return {packet,decision,change,save,rebuild,importBatch,states};
}

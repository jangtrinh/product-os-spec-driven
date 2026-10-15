import fs from 'node:fs';
import { parseJson } from '../lib/json-strict.mjs';
import { canonical,digest,hash } from '../lib/digests.mjs';
import { localPath } from '../lib/local-path.mjs';
import { receiptRules } from './rules-receipts.mjs';
import { targetArtifactsMatch } from './record-targets.mjs';
import { packetApproval } from './packet-approval.mjs';
export function packetRules(model,P,records) {
  const valid=new Map(model.receiptValidity);
  const add=(code,file,msg)=>P.add(code,file,1,msg,'regenerate the packet/decision from current pinned membership');
  for(const {file,value:p} of records.packets) {
    for(const r of p.evidence || [])valid.set(r,receiptRules(model,P,file,r) && valid.get(r)!==false);
    const id=`packet-${digest(p)}`;
    if(!file.endsWith(`/packets/${id}/packet-data.json`)) add('Q-PACKET',file,'packet path differs from canonical payload digest');
    if(JSON.stringify(p.requests?.map(x=>x.id))!==JSON.stringify(p.scope?.ids)) add('Q-PACKET',file,'request set differs from enumerated scope');
    if(p.candidate?.manifest!==digest(p.membership)) add('Q-SCOPE',file,'candidate manifest digest differs from membership');
    const members=p.membership?.members || [],selected=members.filter(m=>m.kind===p.scope?.kind && p.scope.ids.includes(m.id));
    if(selected.length!==p.scope?.ids.length || digest(selected)!==p.scope?.revision || new Set(members.map(m=>`${m.kind}:${m.id}`)).size!==members.length) add('Q-SCOPE',file,'scope membership/revision incomplete');
    for(const m of members) {
      if(['ac','us'].includes(m.kind) && !targetArtifactsMatch(model,m.artifacts,m.kind,m.id))add('Q-SCOPE',file,`member lacks original target source bytes ${m.id}`);
      if(m.revision!==digest(m.artifacts)) add('Q-SCOPE',file,`member artifact revision differs ${m.id}`);
      for(const [path,sha] of Object.entries(m.artifacts || {})) try{if(hash(fs.readFileSync(localPath(model.spec.root,path)))!==sha) add('Q-FRESHNESS',file,`member bytes changed ${path}`);}catch(e){add('Q-FRESHNESS',file,e.message);}
    }
    const closure=p.change?.closure;
    if(!closure || closure.complete ? closure?.fallback!==null : closure?.fallback===null) add('Q-IMPACT',file,'incomplete closure requires fallback boundary');
    for(const id of p.aggregate_checks || []) if(!p.evidence?.some(r=>r.id===id)) add('Q-PACKET',file,`aggregate receipt ${id} missing`);
    for(const [path,sha] of Object.entries(p.assets || {})) try{if(hash(fs.readFileSync(localPath(model.spec.root,path)))!==sha) add('Q-RECEIPT',file,`packet asset bytes changed ${path}`);}catch(e){add('Q-RECEIPT',file,e.message);}
  }
  for(const {file,value:d} of records.decisions) {
    const packet=records.packets.find(p=>`packet-${digest(p.value)}`===d.packet_id)?.value;
    if(!packet || digest(packet)!==d.data_sha256 || canonical(d.pins)!==canonical(packet.candidate) || canonical(d.scope)!==canonical(packet.scope)) add('Q-DECISION',file,'decision packet/digest/pins/scope differs');
    if(model.options.pipelineConfig) {
      const config=model.options.pipelineConfig;
      if(!Array.isArray(config.roles?.po?.approvers) || !config.roles.po.approvers.includes(d.by)) add('Q-DECISION',file,'decider is not a configured PO approver');
      try { const baseline=parseJson(fs.readFileSync(localPath(model.options.projectRoot,config.gates?.baseline),'utf8')); if(!baseline.id || baseline.head!==packet?.baseline?.head || baseline.manifest!==packet?.baseline?.manifest || d.pins.base!==baseline.head) add('Q-HANDOFF-PINS',file,'configured immutable baseline differs'); }catch(e){add('Q-DECISION',file,e.message);}
    }
    const seen=new Set();for(const o of d.overrides || []) {if(seen.has(o.id) || !d.scope?.ids?.some(id=>id===o.id || id.startsWith(`${o.id}.AC-`))) add('Q-DECISION',file,`unknown/duplicate override ${o.id}`);seen.add(o.id);}
    for(const id of d.exceptions || []) if(!records.exceptions.some(e=>e.value.id===id && e.value.status==='active' && e.value.at<=d.at && e.value.expires>d.at)) add('Q-EXCEPTION',file,'decision exception missing/expired');
    packetApproval(model,P,file,d,packet,valid);
  }
}

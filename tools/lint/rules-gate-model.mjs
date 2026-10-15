import { prepareReceiptHeads } from './receipt-supersession.mjs';
import { eligibleCurrentReceipts,reviewReceipts } from './current-receipts.mjs';
import { graphJoins } from './rules-graph-joins.mjs';
import fs from 'node:fs';
import { readPayload } from './rules-design.mjs';
import { localPath } from '../lib/local-path.mjs';
import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
import { digest,hash } from '../lib/digests.mjs';
import { recordRules } from './rules-gate-records.mjs';
import { recordAccounting } from './record-accounting.mjs';
export function gateRules(model,P) {
  model.receipts=[];model.changeSets=[];
  const gate=model.manifest.gate_model;
  const add=(code,file,msg)=>P.add(code,file || 'spec.manifest.json',1,msg,'repair exported gate records and exact-version source joins');
  if(gate) {
    const graphErrors=P.errors.length;
    model.graph=readPayload(model,P,gate.graph,'dependency-graph','M-GATE-MODEL');
    const graph=model.graph;
    if(graph) {
      graphJoins(model,P,gate.graph,graph);
      const ids=new Set();model.reverse={};
      for(const n of graph.nodes || []) {
        if(ids.has(n.id) || !n.id.startsWith(n.kind+':')) add('Q-GRAPH',gate.graph,`duplicate or unnamespaced node ${n.id}`);ids.add(n.id);
        const target=n.id.slice(n.kind.length+1);
        if(n.kind==='us' && !model.stories.some(s=>s.doc.id===target) || n.kind==='req' && !model.reqs.some(r=>r.id===target)) add('Q-GRAPH',gate.graph,`unresolved node ${n.id}`);
      }
      for(const e of graph.edges || []) {
        if(!ids.has(e.from) || !ids.has(e.to)) add('Q-GRAPH',gate.graph,`edge endpoint missing ${e.from} -> ${e.to}`);
        (model.reverse[e.to] ||= []).push(e.from);
      }
    }
    model.graphValid=P.errors.length===graphErrors;
    for(const file of gate.receipts || []) {const r=readPayload(model,P,file,'evidence-receipt','Q-RECEIPT');if(r) model.receipts.push({file,value:r});}
    for(const file of gate.changes || []) {
      const d=model.docs.find(d=>d.rel===file && d.type==='change-set');
      const payload=d?d.fm.data:file;
      const value=readPayload(model,P,payload,'change-set','Q-CHANGESET');if(value) model.changeSets.push({file:payload,value});
    }
  }
  for(const file of model.manifest.design?.evidence || []) if(!model.receipts.some(r=>r.file===file)) {const r=readPayload(model,P,file,'evidence-receipt','Q-RECEIPT');if(r)model.receipts.push({file,value:r});}
  model.receiptValidity=new Map();
  model.qRecords={checked:0,notRun:!gate?.records};
  if(gate?.records) recordRules(model,P,gate.records);
  else {prepareReceiptHeads(model,P);recordAccounting(model,P);}
  for(const {file,value:c} of model.changeSets) {
    const terminal=['Approved','Published','Acknowledged','Switched'].includes(c.state);
    if(terminal && (!c.po_decision || !c.candidate || !c.packet)) add('Q-CHANGESET',file,'accepted Change Set requires candidate/PO decision/packet');
    if(['Acknowledged','Switched'].includes(c.state) && (!c.receivers?.length || c.receivers.some(r=>!r.acknowledgment || c.state==='Switched' && !r.switch))) add('Q-CHANGESET',file,'publication does not establish receiver acknowledgment/switch');
    if(!model.graph?.complete && terminal && !c.regates?.length) add('Q-IMPACT',file,'incomplete graph requires conservative re-gates');
    for(const impact of c.impact || []) {
      if(impact.classification==='unknown' && terminal && !c.regates?.length) add('Q-IMPACT',file,'unknown closure cannot preserve approval');
      for(const id of impact.path || []) if(!model.graph?.nodes?.some(n=>n.id===id)) add('Q-IMPACT',file,`unknown impact path ${id}`);
    }
    for(const row of c.propagation || []) {
      if(terminal && (row.status!=='verified' || !row.evidence?.length)) add('Q-PROPAGATION',file,'reapproval requires reviewed current semantic propagation');
      for(const ac of row.ac || []) if(!model.stories.some(s=>s.ac.rows.some(a=>`${s.doc.id}.${a.id}`===ac)) && !model.contractDocs.some(d=>d.body.includes(ac.split('.').at(-1)) && d.id===ac.split('.')[0])) add('Q-PROPAGATION',file,`unknown AC ${ac}`);
      for(const scn of row.scenario || []) if(!model.stories.some(s=>s.doc.fm.scenarios?.some(x=>`${s.doc.id}.${x.id}`===scn))) add('Q-PROPAGATION',file,`unknown owning scenario ${scn}`);
      for(const ui of row.ui || [])if(!model.inventory?.screens?.some(r=>`${r.screen}/${r.state}`===ui) && !ui.startsWith('not-applicable:'))add('Q-PROPAGATION',file,`unknown UI context ${ui}`);
      if(terminal) {
        const targets=[...(row.ac || []).map(id=>['ac',id]),...(row.scenario || []).map(id=>['scn',id])];
        if(!targets.length && ['ac','us'].includes(c.scope.kind))targets.push(...c.scope.ids.map(id=>[c.scope.kind,id]));
        const eligible=new Set();
        if(!targets.length)add('Q-PROPAGATION',file,'terminal propagation lacks resolvable original review targets');
        for(const [kind,id] of targets) {
          const heads=eligibleCurrentReceipts(model,reviewReceipts(model),kind,id,c.candidate,undefined,model.receiptValidity,{scope:c.scope});
          heads.forEach(r=>eligible.add(r));
          if(!heads.length || !heads.some(r=>model.receipts.some(x=>x.value===r) && row.evidence.includes(r.id)))add('Q-PROPAGATION',file,`${id}: terminal propagation requires eligible head source-bound receipt`);
        }
        for(const ref of row.evidence)if(!model.receipts.some(x=>x.value.id===ref && eligible.has(x.value)))add('Q-PROPAGATION',file,`superseded or unrelated propagation receipt ${ref}`);
      }
      for(const id of row.evidence || []) if(!model.receipts.some(r=>r.value.id===id && (!terminal || r.value.freshness==='CURRENT'))) add('Q-PROPAGATION',file,`missing/current receipt ${id}`);
    }
  }
}

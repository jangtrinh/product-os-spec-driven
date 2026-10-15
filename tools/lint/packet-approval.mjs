import { eligibleCurrentReceipts,reviewReceipts } from './current-receipts.mjs';
export function effectiveApprovals(d) {
  return (d.scope?.ids || []).filter(id=>{
    const exact=d.overrides?.find(o=>o.id===id),us=d.overrides?.find(o=>o.id===id.split('.')[0]);
    return (exact?.decision || us?.decision || d.default)==='approve';
  });
}
export function packetApproval(model,P,file,d,p,valid) {
  const approved=effectiveApprovals(d);
  if(!p || !approved.length)return;
  const add=message=>P.add('Q-DECISION',file,1,message,'restore current independent source evidence and clear blockers for each effective approved member');
  if(p.open.some(o=>o.blocking))add('approval cannot accept blocking OPEN');
  if(p.findings.some(f=>['open','accepted-minor'].includes(f.disposition) && (f.severity!=='Minor' || f.disposition!=='accepted-minor' || !f.accepted_by || !f.follow_up)))add('approval cannot accept unresolved quality findings');
  for(const id of approved) {
    const member=p.membership.members.find(m=>m.kind==='ac' && m.id===id);
    const receipts=reviewReceipts(model,p.evidence);
    const evidence=member?eligibleCurrentReceipts(model,receipts,'ac',id,p.candidate,member.artifacts,valid,{membership:p.membership,scope:p.scope}).filter(r=>p.evidence.includes(r)):[];
    if(!evidence.length)add(`${id}: approval needs CURRENT head independent eligible source-bound evidence in every applicable domain`);
    const propagation=p.change.propagation.filter(r=>!r.ac.length || r.ac.includes(id));
    const impacted=p.change.impact.some(x=>x.classification==='unknown' || x.node===`ac:${id}` || x.node===`us:${id.split('.')[0]}`);
    if(impacted && !propagation.length)add(`${id}: affected member lacks its propagation row`);
    for(const row of propagation) {
      if(row.status!=='verified' || !row.evidence.length || row.evidence.some(ref=>!evidence.some(r=>r.id===ref)))add(`${id}: approval cannot accept unverified propagation/current evidence`);
    }
    for(const ref of p.aggregate_checks) {
      const r=p.evidence.find(r=>r.id===ref);
      if(!r || !evidence.includes(r))add(`${id}: aggregate check ${ref} lacks current head eligible source-bound evidence`);
    }
  }
}

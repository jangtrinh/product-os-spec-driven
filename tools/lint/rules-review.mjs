export function reviewRules(P,file,r,eligible=false) {
  if(!r) return;
  const add=msg=>P.add('Q-REVIEW',file,1,msg,'obtain a fresh independent review of original sources and AC');
  const criteria=r.criteria || [],applicable=criteria.filter(c=>(c.applicability || 'applicable')==='applicable'),remaining=(r.findings || []).filter(f=>['open','accepted-minor'].includes(f.disposition));
  const verdict=!applicable.length?'NOT_RUN':applicable.some(c=>c.score===0)?'FAIL':applicable.some(c=>c.score===1)||remaining.length?'NEEDS_CHANGES':'PASS';
  if(r.verdict!==verdict && !['BLOCKED','NOT_RUN'].includes(r.verdict)) add(`declared ${r.verdict} differs from computed ${verdict}`);
  if(eligible && (!['PASS','NEEDS_CHANGES'].includes(r.verdict) || !r.independent || r.builder===r.reviewer || !r.inputs?.length || !applicable.length || applicable.some(c=>c.mandatory && c.score!==2) || remaining.some(f=>f.severity!=='Minor' || f.disposition!=='accepted-minor'))) add('eligible observation lacks independent review or mandatory quality');
  if(new Set(criteria.map(c=>c.id)).size!==criteria.length || new Set((r.findings || []).map(f=>f.id)).size!==(r.findings || []).length)add('duplicate criterion/finding identity');
  for(const f of r.findings || []) if(!criteria.some(c=>c.id===f.criterion) || f.disposition==='accepted-minor' && (f.severity!=='Minor' || !f.accepted_by || !f.reason || !f.follow_up) || ['fixed','rejected'].includes(f.disposition) && !f.reason) add('finding disposition is incomplete or contradicts severity');
}

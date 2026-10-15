import { parseAcTable,parseReqs,parseDecisions } from '../lib/structure.mjs';
export function counts(docs){
 const byType={};let ac=0,req=0,decisions=0;
 for(const doc of docs){const d={...doc,fm:doc.data||{}};byType[doc.data?.type||'untyped']=(byType[doc.data?.type||'untyped']||0)+1;
  if(doc.data?.type==='us')ac+=parseAcTable(d).rows.length;
  if(doc.data?.type==='prd')req+=parseReqs(d).length;
  if(doc.data?.ledger)decisions+=parseDecisions(d).length;
 }return {by_type:byType,stories:byType.us||0,acceptance_criteria:ac,requirements:req,decisions};
}
export function reportMarkdown(report,date){
 return `---\nid: migration-report\ntype: note\ntitle: Migration evidence\nupdated: ${date}\n---\n\n## Verification boundary\n\n${report.success?'Local structural migration passed.':'Migration blocked; this tree is reviewable output and cannot be accepted.'}\n\nFull machine evidence: [migration-report.json](migration-report.json). Historical source and receipts establish no current approval.\n\n| Check | Result |\n|---|---|\n| Input SHA256 | ${report.source_sha256} |\n| Source files preserved | ${report.source_files} |\n| Input unchanged | ${report.input_unchanged} |\n| Lint errors | ${report.lint.errors} |\n| Lint warnings | ${Object.values(report.lint.warnings).reduce((s,n)=>s+n,0)} |\n| Migration blockers | ${report.blockers.length} |\n| Role views | NOT RUN — reader v2 unavailable at migration baseline |\n\n## Separate numerators\n\nSource preservation, typed mapping and QA conformance testing remain distinct. No imported historical evidence is promoted to CURRENT.\n`;
}

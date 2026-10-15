import { loadSpec } from '../lib/spec-load.mjs';
import { buildModel } from '../lib/doc-model.mjs';
import { checkSchemas } from '../lib/schema-lite.mjs';
import { Problems } from './problems.mjs';
import { manifestRules } from './rules-manifest.mjs';
import { docRules } from './rules-docs.mjs';
import { structureRules } from './rules-structure.mjs';
import { linkRules,readableRules } from './rules-links.mjs';
import { blockHistoryRules } from './rules-block-history.mjs';
import { scenarioRules } from './rules-scenarios.mjs';
import { glossaryRules } from './rules-glossary.mjs';
import { uiRules } from './rules-ui-contract.mjs';
import { additionalRules } from './rules-additional.mjs';
import { designRules } from './rules-design.mjs';
import { pipelineSkillRules } from './rules-pipeline-skill.mjs';
import {wireframeRules} from './rules-wireframe.mjs';
import {prototypeRules} from './rules-prototype.mjs';
export function lintSpec(root,options={}) {
  const P=new Problems();let model=null;
  const result=()=>({problems:P,model,stats:stats(model),exitCode:P.errors.some(p=>/^E-/.test(p.code))?2:P.errors.length?1:0});
  const safe=(name,fn)=>{try{fn();}catch(e){P.add('E-RULE',String(root),1,`${name}: ${e.message}`,'repair the named rule and rerun lint');}};
  let spec;
  try{spec=loadSpec(root);}catch(e){P.add('E-INPUT',String(root),1,e.message,'select a readable spec directory');return result();}
  if(spec.manifest?.format==='1') {P.add('M-FORMAT-V1','spec.manifest.json',1,'format 1 requires migration','node tools/migrate/v1-to-v2.mjs <v1-spec> --out <dir>');return result();}
  if(spec.inputError) {P.add('E-INPUT',String(root),1,spec.inputError,'select a readable directory with local files');return result();}
  try{checkSchemas(options.schemaDir);}catch(e){P.add('E-SCHEMA','format/schema',1,e.message,'restore the required v2 schemas');return result();}
  safe('manifest',()=>manifestRules(spec,P,options));
  safe('model',()=>{model=buildModel(spec);model.options=options;});
  if(!spec.docs.length) P.add('E-INPUT',String(root),1,'checked 0 documents','select a nonempty v2 document bundle');
  if(!model) return result();
  for(const [name,rule] of Object.entries({documents:docRules,structure:structureRules,additional:additionalRules,scenarios:scenarioRules,glossary:glossaryRules,ui:uiRules,design:designRules,pipelineSkill:pipelineSkillRules,history:blockHistoryRules,links:linkRules,readable:readableRules,wireframe:wireframeRules,prototype:prototypeRules,...options.rules})) safe(name,()=>rule(model,P));
  return result();
}
function stats(model) {
  const m=model,byType={};for(const d of m?.docs || []) byType[d.type || 'untyped']=(byType[d.type || 'untyped'] || 0)+1;
  return {runtimeChecks:{approversBaseline:{status:m?.options?.pipelineConfig && m?.records?.decisions?.length?'CHECKED':'NOT_RUN',records:m?.options?.pipelineConfig?m?.records?.decisions?.length || 0:0},head:'NOT_RUN',build:'NOT_RUN'},qRecords:m?.qRecords || {checked:0,notRun:true},documents:m?.docs.length || 0,byType,requirements:m?.reqs.length || 0,stories:m?.stories.length || 0,acceptanceCriteria:m?.stories.reduce((n,s)=>n+s.ac.rows.length,0) || 0,decisions:m?.decisions.length || 0,amendments:m?.withAmend.reduce((n,x)=>n+x.amend.items.length,0) || 0,images:m?.spec.images.length || 0,boards:m?.boardIds.size || 0,scenarios:m?.stories.reduce((n,s)=>n+(s.doc.fm.scenarios?.length || 0),0) || 0,unassigned:m?.unassigned || 0,open:m?.open || {total:0,blocking:0,byUs:{}}};
}

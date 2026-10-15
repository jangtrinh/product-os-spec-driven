import {behaviorContext,snapshot} from './behavior-project.mjs';
import {graphControl} from './behavior-graph.mjs';
import {repairControl,roleControl,prototypeControl} from './behavior-loops.mjs';
import {batchControl,deliveryControl,semanticControl} from './behavior-decisions.mjs';

const required={
  'complete-scope-graph':'complete-graph','incomplete-scope-graph':'incomplete-graph',
  'stale-semantic-propagation':'semantic','repair-cap':'repair-cap',
  'role-toggle-manual':'role-manual','prototype-first':'prototype',
  'batch-packet':'batch','receiver-switch':'delivery',
};
const actions={'complete-graph':c=>graphControl(c,true),'incomplete-graph':c=>graphControl(c,false),semantic:semanticControl,
  'repair-cap':repairControl,'role-manual':roleControl,prototype:prototypeControl,batch:batchControl,delivery:deliveryControl};
export async function behaviorChecks(repo,p,meta,options) {
  const expected=required[meta.name];
  if(expected&&meta.behavior!==expected) return {status:'FAIL',diagnostic:`Missing/disabled required behavior ${expected} for ${meta.name}`,operations:[],observations:[]};
  if(!meta.behavior)return {status:'NOT_RUN',reason:'Content case; no required control scenario',operations:[],observations:[]};
  if(!Object.hasOwn(actions,meta.behavior))return {status:'FAIL',diagnostic:`Unknown required behavior ${meta.behavior}`,operations:[],observations:[]};
  if(!options.fake)return {status:'FAIL',diagnostic:'Required behavior control NOT_RUN: only deterministic mode is authorized for synthetic control authority',operations:[],observations:[]};
  const c=behaviorContext(repo,p,meta),before=snapshot(p);
  const result={project:{root:p.root,case_id:meta.name,source_sha256:p.pins.source},behavior:meta.behavior,before,
    capability:'Case-bound deterministic owner-API control; synthetic review and PO authority, no model/product/browser quality',operations:c.operations,observations:c.observations};
  try {actions[meta.behavior](c);return {...result,status:'PASS',after:snapshot(p)};}
  catch(error){return {...result,status:'FAIL',diagnostic:`Required behavior ${meta.behavior}: ${error.message}`,after:snapshot(p)};}
}

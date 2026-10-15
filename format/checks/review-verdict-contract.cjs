const fs=require('node:fs');
const assert=require('node:assert/strict');
const {verdict}=require('./contract-oracles.cjs');

// Bind the computed verdict to its persisted interchange and approval boundary.
function reviewVerdictContract({check,samples,receipt}){
 const common=JSON.parse(fs.readFileSync('format/schema/model-common.schema.json','utf8'));
 const expected=['PASS','NEEDS_CHANGES','FAIL','BLOCKED','NOT_RUN'];
 assert.deepEqual(common.$defs.review.enum,expected,'shared review verdicts stay closed');
 const read=file=>fs.readFileSync(file,'utf8');
 const row=read('format/SPEC-FORMAT-v2.md').split('\n').find(line=>line.startsWith('| `review` |'));
 const declared=row.match(/verdict: (.*?), criteria/)[1].split('\\|');
 assert.deepEqual(declared,[...expected,'null'],'gate-data review enum matches shared verdicts plus disabled null');
 const dimensions=read('format/gate-model.md').split('\n').find(line=>line.startsWith('| review |'));
 assert.deepEqual(dimensions.split('|')[2].trim().split(', '),expected);
 for(const file of ['SPEC.md','format/design-model.md']){
  const enumeration=read(file).match(/PASS\|NEEDS_CHANGES\|FAIL\|BLOCKED\|NOT_RUN/);
  assert(enumeration,file+' declares every enabled review verdict');
  assert.deepEqual(enumeration[0].split('|'),expected);
 }
 let count=5;
 const shape=(name,data,good,label)=>{
  check(name,data,good);count++;console.log((good?'POSITIVE ':'RED as expected ')+label);
 };
 const na={id:'ui',mandatory:true,applicability:'na',score:null,evidence:'D1',reason:'source-backed no UI',confirmer:'po'};
 const applicable={id:'task',mandatory:true,score:2,evidence:'receipt-1'};
 const record=criteria=>({enabled:true,independent:true,verdict:verdict(criteria).result,criteria,findings:[],report:null});
 for(const criteria of [[na],[]]){
  const computed=verdict(criteria),review=JSON.parse(JSON.stringify(record(criteria)));
  assert.deepEqual(computed,{result:'NOT_RUN',applicable:0,passed:0,na:criteria.length});count++;
  shape('gate-review',review,true,'enabled all-NA/empty NOT_RUN persists in gate-data.review');
  const observation=structuredClone(receipt);observation.review.verdict=review.verdict;observation.review.criteria=criteria;
  shape('evidence-receipt',observation,true,'computed NOT_RUN receipt shares gate-data verdict');
  for(const result of ['PASS','NEEDS_CHANGES','FAIL','BLOCKED',null,'UNKNOWN']){
   shape('gate-review',{...review,verdict:result},false,'all-NA/empty cannot record '+result);
  }
  const state=structuredClone(samples['gate-state']);state.states.review=review.verdict;
  state.states.human='PENDING';state.decision=null;
  shape('gate-state',state,true,'NOT_RUN remains pending');
  state.states.human='APPROVED';state.decision='decision-1';
  shape('gate-state',state,false,'NOT_RUN cannot become eligible/APPROVED');
 }
 shape('gate-review',record([applicable,na]),true,'applicable PASS with confirmed NA');
 shape('gate-review',record([na,{...applicable,applicability:'applicable'}]),true,'explicit applicable after NA keeps PASS');
 assert.deepEqual(verdict([applicable,na]),{result:'PASS',applicable:1,passed:1,na:1});count++;
 for(const score of [0,1])shape('gate-review',record([{...applicable,score},na]),true,'mandatory score '+score+' retains failing verdict');
 for(const result of expected)shape('gate-review',{...record([applicable]),verdict:result},true,'known enabled verdict '+result);
 shape('gate-review',{...record([applicable]),verdict:'UNKNOWN'},false,'unknown enabled verdict rejected');
 shape('gate-review',{...record([applicable]),verdict:null},false,'enabled review cannot use disabled null');
 const disabled={enabled:false,independent:false,verdict:null,criteria:[],findings:[],report:null};
 shape('gate-review',disabled,true,'disabled review remains false/false/null');
 for(const patch of [{verdict:'NOT_RUN'},{independent:true},{criteria:[na]}]){
  shape('gate-review',{...disabled,...patch},false,'disabled review cannot claim observed work');
 }
 console.log('Cross-file review verdict contract: '+count+' checks passed');
 return count;
}
module.exports={reviewVerdictContract};
if(require.main===module)reviewVerdictContract(require('./compatibility-suite.cjs'));

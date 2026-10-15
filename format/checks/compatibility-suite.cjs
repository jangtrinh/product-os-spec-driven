const fs = require('node:fs');
const Ajv = require(process.env.SPEC_AJV_MODULE || 'ajv/dist/2020').default;
const a = new Ajv({strict:true, allErrors:true});
a.addKeyword({keyword:'x-spec-ref',schemaType:['string','boolean'],valid:true});
a.addKeyword({keyword: 'x-spec-ref-reason', schemaType: 'string', valid: true});
a.addKeyword({keyword: 'x-spec-exclusion', schemaType: 'object', valid: true});
a.addFormat('date', {type:'string',validate:s=>{
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===s;
}});
a.addFormat('date-time', {type:'string',validate:s=>{
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s)) return false;
  const d=new Date(s); if(!Number.isFinite(d.getTime())) return false;
  return d.toISOString().slice(0,19)===s.slice(0,19);
}});
a.addFormat('email',{type:'string',validate:s=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)});
const validators = {};
for(const f of fs.readdirSync('format/schema').filter(f=>f.endsWith('.json')).sort()) {
  const s=JSON.parse(fs.readFileSync('format/schema/'+f));
  if(!a.validateSchema(s)) throw Error(f+JSON.stringify(a.errors));
  a.addSchema(s); validators[f.replace('.schema.json','')]=s.$id;
}
for(const [name,id] of Object.entries(validators)) { a.getSchema(id); console.log('COMPILED '+name); }
let count=0; const clone=x=>structuredClone(x);
function check(name,data,good) {
  const validate=a.getSchema(validators[name]), actual=validate(data);
  if(actual!==good) throw Error(name+' expected '+good+' '+JSON.stringify(validate.errors));
  count++;
}
const manifest={format:'2',title:'Filters',tests_root:'tests',
  glossary:{document:'glossary.md'},artifacts:[{id:'stories',name:'Stories'}]};
check('manifest',manifest,true);
for(const [key,value] of [['format','1'],['tests_root','../tests'],['glossary',{}],
 ['date','2026-02-30'],['ui_contract','legacy-absent'],['extra',true]])
 check('manifest',{...manifest,[key]:value},false);
check('manifest',{...manifest,ui_contract:'legacy-absent',migrated_from:'v1',migration_report:'migration-report.json'},true);
const fm={id:'US-16',type:'us',title:'Filters',updated:'2026-10-07',epic:'E1 Filters',trace:{req:['REQ-01']},
 scenarios:[{id:'SCN-16-01',ac:['AC-01','AC-02'],method:'auto',test:'filters.spec.ts#save filters',status:'planned'}]};
check('front-matter',fm,true);
for(const [field,value] of [['method','guess'],['status','done'],['ac',[]],['ac',['AC-01','AC-01']],
 ['test','../outside#save'],['test','file.ts'],['extra',true]]) {
 const bad=clone(fm);bad.scenarios[0][field]=value;check('front-matter',bad,false);
}
for(const method of ['visual','review','manual','not-built','unassigned']) {
 const item=clone(fm);item.scenarios[0].method=method;check('front-matter',item,false);
 delete item.scenarios[0].test;check('front-matter',item,true);
}
for(const status of ['planned','passing','failing','blocked','stale']) {
 const item=clone(fm);item.scenarios[0].status=status;check('front-matter',item,true);
}
for(const bad of [(()=>{const x=clone(fm);delete x.scenarios[0].test;return x;})(),
 {...fm,updated:'2026-02-30'},(()=>{const x=clone(fm);delete x.epic;return x;})(),
 {...fm,trace:{req:[]}},{...fm,type:'prd'},
 {...fm,scenarios:[{id:'SCN-16-01',ac:['AC-01'],method:'unassigned',status:'passing'}]}])
 check('front-matter',bad,false);
const row={screen:'S01',route:'/filters',us:['US-16'],element:{role:'button',name:'Save'},kind:'button',used_by:['SCN-16-01']};
check('ui-contract',row,true);check('ui-contract',{...row,element:{test_id:'save'}},true);
for(const element of [{role:'button'},{role:'button',name:''},{role:'button',name:'Save',test_id:'save'}])
 check('ui-contract',{...row,element},false);
check('ui-contract',{...row,us:[]},false);check('ui-contract',{...row,route:'https://example.test'},false);
const term={term:'Saved filter',anchor:'saved-filter',definition:'A reusable selection.',source:'D1'};
const ban={banned:'seamless',replacement:'State observable steps.',reason:'No measured behavior.'};
check('glossary',term,true);check('glossary',ban,true);
check('glossary',{...term,source:''},false);check('glossary',{...ban,replacement:''},false);
check('glossary',{...term,extra:true},false);
const history={version:1,entries:[{id:'filters-save',page:'us-16',date:'2026-10-07',kind:'row',before:'Old',after:'New',refs:['D1'],source:'Owner ruling',previous_commit:'a'.repeat(40)}]};
check('block-history',history,true);
{const x=clone(history);delete x.entries[0].before;check('block-history',x,false);}
{const x=clone(history);x.entries[0].previous_commit='short';check('block-history',x,false);}
if(count!==52) throw Error('P1 case census changed: '+count);
console.log('P1 compatibility: 52/52');
const at='2026-10-07T03:00:00Z',sha='a'.repeat(64),scope={kind:'ac',ids:['US-16.AC-01'],revision:sha};
const pins={head:sha,base:sha,manifest:sha,build:sha};
const versions={workflow:'2',templates:'2',ruleset:'2',skill:'none'};
const impact={node:'ac:US-16.AC-01',domain:'spec',classification:'direct',reason:'changed outcome',path:['ac:US-16.AC-01']};
const definition={id:'g3-us',version:'1',stage:'us',scope,inputs:['us/US-16.md'],outputs:['us/US-16.md'],
 checks:[{id:'lint',command:'node tools/lint/lint.mjs spec',mandatory:true,blocker_policy:'fail closed'}],
 reviewer:'qc',decider:'po',transitions:['advance','backward'],invalidation:'closure; BR-14 fallback',exceptions:[],versions};
const state={definition:{id:'g3-us',version:'1'},scope,
 states:{eval:'PASS',review:'PASS',human:'APPROVED',freshness:'CURRENT',progress:'accepted',delivery:'draft'},
 receipts:['receipt-1'],rounds:{cycle:'scope-1',eval_fix:1,review:1,max_fix:3,max_review:3,continuation:null},decision:'decision-1',exception_ids:[],candidate:pins};
const receipt={id:'receipt-1',scope,at,freshness:'CURRENT',pins:{artifact:sha,build:sha,source:sha,context:sha,rules:sha,scenario:sha,test:sha,evaluator:'1',prompt:'1',ds:'1',probe:'1',environment:'1'},
 execution:{command:'node tests/save.mjs',cwd:'ui',exit:0,result:'PASS',selected:1,total:1,skipped:[],baseline_debt:[],red_controls:['red-1'],recovery:'none'},
 review:{builder:'dev',reviewer:'qc',independent:true,evaluator_version:'1',prompt_version:'1',ruleset_version:'1',verdict:'PASS',inputs:['us/US-16.md'],criteria:[{id:'task',mandatory:true,score:2,evidence:'receipt-1'}],findings:[]},
 coverage:{ac:['US-16.AC-01'],scenarios:['US-16.SCN-16-01'],passed:['US-16.AC-01'],na:[]},artifacts:{'tests/save.log':sha},domain:'local-ci'};
const screen={screen:'S01',state:'normal',route:'/filters',roles:['admin'],scope:['workspace'],us:['US-16'],ac:['US-16.AC-01'],scenarios:['US-16.SCN-16-01'],flow:'ux/flow.md',boards:['W-01'],components:['project/Button'],patterns:[],data:'us/US-16.md',source:{kind:'not-created',ref:null,reason:'HTML first'},availability:'admin only',overlay:'none',consequences:['Save retains filter'],evidence:[]};
const samples={
 'model-common':scope,'gate-definition':definition,'gate-state':state,
 transition:{id:'tr-1',kind:'backward',opener:'qc',at,source:'finding-1',reason:'amend expectation',from:{stage:'uiux',scope,revision:sha},to:{stage:'us',scope,revision:sha},impact:[impact],authority:'po',decision:'decision-1',regates:['g3-us']},
 'dependency-graph':{version:'1',complete:true,nodes:[{id:'ac:US-16.AC-01',kind:'ac',revision:sha,source:'us/US-16.md'}],edges:[]},
 'evidence-receipt':receipt,
 exception:{id:'ex-1',kind:'prototype-first',scope,source:'D126',reason:'first clickthrough',by:'po@example.test',at,expires:'2026-10-08T03:00:00Z',deferred_gates:['g2'],compensating_checks:['combined approval'],non_waivable:['mandatory criteria'],status:'active',combined_checkpoint:'g2-g4'},
 'audit-event':{id:'event-1',at,actor:'po',type:'decision',scope,before:null,after:sha,refs:['D126'],reason:'approved scope',previous_sha256:null},
 'batch-decision':{id:'decision-1',packet_id:'packet-'+sha,data_sha256:sha,scope,pins,by:'po@example.test',at,default:'approve',reason:'eligible current scope',overrides:[],exceptions:[]},
 'change-set':{id:'CS-save',baseline:pins,candidate:null,scope,source:'D126',reason:'new behavior',state:'Proposed',impact:[impact],propagation:[],po_decision:null,regates:[],packet:null,receivers:[]},
 'design-profile':{id:'project',version:'1',authority:[{id:'identity',path:'authority/project.md',revision:sha,kind:'identity',non_waivable:true}],tokens:{owner:'dev',source:'design/tokens.json',revision:sha,generated:['assets/tokens.css'],sync_direction:'code to mirrors to Figma'},catalogs:[],capabilities:[{id:'browser',status:'missing',reason:'not installed'}],rubrics:{core:'rules/uiux.md',adapter:[]},evidence_providers:[],locales:['en'],viewports:[{width:375,height:827},{width:768,height:827},{width:1440,height:827}],modes:['light','dark'],inputs:['authority/project.md']},
 'screen-inventory':{version:'1',screens:[screen]},
 'design-sources':{generated:true,generator:'figma-adapter',version:'1',at,inputs:{'ux/source-input.json':sha},entries:[{id:'source-filter',tool:'figma',locator:{url:'https://figma.com/file/example',node_id:'1:2'},revision:sha,snapshot:null,at,authority:'D10',freshness:'MISSING',status:'unverified'}]}
};
for(const [name,value] of Object.entries(samples)) {
 check(name,value,true);const bad=clone(value);bad.unrecognized=true;check(name,bad,false);
 const missing=clone(value);delete missing[Object.keys(value)[0]];check(name,missing,false);
}
const extRow={...row,state:'normal',roles:['admin'],scope:['workspace'],components:['project/Button'],patterns:[],target:'Save retains filter'};
check('ui-contract',extRow,true);check('ui-contract',{...row,state:'normal'},false);
check('front-matter',{id:'screens',type:'screen-inventory',title:'Screens',updated:'2026-10-07',data:'ux/screens.json'},true);
check('front-matter',{id:'screens',type:'screen-inventory',title:'Screens',updated:'2026-10-07'},false);
check('front-matter',{...fm,data:'ux/screens.json'},false);
check('front-matter',{...fm,no_ui:'Background operation'},true);
check('front-matter',{...fm,trace:{req:['REQ-01'],amendments:['fc-main.A-09']}},true);
check('manifest',{...manifest,design:{profile:'ux/profile.json',inventory:'ux/screens.json'}},true);
check('manifest',{...manifest,design:{profile:'../profile.json',inventory:'ux/screens.json'}},false);
check('glossary',{...term,locale:'vi',source_key:'filters.save',retained_terms:['API'],exceptions:[{text:'Filter',reason:'literal source',source:'D1'}]},true);
for(const [name,mutate] of [
 ['gate-state',x=>x.states.freshness='STALE'],['gate-state',x=>x.decision=null],
 ['evidence-receipt',x=>x.execution.selected=0],['evidence-receipt',x=>x.execution.exit=null],
 ['evidence-receipt',x=>x.domain='visual'],['evidence-receipt',x=>x.execution.result='NOT_RUN'],
 ['batch-decision',x=>x.scope.ids=['AC-01']],['batch-decision',x=>x.at='2026-02-30T03:00:00Z'],
 ['screen-inventory',x=>delete x.screens[0].source],['screen-inventory',x=>x.screens[0].source={kind:'figma',ref:null}],
 ['screen-inventory',x=>delete x.screens[0].source.reason],
 ['design-sources',x=>x.entries[0].freshness='CURRENT'],['exception',x=>delete x.combined_checkpoint],
 ['exception',x=>{x.kind='continuation';delete x.combined_checkpoint;}],
 ['exception',x=>x.by='Product owner'],['dependency-graph',x=>x.nodes[0].kind='unknown']]) {
 const bad=clone(samples[name]);mutate(bad);check(name,bad,false);
}
{const x=clone(samples.exception);x.kind='continuation';x.extra_rounds=2;delete x.combined_checkpoint;check('exception',x,true);}
{const x=clone(receipt);x.domain='visual';x.visual={screen:'S01',state:'normal',role:'admin',scope:'workspace',scenarios:['US-16.SCN-16-01'],width:375,height:827,mode:'light',locale:'en',fixture:'admin-filter',browser:'chromium-1',build:sha,ds:sha,probe:'1',png:'assets/filter.png',measurements:'assets/filter.json'};check('evidence-receipt',x,true);}
{const x=clone(receipt);x.freshness='STALE';check('evidence-receipt',x,true);}
console.log(Object.keys(validators).length+' schemas compiled; '+count+' positive/negative checks passed');
module.exports={a,validators,receipt,scope,pins,versions,definition,screen,check,samples};

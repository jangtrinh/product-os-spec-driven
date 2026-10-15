const fs=require('node:fs');
const assert=require('node:assert/strict');
const {a,validators,receipt,check}=require('./compatibility-suite.cjs');
const {canonical,hash,digest,packetErrors,cellKey,coversCell,verdict}=require('./contract-oracles.cjs');
const {normalize,sourceErrors,strictJSON}=require('./glossary-oracle.cjs');
let extra=0;
function shape(name,data,good,label){check(name,data,good);extra++;console.log((good?'POSITIVE ':'RED as expected ')+label);}
function semantic(value,good,label){assert.equal(value,good,label);extra++;console.log((good?'POSITIVE ':'RED as expected ')+label);}
const clone=x=>structuredClone(x),sha='a'.repeat(64);
const visual={screen:'S01',state:'normal',role:'admin',scope:'workspace',scenarios:['US-16.SCN-16-01'],width:375,height:827,mode:'light',locale:'en',fixture:'filters',browser:'chromium-1',build:sha,ds:sha,probe:'1',png:'assets/filter.png',measurements:'assets/filter.json'};
const admin={...clone(receipt),domain:'visual',visual};
const viewer=clone(admin);viewer.id='viewer-receipt';viewer.visual.role='viewer';viewer.visual.scope='project';viewer.visual.png='assets/viewer.png';viewer.visual.measurements='assets/viewer.json';
shape('evidence-receipt',admin,true,'F1 admin/workspace cell');
shape('evidence-receipt',viewer,true,'F1 viewer/project cell');
const target={...viewer.visual,scenario:viewer.visual.scenarios[0]};
semantic(cellKey(visual,visual.scenarios[0])!==cellKey(target,target.scenario),true,'F1 distinct identities');
semantic(coversCell(viewer,target),true,'F1 exact viewer join');
semantic(coversCell(admin,target),false,'F1 wrong-role/scope reuse');
for(const key of ['role','scope']){const bad=clone(admin);delete bad.visual[key];shape('evidence-receipt',bad,false,'F1 missing '+key);}
for(const key of ['role','scope','state','mode','locale','width','height','fixture','scenario']){
 const wrong={...target,[key]:typeof target[key]==='number'?target[key]+1:'wrong'};
 semantic(coversCell(viewer,wrong),false,'F1 mismatched '+key);
}
const missing=clone(admin);missing.freshness='MISSING';missing.execution={...missing.execution,result:'NOT_RUN',exit:null,selected:0,recovery:'Install browser; recapture exact requested cell'};
missing.review.verdict='NOT_RUN';missing.review.criteria=[];missing.coverage.passed=[];
for(const key of ['browser','build','ds','probe','png','measurements'])delete missing.visual[key];
shape('evidence-receipt',missing,true,'F2 log-only NOT_RUN/MISSING visual');
const nullable=clone(missing);for(const key of ['browser','build','ds','probe','png','measurements'])nullable.visual[key]=null;
shape('evidence-receipt',nullable,true,'F2 null capture outputs');
semantic(coversCell(missing,{...visual,scenario:visual.scenarios[0]}),false,'F2 unexecuted coverage');
for(const mutate of [x=>x.freshness='CURRENT',x=>x.coverage.passed=['US-16.AC-01'],x=>x.execution.selected=1,x=>x.visual.png='invented.png']){
 const bad=clone(missing);mutate(bad);shape('evidence-receipt',bad,false,'F2 invented execution/output');
}
for(const key of ['png','measurements','browser','build','ds','probe']){
 const bad=clone(admin);delete bad.visual[key];shape('evidence-receipt',bad,false,'F2 executed without '+key);
}
const na={id:'locale',mandatory:true,applicability:'na',score:null,evidence:'D1',reason:'EN-only contract fixture',confirmer:'po'};
const mixed=clone(receipt);mixed.review.criteria.push(na);
shape('evidence-receipt',mixed,true,'F3 confirmed criterion NA');
for(const key of ['reason','confirmer']){const bad=clone(mixed);delete bad.review.criteria[1][key];shape('evidence-receipt',bad,false,'F3 NA without '+key);}
{const bad=clone(mixed);bad.review.criteria[1].score=2;shape('evidence-receipt',bad,false,'F3 NA in passed numerator');}
assert.deepEqual(verdict(mixed.review.criteria),{result:'PASS',applicable:1,passed:1,na:1});extra++;
semantic(verdict([na]).result==='NOT_RUN',true,'F3 all-NA cannot PASS');
for(const [score,result] of [[0,'FAIL'],[1,'NEEDS_CHANGES'],[2,'PASS']]){
 semantic(verdict([{...receipt.review.criteria[0],score},na]).result===result,true,'F3 applicable-only '+result);
}
semantic(verdict(mixed.review.criteria,[{disposition:'accepted-minor'}]).result==='NEEDS_CHANGES',true,'F3 accepted Minor observed verdict');
semantic(verdict(mixed.review.criteria,[{disposition:'fixed'}]).result==='PASS',true,'F3 fixed finding history');
const root='format/fixtures/review-packet',read=f=>strictJSON(fs.readFileSync(root+'/'+f,'utf8'));
const packet=read('packet-data.json'),decision=read('decision.json'),membership=read('candidate-manifest.json'),baselineMembership=read('baseline-manifest.json');
shape('candidate-manifest',baselineMembership,true,'F5 linked immutable baseline manifest');
semantic(digest(baselineMembership)===packet.baseline.manifest,true,'F5 baseline manifest pin');
for(const member of baselineMembership.members)for(const [file,sha] of Object.entries(member.artifacts))semantic(hash(fs.readFileSync(root+'/'+file))===sha,true,'F5 baseline raw artifact '+file);
for(const [name,value] of [['candidate-manifest',membership],['packet-data',packet]]){
 shape(name,value,true,'F5 '+name);
 shape(name,{...value,unknown:true},false,'F5 '+name+' unknown key');
 const bad=clone(value);delete bad.version;shape(name,bad,false,'F5 '+name+' missing version');
}
for(const field of ['decisions','assumptions']){const bad=clone(packet);delete bad[field];shape('packet-data',bad,false,'F5 missing separate '+field);}
shape('batch-decision',decision,true,'F5 linked decision');
semantic(canonical(packet)===fs.readFileSync(root+'/packet-data.json','utf8'),true,'F5 canonical bytes');
semantic(!packetErrors(packet,decision,packet,root).length,true,'F5 linked positive import');
for(const file of ['red-stale-pins.json','red-unknown-scope.json','red-digest-mismatch.json']){
 const bad=read(file);shape('batch-decision',bad,true,'F5 RED input remains valid shape '+file);
 semantic(!packetErrors(packet,bad,packet,root).length,false,'F5 rejected '+file);
}
{const bad=clone(packet);bad.change.reason+=' changed';semantic(!packetErrors(bad,decision,packet,root).length,false,'F5 changed payload digest');}
{const current=clone(packet);current.candidate.base='0'.repeat(64);semantic(!packetErrors(packet,decision,current,root).length,false,'F5 moved baseline');}
{const bad=clone(packet);bad.membership.members[0].artifacts['us/US-16.md']='0'.repeat(64);semantic(!packetErrors(bad,decision,packet,root).length,false,'F5 member raw hash mismatch');}
const copyCatalog={locale:'vi',entries:{'filters.save':'Lưu bộ lọc'}};
shape('copy-catalog',copyCatalog,true,'F6 declared VI copy catalog');
shape('copy-catalog',{...copyCatalog,extra:true},false,'F6 copy catalog unknown key');
shape('copy-catalog',{entries:copyCatalog.entries},false,'F6 copy catalog missing locale');
shape('copy-catalog',{...copyCatalog,entries:{'filters.save':''}},false,'F6 empty copy text');
const context={language:'en',locales:['en','vi'],sources:['D1'],catalogs:{vi:['filters.save']}};
const en='Saved filter | saved-filter | A reusable selection. | D1 | — | — | ["API"] | []';
const vi='Bộ lọc đã lưu | bo-loc-da-luu | Lựa chọn dùng lại. | D1 | vi | filters.save | ["API"] | [{"text":"Filter","reason":"Literal source","source":"D1"}]';
for(const [line,label] of [[en,'EN-only'],[vi,'VI source exception']]){
 const row=normalize(line,'term',context);shape('glossary',row,true,'F6 '+label);semantic(!sourceErrors(row,context).length,true,'F6 '+label+' source join');
}
const ban=normalize('seamless | State steps. | No measured behavior. | en | — | [] | []','ban',context);shape('glossary',ban,true,'F6 extended ban');
semantic(normalize(en,'term',{...context,language:'vi'}).locale==='vi',true,'F6 inherited locale');
for(const malformed of [en.replace('["API"]','API, Filter'),en.replace('[]',"['x']"),en.replace('D1 | —','D1 | xx'),en+' | extra',en.replace('[]','[{"text":"a","text":"b"}]')]){
 let ok=true;try{normalize(malformed,'term',context);}catch{ok=false;}semantic(ok,false,'F6 malformed grammar');
}
{const row=normalize(vi,'term',context);delete row.exceptions[0].reason;shape('glossary',row,false,'F6 malformed exception');}
{const row=normalize(vi.replace('"D1"','"D999"'),'term',context);semantic(!sourceErrors(row,context).length,false,'F6 unknown exception source');}
{const row=normalize(vi.replace('filters.save','filters.missing'),'term',context);semantic(!sourceErrors(row,context).length,false,'F6 unknown copy source key');}
const escaped=normalize(en.replace('[]','[{"text":"A\\|B","reason":"C\\\\\\\\D","source":"D1"}]'),'term',context);
semantic(escaped.exceptions[0].text==='A|B'&&escaped.exceptions[0].reason==='C\\D',true,'F6 JSON/table pipe and backslash roundtrip');
const {samples}=require('./compatibility-suite.cjs');
const copyProfile=clone(samples['design-profile']);copyProfile.locales.push('vi');
copyProfile.catalogs=[{id:'copy-vi',path:'copy/vi.json',revision:sha,kind:'copy',locale:'vi'}];
shape('design-profile',copyProfile,true,'F6 copy catalog declaration');
{const bad=clone(copyProfile);delete bad.catalogs[0].locale;shape('design-profile',bad,false,'F6 copy declaration missing locale');}
extra+=require('./review-verdict-contract.cjs').reviewVerdictContract(require('./compatibility-suite.cjs'));
console.log(Object.keys(validators).length+' schemas compiled; 120 retained cases + '+extra+' fix-round checks passed');

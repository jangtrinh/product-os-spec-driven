// Pre-fix reproductions; run against the current schema contract.
const {a,validators,receipt}=require('./compatibility-suite.cjs');
let failures=0;
function expected(name,data,label){
 const validate=a.getSchema(validators[name]);
 if(!validate(data)){failures++;console.log('RED '+label+': '+JSON.stringify(validate.errors));}
 else console.log('GREEN '+label);
}
const visual={screen:'S01',state:'normal',role:'admin',scope:'workspace',scenarios:['US-16.SCN-16-01'],width:375,height:827,mode:'light',locale:'en',fixture:'filter',browser:'chromium',build:'a'.repeat(64),ds:'1',probe:'1',png:'assets/filter.png',measurements:'assets/filter.json'};
expected('evidence-receipt',{...receipt,domain:'visual',visual},'distinct-role visual context');
const missing=structuredClone(receipt);missing.domain='visual';missing.freshness='MISSING';
missing.execution={...missing.execution,result:'NOT_RUN',exit:null,selected:0,recovery:'Install browser and recapture'};
missing.review.verdict='NOT_RUN';missing.review.criteria=[];missing.coverage.passed=[];
missing.visual={screen:'S01',state:'normal',role:'admin',scope:'workspace',scenarios:visual.scenarios,width:375,height:827,mode:'light',locale:'en',fixture:'filter'};
expected('evidence-receipt',missing,'truthful unexecuted cell');
const na=structuredClone(receipt);na.review.criteria.push({id:'locale',mandatory:true,applicability:'na',score:null,evidence:'D1',reason:'EN-only scope',confirmer:'po'});
expected('evidence-receipt',na,'criterion NA');
console.log('reproduced '+failures+'/3 schema defects');process.exitCode=failures?1:0;

import { validate } from '../lib/schema-lite.mjs';
import { loadSchema } from '../lib/manifest.mjs';
// Scenario schema messages omit identity. Recover the owning object using the
// identical installed schema and emission order, rather than a following error.
export function scenarioSchemaOccurrences(doc){
 const schema=loadSchema('front-matter.schema.json');
 return (Array.isArray(doc.converted.data?.scenarios)?doc.converted.data.scenarios:[]).flatMap((s,i)=>validate(s,schema.$defs.scenario,'',[],schema).map(v=>({scope:s?.id||`unidentified-scenario-${i}`,message:`${v.path} ${v.message}`})));
}
export function diagnosticScope(problem,index,problems,doc){
 if(problem.code!=='S-SCN-SCHEMA')return null;
 const ordinal=problems.slice(0,index).filter(p=>p.file===problem.file&&p.code===problem.code).length;
 const occurrence=scenarioSchemaOccurrences(doc)[ordinal];
 if(!occurrence||occurrence.message!==problem.message)throw Error('scenario diagnostic occurrence reconstruction differs from installed lint');
 return occurrence.scope;
}

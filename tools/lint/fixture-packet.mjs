import fs from 'node:fs';
import path from 'node:path';
import { hash,digest } from '../lib/digests.mjs';
export function packetFixture(root) {
  const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
  const write=(rel,value)=>{fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),JSON.stringify(value,null,2)+'\n');};
  const artifacts={'us/US-01.md':hash(fs.readFileSync(path.join(root,'us/US-01.md')))},member={kind:'ac',id:'US-01.AC-01',artifacts,revision:digest(artifacts)},membership={version:'1',members:[member]};
  const scope={kind:'ac',ids:['US-01.AC-01'],revision:digest([member])};
  const pins={head:'fixture-head',base:'fixture-base',manifest:digest(membership),build:'not-built'};
  const change=read('assets/change.json');
  const p={version:'1',product:'PRODUCT:OS Spec Driven',scope,baseline:{...pins,head:'fixture-base'},candidate:pins,membership,change:{id:change.id,source:change.source,reason:change.reason,rules:[{source:'fc-001.A-01',before:'Delete directly',after:'Confirm before delete'}],impact:change.impact,closure:{complete:true,fallback:null},propagation:change.propagation},screens:[],evidence:[],findings:[],open:[{id:'open-1',text:'Review scope before approval',blocking:false}],exceptions:[],unaffected:[],aggregate_checks:[],requests:[{id:'US-01.AC-01',reason:'Review confirmation rule'}],assets:{},decisions:[{id:'D1',text:'Personal filters',source:'D1'}],assumptions:[]};
  const id='packet-'+digest(p),file=`assets/records/packets/${id}/packet-data.json`;write(file,p);
  write('assets/records/decisions/decision-1.json',{id:'decision-1',packet_id:id,data_sha256:digest(p),scope,pins,by:'po@example.test',at:'2026-01-09T00:00:00Z',default:'defer',reason:'Review pending',overrides:[],exceptions:[]});
  return file;
}

'use strict';
const assert = require('node:assert/strict');
const registry = require('../reference-registry.json');
const {audit,identities} = require('../reference-registry-document-ownership.cjs');
const entries = () => new Map(structuredClone(registry.entries).map(entry=>[entry.id,entry]));
function errors(rows) {
  const failures=[]; audit(rows,(ok,message)=>{if(!ok)failures.push(message);}); return failures;
}
assert.deepEqual(errors(entries()),[],'all identity locations own their declared ids');
let tested=0;
for (const id of [...identities.direct,...identities.logicalParents]) {
  for (const mutate of [rows=>rows.delete(id),rows=>{rows.get(id).causal=false;},
    rows=>{rows.get(id).edge={from:'target',to:'source'};},
    rows=>{const e=rows.get(id); if(e.ownership)delete e.ownership;else e.source={kinds:['req'],id:'req:{value}'};}]) {
    const rows=entries();mutate(rows);assert(errors(rows).some(message=>message.endsWith(id)),id+' mutation rejected');tested++;
  }
}
for (const id of ['body-id-mention','scenario-detail-id','dependency-graph-nodes-id']) {
  const rows=entries();rows.get(id).ownership={kinds:['artifact'],id:'artifact:{document-or-record-path}'};
  assert(errors(rows).some(message=>message.endsWith(id)),id+' cannot acquire ownership');tested++;
}
console.log('PASS '+tested+' document ownership negative test cases across '+(identities.direct.length+identities.logicalParents.length)+' identity locations; disk untouched');
require('../reference-registry-document-ownership-red-controls.cjs');

import fs from 'node:fs';
import path from 'node:path';
import { hash } from '../lib/digests.mjs';
import { approvePacket } from './controls-v3.mjs';
export function currentFailure(p,r,changes={}) {
  const failed=structuredClone(r);
  Object.assign(failed,{id:'receipt-current-failure',at:'2026-01-10T00:00:00Z'},changes);
  failed.execution.result='FAIL';failed.execution.exit=1;
  failed.review.verdict='FAIL';failed.review.criteria[0].score=0;
  p.evidence.push(failed);
  return failed;
}
export function unrelatedSource(t,r) {
  r.artifacts={'README.md':hash(fs.readFileSync(path.join(t.root,'README.md')))};
  r.review.inputs=['README.md'];r.review.criteria[0].evidence='README.md';
}
export const currentReceiptControls=[
 ['Q-DECISION',t=>approvePacket(t,(p,r)=>currentFailure(p,r))],
 ['Q-EXPECTED',t=>t.json('assets/red-receipt.json',r=>unrelatedSource(t,r))],
];

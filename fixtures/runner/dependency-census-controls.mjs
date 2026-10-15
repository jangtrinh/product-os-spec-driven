import {definitionRevision} from '../../tools/lib/definition-scope.mjs';
import {projectCensusGraph} from './census-graph.mjs';
import {batchFixture} from './batch-fixture.mjs';
import {copy, put} from './evidence-head-controls.mjs';
import {canonical} from '../../tools/lib/config/strict-json.mjs';
import {hashes, sha256} from '../../tools/lib/config/path-selection.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

export const censusControls = [
  ['missing REQ ancestor', 'node', 'req:REQ-01'],
  ['missing REQ edge', 'edge', 'req:REQ-01', 'artifact:us/US-16.md'],
  ['missing US owner', 'node', 'us:US-16'],
  ['missing ownership edge', 'edge', 'us:US-16', 'ac:US-16.AC-01'],
  ['missing trace.us', 'edge', 'us:US-17', 'artifact:us/US-16.md'],
  ['missing trace.ac', 'edge', 'ac:US-17.AC-01', 'artifact:us/US-16.md'],
  ['missing ancestor trace.ac', 'edge', 'ac:US-18.AC-01', 'artifact:spec/us/US-17.md'],
  ['missing trace.decisions', 'edge', 'decision:D1', 'artifact:us/US-16.md'],
  ['missing trace.amendments', 'edge', 'amendment:FC.A-01', 'artifact:us/US-16.md'],
  ['missing contract ancestor', 'node', 'contract:FC'],
  ['missing amendment ancestor', 'node', 'amendment:FC.A-01'],
  ['missing contract amendment edge', 'edge', 'contract:FC', 'amendment:FC.A-01'],
  ['missing amendment affected edge', 'edge', 'amendment:FC.A-01', 'ac:US-16.AC-01'],
  ['missing scenario ownership', 'edge', 'ac:US-16.AC-01', 'scenario:US-16.SCN-16-01'],
  ['missing screen link', 'edge', 'us:US-16', 'screen-state:S01/normal'],
  ['missing board link', 'edge', 'us:US-16', 'board:W-01'],
  ['missing ui-contract link', 'edge', 'screen-state:S01/normal', 'scenario:US-16.SCN-16-01'],
  ['missing inventory board link', 'edge', 'screen-state:S01/normal', 'board:W-01'],
  ['wrong ancestor node kind', 'kind', 'req:REQ-01'],
  ['wrong amendment source anchor', 'source', 'amendment:FC.A-01'],
  ['missing PRD document ownership', 'edge', 'artifact:spec/prd/requirements.md', 'req:REQ-01'],
  ['missing AC document ownership', 'edge', 'artifact:us/US-16.md', 'ac:US-16.AC-01'],
];
function retarget(p) {
  const artifacts = hashes(p.root, [...Object.keys(p.packet.membership.members[0].artifacts), 'spec/contract/FC.md', 'spec/decisions/ledger.md']);
  for (const member of p.packet.membership.members) {member.artifacts = artifacts; member.revision = sha256(canonical(artifacts));}
  const digest = sha256(canonical(p.packet.membership)); p.write(`review/candidates/${digest}.json`, p.packet.membership);
  p.packet.scope = {...p.packet.scope, revision: sha256(canonical(p.packet.membership.members))}; p.packet.candidate.manifest = digest;
  const receipt = p.packet.evidence[0]; receipt.scope = copy(p.packet.scope); receipt.pins = {...receipt.pins, ...p.packet.candidate, head: 'prior-head'}; receipt.artifacts = {...receipt.artifacts, ...artifacts}; put(p, receipt);
  receipt.review.inputs = Object.keys(artifacts); put(p, receipt);
  for (const [index, member] of p.packet.membership.members.entries()) {
    const scope = {kind: member.kind, ids: [member.id], revision: 'unbound'};
    const definition = JSON.parse(fs.readFileSync(path.join(p.root, `review/definitions/scope-${index}/1.json`))); definition.scope = scope; scope.revision=definitionRevision(definition); p.write(`review/definitions/scope-${index}/1.json`, definition);
    const model = {...p.gate('prd').data.model, definition: {id: definition.id, version: '1'}, scope, candidate: p.packet.candidate, receipts: [receipt.id]};
    p.write(`review/gates/scoped/${definition.id}/${scope.revision}.json`, model);
  }
  Object.assign(p.changeSet, {candidate: p.packet.candidate, scope: p.packet.scope, impact: copy(p.packet.change.impact)});
  p.decision.scope = p.packet.scope; p.decision.pins = p.packet.candidate; p.write(`review/changes/${p.changeSet.id}.json`, p.changeSet); p.saveBatch();
}
export function censusFixture(t, [, mode, from, to]) {
  const p = batchFixture(t);
  p.write('us/US-16.md', '---\nid: US-16\ntype: us\ntrace: {req: [REQ-01], us: [US-17], ac: [US-17.AC-01], decisions: [D1], amendments: [FC.A-01]}\nscreens: [S01]\nboards: [W-01]\nimages: [{src: W-02-view.png, role: wireframe}]\nscenarios: [{id: SCN-16-01, ac: [AC-01, AC-02], method: review, status: planned}]\n---\n## 4. Acceptance criteria\n| ID | Then |\n|---|---|\n| AC-01 | Exact saved selection |\n| AC-02 | Next outcome |\n');
  for (const [id, req, trace] of [['US-17', 'REQ-02', ', ac: [US-18.AC-01]'], ['US-18', 'REQ-03', '']]) p.write(`spec/us/${id}.md`, `---\nid: ${id}\ntype: us\ntrace: {req: [${req}]${trace}}\n---\n## 4. Acceptance criteria\n| ID | Then |\n|---|---|\n| AC-01 | Ancestor outcome |\n`);
  p.write('spec/prd/requirements.md', '---\nid: PRD\ntype: prd\n---\n| ID | Requirement | Source |\n|---|---|---|\n| REQ-01 | Saved selection | Original |\n| REQ-02 | Parent outcome | Original |\n| REQ-03 | Ancestor outcome | Original |\n');
  p.write('spec/contract/FC.md', '---\nid: FC\ntype: contract\nprimary: true\n---\n# Amendment A-01 (2026-10-07, po@example.test, D1) — Current outcomes\n| # | Change (already applied to body) | Affected ids | Source |\n|---|---|---|---|\n| A01-01 | Exact saved selection | US-16.AC-01 | Original |\n');
  p.write('spec/decisions/ledger.md', '---\nid: LEDGER\ntype: decisions\nledger: true\n---\n| Id | Decision | Detail |\n|---|---|---|\n| D1 | Authorize amendment | Original rule |\n');
  p.write('spec/ux/ui-contract.md', '---\nid: SELECTORS\ntype: ui-contract\n---\n| Screen | State | Route | US | Element | Kind | SCN |\n|---|---|---|---|---|---|---|\n| S01 | normal | /saved | US-16 | testid=saved | button | SCN-16-01 |\n');
  p.write('spec/ux/inventory.md', '---\nid: INVENTORY\ntype: screen-inventory\ndata: spec/ux/inventory.json\n---\nInventory\n');
  p.write('spec/ux/inventory.json', {screens: [{screen: 'S01', state: 'normal', us: ['US-16'], ac: ['US-16.AC-01'], scenarios: ['US-16.SCN-16-01'], boards: ['W-01']}]});
  p.write('spec/ux/boards.md', '---\nid: BOARDS\ntype: wireframe-index\nboard_names: [{id: W-02, name: Saved view}]\n---\nBoards\n');
  p.packet.change.impact = [{node: 'artifact:independent', domain: 'spec', classification: 'direct', reason: 'Disjoint source changed', path: ['artifact:independent']}];
  retarget(p);
  const full = projectCensusGraph(p);
  full.nodes.push({id:'artifact:independent',kind:'artifact',source:'evidence/check.txt',revision:'1'});
  const missing = copy(full);
  if (mode === 'node') {missing.nodes = missing.nodes.filter(node => node.id !== from); missing.edges = missing.edges.filter(edge => edge.from !== from && edge.to !== from);}
  else if (mode === 'kind') missing.nodes.find(node => node.id === from).kind = 'artifact';
  else if(mode==='source')missing.nodes.find(node=>node.id===from).source='spec/contract/FC.md';
  else missing.edges = missing.edges.filter(edge => edge.from !== from || edge.to !== to);
  assert.notDeepEqual(missing,full,'the intended census attack must change the frozen graph');
  p.write(p.config.gates.graph, full);
  p.rebuildBatch();
  const greenProbe=()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'spec-census-green-'));
    try {
      fs.cpSync(p.root,root,{recursive:true});
      const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../tools/run/run.mjs',import.meta.url)),'--project',root,'--head','fixture-head','--build','not-built','--import-decision','decision.json','--packet-data','packet-data.json','--as','po@example.test'],{encoding:'utf8'});
      return {code:result.status,out:result.stdout+result.stderr};
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  };
  return {p,full,greenProbe,attack:()=>{p.write(p.config.gates.graph,missing); p.rebuildBatch();},red: () => p.importBatch(), restore: () => {p.write(p.config.gates.graph, full); p.rebuildBatch();}, green: () => p.importBatch()};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseYaml} from '../../lib/config/yaml-parser.mjs';
import {loadConfig} from '../../lib/config/config-loader.mjs';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {absentReference,externalReference,referenceValues} from '../../lib/census-reference-resolution.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {declaredRelationCensus} from '../../lib/declared-relation-census.mjs';
import {batchFixture} from '../../../fixtures/runner/batch-fixture.mjs';

test('parsed YAML bindings preserve structural values and null prototypes',t=>{
  const p=projectFixture(t),config=loadConfig(p.root),binding=config.gates.stage_definitions.prd;
  assert.equal(Object.getPrototypeOf(binding),null);
  assert.equal(absentReference(binding),false);
  assert.equal(externalReference(binding),false);
  assert.deepEqual(referenceValues(binding,{id:'pipeline-gates-stage-definitions',location:{path:'gates.stage_definitions{value}'}}),[binding]);
});
test('non-dot spec root rebases every model alias and preserves declaration anchors',t=>{
  const p=projectFixture(t);
  p.write('spec/contract/FC.md','---\nid: FC\ntype: contract\nprimary: true\n---\n# Amendment A-01 (2026-10-07, po@example.test, D1) — Outcomes\n');
  p.write('spec/prd/PRD.md','---\nid: PRD\ntype: prd\n---\n| ID | Requirement | Source |\n|---|---|---|\n| REQ-01 | Outcome | — |');
  p.write('spec/decisions/ledger.md','---\nid: ledger\ntype: decisions\nledger: true\n---\n| Id | Decision | Detail |\n|---|---|---|\n| D1 | Authorize | — |');
  p.write('spec/us/US-01.md','---\nid: US-01\ntype: us\n---\n## 4. Acceptance criteria\n| ID | Then |\n|---|---|\n| AC-01 | Outcome |');
  const model=projectCensusModel(p.root,loadConfig(p.root));
  for(const d of [...model.stories.map(s=>s.doc),...model.reqs.map(r=>r.doc),...model.contractDocs,model.ledger,...model.withAmend.map(x=>x.doc)]) {
    assert.equal(model.docs.find(doc=>doc.id===d.id),d);
    assert.match(d.rel,/^spec\//);
  }
  const census=declaredRelationCensus(model);
  assert.deepEqual([...census.nodeSources.get('amendment:FC.A-01')],['spec/contract/FC.md#amendment-a-01-2026-10-07-po-example-test-d1-outcomes']);
  assert.equal(model.ofType('us')[0],model.stories[0].doc);
});
test('runtime artifact maps keep independently expected project-relative paths',t=>{
  const p=batchFixture(t),census=declaredRelationCensus(projectCensusModel(p.root,loadConfig(p.root)));
  const refs=census.edges.filter(e=>e.provenance.some(p=>p.entry==='candidate-manifest-members-artifacts'));
  assert.ok(refs.some(e=>e.from==='artifact:us/US-16.md'));
  assert.ok(refs.some(e=>e.from==='artifact:decisions/decisions.md'));
  assert.ok(refs.every(e=>!/^artifact:spec\/(us|decisions)\//.test(e.from)));
});
test('parsed artifact maps emit path keys while digest values remain literals',()=>{
  const artifacts=parseYaml('us/US-16.md: '+ 'a'.repeat(64)+'\ndecisions/decisions.md: '+ 'b'.repeat(64)+'\n');
  assert.equal(Object.getPrototypeOf(artifacts),null);
  assert.deepEqual(referenceValues(artifacts,{id:'candidate-manifest-members-artifacts',location:{path:'members[*].artifacts'}}),['us/US-16.md','decisions/decisions.md']);
  for(const value of [null,undefined,'','—','not-applicable: absent'])assert.equal(absentReference(value),true);
  for(const value of [0,false,{},[],Object.create(null)])assert.equal(absentReference(value),false);
});

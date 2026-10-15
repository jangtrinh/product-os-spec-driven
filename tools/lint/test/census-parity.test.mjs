import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {lintCensus} from '../source-dependency-census.mjs';
import {runnerCensus} from '../../run/dependency-census.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {loadReferenceRegistry} from '../../lib/census-registry.mjs';
import {parityFixtures,exportedFixture,fixtureFileInventory,repo} from './census-parity-fixtures.mjs';

const bytes=census=>JSON.stringify(census.edges.map(({from,to,relation,causal,provenance})=>({from,to,relation,causal,provenance:[...provenance].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})).sort((a,b)=>Buffer.compare(Buffer.from(JSON.stringify(a)),Buffer.from(JSON.stringify(b)))));
function capture(action) {
  try {const census=action();return {census,bytes:bytes(census)};}
  catch(error){return {error:error.message};}
}
function pair(p,options) {
  // Each consumer builds its own model from the same host context. Exported
  // fixtures use spec_root='.'; runner fixtures retain their actual config.
  return [capture(()=>lintCensus(projectCensusModel(p.root,p.config),options)),capture(()=>runnerCensus(p.root,p.config,undefined,[],options))];
}
for(const fixture of parityFixtures)test(`census byte parity ${fixture.name}`,t=>{
  const p=fixture.make();
  try {
    const [lint,runner]=pair(p);
    assert.equal(lint.error,runner.error);
    if(!fixture.broken)assert.equal(lint.error,undefined);
    if(lint.error) {
      t.diagnostic('PARITY '+JSON.stringify({fixture:fixture.name,lint:null,runner:null,equal:true,refusal:lint.error.replaceAll(p.root,'<fixture>')}));
      return;
    }
    assert.equal(lint.bytes,runner.bytes);
    assert.equal(lint.census.complete,runner.census.complete);
    assert.deepEqual(lint.census.unresolved,runner.census.unresolved);
    t.diagnostic('PARITY '+JSON.stringify({fixture:fixture.name,lint:lint.census.edges.length,runner:runner.census.edges.length,equal:true,complete:lint.census.complete,sha256:createHash('sha256').update(lint.bytes).digest('hex')}));
    if(fixture.name.endsWith('provenance-sidecars')) {
      for(const entry of ['crosswalk-row-id','source-ledger-item-id','source-ledger-crosswalk','source-ledger-crosswalk-row','source-ledger-mapping-id','source-ledger-source-file'])assert.ok(lint.census.edges.some(e=>e.provenance.some(p=>p.entry===entry)),entry);
      assert.ok(lint.census.edges.some(e=>e.from==='artifact:spec/provenance/id-crosswalk.json'&&e.to==='artifact:spec/provenance/id-crosswalk.json#CW-001'&&e.relation==='derives'));
    }
  } finally {p.cleanup();}
});
test('registry board direction and omission perturb both consumers identically',t=>{
  const p=exportedFixture('fixtures/v2/full');
  try {
    const registry=loadReferenceRegistry(),id='front-matter-boards';
    const [baseLint,baseRunner]=pair(p);
    assert.equal(baseLint.bytes,baseRunner.bytes);
    const declared=baseLint.census.edges.filter(e=>e.provenance.some(p=>p.entry===id));
    assert.ok(declared.some(e=>e.from==='us:US-01'&&e.to==='board:W-01'&&e.relation==='renders'&&e.causal));
    const reversed=structuredClone(registry),entry=reversed.entries.find(e=>e.id===id);
    assert.deepEqual(entry.edge,{from:'source',to:'target'});
    entry.edge={from:'target',to:'source'};
    const [reverseLint,reverseRunner]=pair(p,{registry:reversed});
    assert.equal(reverseLint.error,undefined);
    assert.equal(reverseLint.bytes,reverseRunner.bytes);
    assert.notEqual(reverseLint.bytes,baseLint.bytes);
    for(const e of declared)assert.ok(reverseLint.census.edges.some(r=>r.from===e.to&&r.to===e.from&&r.relation===e.relation&&r.provenance.some(p=>p.entry===id)));
    assert.ok(!reverseLint.census.edges.some(e=>e.from==='us:US-01'&&e.to==='board:W-01'&&e.provenance.some(p=>p.entry===id)));
    const dropped={...registry,entries:registry.entries.filter(e=>e.id!==id)};
    const [dropLint,dropRunner]=pair(p,{registry:dropped});
    assert.equal(dropLint.error,undefined);
    assert.equal(dropLint.bytes,dropRunner.bytes);
    assert.notEqual(dropLint.bytes,baseLint.bytes);
    assert.ok(!dropLint.census.edges.some(e=>e.provenance.some(p=>p.entry===id)));
    assert.ok(!dropLint.census.edges.some(e=>e.from==='us:US-01'&&e.to==='board:W-01'&&e.relation==='renders'));
    const [restoredLint,restoredRunner]=pair(p);
    assert.equal(restoredLint.bytes,baseLint.bytes);assert.equal(restoredRunner.bytes,baseRunner.bytes);
    t.diagnostic('MUTATION '+JSON.stringify({entry:id,base:baseLint.census.edges.length,reversed:reverseLint.census.edges.length,dropped:dropLint.census.edges.length,equal:true,restored:true}));
  } finally {p.cleanup();}
});
test('unsupported registry location kinds fail closed in both consumers',()=>{
  const p=exportedFixture('fixtures/v2/full');
  try {
    const registry=structuredClone(loadReferenceRegistry());
    registry.entries[0].location.kind='unsupported-location';
    const [lint,runner]=pair(p,{registry});
    assert.match(lint.error,/Unsupported registry location kind/);
    assert.equal(lint.error,runner.error);
    assert.equal(lint.bytes,undefined);assert.equal(runner.bytes,undefined);
  } finally {p.cleanup();}
});
test('fixture file inventory covers source trees, recorded controls and every runner factory',t=>{
  const inventory=fixtureFileInventory();
  const runnerSources=inventory.filter(row=>row.role==='instantiated factory');
  assert.equal(runnerSources.length,7);
  for(const row of runnerSources)assert.ok(parityFixtures.some(f=>f.name.startsWith(row.file.slice(0,-4))));
  const index=JSON.parse(fs.readFileSync(repo+'/fixtures/v2/broken/index.json','utf8'));
  assert.equal(parityFixtures.filter(f=>f.name.startsWith('fixtures/v2/broken/')).length,index.entries.length+1);
  assert.deepEqual([...new Set(loadReferenceRegistry().entries.map(e=>e.location.kind))].sort(),['body-heading','body-table','front-matter','json']);
  t.diagnostic('FIXTURE-INVENTORY '+JSON.stringify(inventory));
});

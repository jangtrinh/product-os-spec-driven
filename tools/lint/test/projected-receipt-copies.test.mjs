import test from 'node:test';
import assert from 'node:assert/strict';
import {plant} from '../self-test.mjs';
import {approvePacket} from '../controls-v3.mjs';
import {store,read} from '../controls-evidence-heads.mjs';
import {lintSpec} from '../index.mjs';
import {lintCensus} from '../source-dependency-census.mjs';
import {runnerCensus} from '../../run/dependency-census.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {schemaLocations} from '../../lib/census-schema-locations.mjs';
import {loadReferenceRegistry} from '../../lib/census-registry.mjs';
import {createHash} from 'node:crypto';

const copy='assets/heads/identical.json',config={project:{spec_root:'.'}};
function censusPair(root) {
  const lint=lintCensus(projectCensusModel(root,config));
  const runner=runnerCensus(root,config);
  assert.deepEqual(lint.edges,runner.edges);
  assert.deepEqual(lint.unresolved,runner.unresolved);
  return lint;
}
test('projected identical receipt copies retain all original owners in either manifest order',context=>{
  let baseline;
  for(const reverse of [false,true]) {
    const f=plant(t=>{
      approvePacket(t);store(t,read(t,'assets/receipt.json'),copy);
      assert.deepEqual(read(t,copy),read(t,'assets/receipt.json'));
      if(reverse)t.json('spec.manifest.json',m=>m.gate_model.receipts.reverse());
    });
    try {
      const result=lintSpec(f.root);
      assert.equal(result.exitCode,0,JSON.stringify(result.problems.list));
      const census=censusPair(f.root);
      assert.deepEqual([...census.nodeSources.get('receipt:receipt-spec')].sort(),['assets/receipt.json',copy].sort());
      for(const file of ['assets/receipt.json',copy]) {
        const edge=census.edges.find(e=>e.from===`artifact:${file}`&&e.to==='receipt:receipt-spec'&&e.relation==='derives'&&e.causal);
        assert.ok(edge,file);
        assert.ok(edge.provenance.some(p=>p.source===file),JSON.stringify(edge));
      }
      assert.ok(!census.edges.some(e=>e.from.includes('/packets/')&&e.to==='receipt:receipt-spec'&&e.relation==='derives'));
      const bytes=JSON.stringify(census.edges);
      if(baseline)assert.equal(bytes,baseline);else baseline=bytes;
      context.diagnostic('PARITY '+JSON.stringify({fixture:`projected-receipt-copies/identical/reverse=${reverse}`,lint:census.edges.length,runner:census.edges.length,equal:true,complete:census.complete,sha256:createHash('sha256').update(bytes).digest('hex')}));
    } finally {f.cleanup();}
  }
});
test('projected non-identical receipt copies fail closed without choosing an owner',context=>{
  const f=plant(t=>{
    approvePacket(t);store(t,read(t,'assets/receipt.json'),copy);
    t.json(copy,r=>r.execution.command='different command');
    assert.notDeepEqual(read(t,copy),read(t,'assets/receipt.json'));
  });
  try {
    const result=lintSpec(f.root);
    assert.equal(result.exitCode,1);
    assert.ok(result.problems.errors.some(e=>e.code==='Q-RECEIPT'&&e.message.includes('different canonical content')),JSON.stringify(result.problems.list));
    assert.throws(()=>lintCensus(projectCensusModel(f.root,config)),/Ambiguous projected census owner/);
    assert.throws(()=>runnerCensus(f.root,config),/Ambiguous projected census owner/);
    context.diagnostic('PARITY '+JSON.stringify({fixture:'projected-receipt-copies/conflicting',lint:null,runner:null,equal:true,refusal:'Ambiguous projected census owner: receipt-spec'}));
  } finally {f.cleanup();}
});
test('projected receipt without a resident original owner remains census-incomplete',()=>{
  const f=plant(t=>{
    approvePacket(t,()=>{},'defer',{resident:()=>false});
    // Remove only the fixture's receipt declarations; the packet keeps its copy.
    t.json('spec.manifest.json',m=>{m.gate_model.receipts=[];m.design.evidence=[];});
  });
  try {
    const census=censusPair(f.root);
    assert.equal(census.complete,false);
    assert.ok(census.unresolved.some(e=>e.causal&&e.to==='receipt:receipt-spec'&&!e.from));
    assert.ok(!census.edges.some(e=>e.from.includes('/packets/')&&e.to==='receipt:receipt-spec'&&e.relation==='derives'));
  } finally {f.cleanup();}
});
test('receipt coalescing does not relax ambiguity of other typed packet projections',()=>{
  const screen={screen:'S01',state:'normal'},data={screens:[screen]};
  const corpus={payloads:['first.json','second.json'].map(file=>({type:'screen-inventory',file,data:{screens:[screen]}}))};
  assert.throws(()=>schemaLocations('packet-data',data,loadReferenceRegistry(),{corpus,file:'packet.json'}),/Ambiguous projected census owner: S01/);
});

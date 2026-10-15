import test from 'node:test';
import assert from 'node:assert/strict';
import {lintCensus, hasDependencyCensus} from '../source-dependency-census.mjs';
import {runnerCensus, dependencyCensus} from '../../run/dependency-census.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {graphConformanceView} from '../../lib/graph-certification-boundary.mjs';
import {censusGraphConformance} from '../../lib/census-graph-conformance.mjs';
import {loadReferenceRegistry} from '../../lib/census-registry.mjs';
import {certificateFixture, writeCandidate, remove} from './graph-certification-fixture.mjs';

function pair(p) {
  const lint = lintCensus(projectCensusModel(p.root, p.config)), runner = runnerCensus(p.root, p.config);
  assert.deepEqual(lint.edges, runner.edges);
  assert.deepEqual(lint.certificationBindings, runner.certificationBindings);
  assert.deepEqual([...graphConformanceView(lint).omitted], [...graphConformanceView(runner).omitted]);
  return lint;
}
test('full census retains terminal candidate binding while both conformance adapters refuse its independence', t => {
  const {p, graph, file} = certificateFixture(t), census = pair(p), id = `artifact:${file}`;
  const binding = census.edges.find(e => e.from === `artifact:${p.config.gates.graph}` && e.to === id && e.causal && e.relation === 'uses');
  assert.ok(binding, 'independently expected full relation');
  assert.ok(graphConformanceView(census).omitted.has(id));
  assert.ok(!graph.nodes.some(n => n.id === id));
  const represented = {...graph, nodes:[...graph.nodes,{id,kind:'artifact',source:file,revision:'1'}]};
  assert.equal(censusGraphConformance(census, represented, [id]).complete, false);
  assert.equal(dependencyCensus(p.root,p.config,represented)({kind:'artifact',id:file,artifacts:{}}), false);
  const model = projectCensusModel(p.root,p.config); model.graph = represented;
  assert.equal(hasDependencyCensus(model,[id]), false);
  assert.equal(dependencyCensus(p.root,p.config,graph).complete(), true);
});
test('ordinary consumer removes terminal exemption; existing lint and runner handles observe source changes', t => {
  const {p, graph, file} = certificateFixture(t), run = dependencyCensus(p.root,p.config,graph);
  const model = projectCensusModel(p.root,p.config); model.graph = graph;
  const target = ['artifact:'+p.config.gates.graph];
  assert.equal(run.complete(),true); assert.equal(hasDependencyCensus(model,target),true);
  const definition = p.definitions.prd, original = [...definition.inputs];
  definition.inputs.push(file); p.save();
  const census = pair(p);
  assert.ok(census.edges.some(e => e.from === `artifact:${file}` && e.to === 'gate:gate-prd' && e.causal));
  assert.equal(graphConformanceView(census).omitted.has(`artifact:${file}`),false);
  assert.equal(run.complete(),false); assert.equal(hasDependencyCensus(model,target),false);
  definition.inputs = original; p.save();
  assert.equal(run.complete(),true); assert.equal(hasDependencyCensus(model,target),true);
  p.write('spec/new-consumer.md','---\nid: consumer\ntype: contract\n---\n[Ordinary candidate dependency](../'+file+')\n');
  assert.equal(run.complete(),false);
  remove(p,'spec/new-consumer.md'); assert.equal(run.complete(),true);
});
test('mixed graph-plus-product candidate remains required; nonterminal certificate cannot be exempt', t => {
  const {p, graph, file} = certificateFixture(t);
  const mixed = writeCandidate(p,[{kind:'artifact',id:'named-census-artifact',artifacts:{[p.config.gates.graph]:'a'.repeat(64),'us/US-16.md':'b'.repeat(64)}}]);
  let census = pair(p), view = graphConformanceView(census);
  assert.equal(view.omitted.has(`artifact:${mixed.file}`),false);
  assert.ok(view.edges.some(e => e.to === `artifact:${mixed.file}` && e.from === `artifact:${p.config.gates.graph}` && e.causal));
  assert.equal(dependencyCensus(p.root,p.config,graph).complete(),false);
  remove(p,mixed.file);
  const consumer = writeCandidate(p,[{kind:'artifact',id:'ordinary',artifacts:{[file]:'c'.repeat(64)}}]);
  census = pair(p); view = graphConformanceView(census);
  assert.equal(view.omitted.has(`artifact:${file}`),false);
  assert.equal(view.omitted.has(`artifact:${consumer.file}`),false);
  assert.equal(dependencyCensus(p.root,p.config,graph).complete(),false);
  remove(p,consumer.file); assert.equal(dependencyCensus(p.root,p.config,graph).complete(),true);
});
for (const mutation of ['wrong-id','wrong-path','member-revision','filename','extra-property','multiple-members']) test(`invalid graph certificate receives no exemption: ${mutation}`,t => {
  const {p,graph,manifest} = certificateFixture(t), changed = structuredClone(manifest);
  if (mutation === 'wrong-id') changed.members[0].id = 'other';
  if (mutation === 'wrong-path') changed.members[0].artifacts = {'us/US-16.md':'a'.repeat(64)};
  if (mutation === 'member-revision') changed.members[0].revision = 'f'.repeat(64);
  if (mutation === 'extra-property') changed.extra = true;
  if (mutation === 'multiple-members') changed.members.push({kind:'ac',id:'US-16.AC-01',revision:'a'.repeat(64),artifacts:{'us/US-16.md':'a'.repeat(64)}});
  // Deliberately retain the old filename for every malformed observation.
  const file = mutation === 'filename' ? 'review/candidates/forged-name.json' : 'review/candidates/'+ 'e'.repeat(64)+'.json';
  p.write(file,changed);
  assert.equal(graphConformanceView(pair(p)).omitted.has(`artifact:${file}`),false);
  assert.equal(dependencyCensus(p.root,p.config,graph).complete(),false);
  remove(p,file); assert.equal(dependencyCensus(p.root,p.config,graph).complete(),true);
});
for (const mutation of ['missing','wrong-entry','unknown','case']) test(`closed boundary registry capability refuses ${mutation} in both adapters`,t => {
  const {p} = certificateFixture(t), registry = structuredClone(loadReferenceRegistry());
  const entry = registry.entries.find(e => e.id === 'candidate-manifest-members-artifacts');
  if (mutation === 'missing') delete entry.certification_boundary;
  if (mutation === 'wrong-entry') {registry.entries[0].certification_boundary = entry.certification_boundary; delete entry.certification_boundary;}
  if (mutation === 'unknown') entry.certification_boundary = 'blanket-envelope';
  if (mutation === 'case') entry.cases = [{certification_boundary:entry.certification_boundary}];
  assert.throws(()=>lintCensus(projectCensusModel(p.root,p.config),{registry}),/graph certification boundary/);
  assert.throws(()=>runnerCensus(p.root,p.config,undefined,[],{registry}),/graph certification boundary/);
  assert.doesNotThrow(()=>pair(p));
});
test('export rebasing and projected candidates keep their original declaring owner in either order',t => {
  const {p, manifest, file} = certificateFixture(t);
  const exportedFile = `spec/${file}`;
  p.write(exportedFile,manifest);
  const candidate = {type:'candidate-manifest',file:exportedFile,data:manifest,pathBase:'spec'};
  const packet = {type:'packet-data',file:'spec/packet-data.json',data:{membership:manifest},pathBase:'spec'};
  const pipeline = {type:'pipeline',file:'spec/SPEC.md#pipeline',data:{gates:{graph:p.config.gates.graph}},pathBase:'spec'};
  let prior;
  for (const payloads of [[candidate,packet,pipeline],[pipeline,packet,candidate]]) {
    const model = {docs:[],spec:{root:p.root},censusPayloads:payloads};
    const census = lintCensus(model), view = graphConformanceView(census);
    assert.ok(view.omitted.has(`artifact:${exportedFile}`));
    const edge = census.edges.find(e => e.to === `artifact:${exportedFile}` && e.causal);
    assert.equal(edge.from,`artifact:spec/${p.config.gates.graph}`);
    assert.deepEqual(edge.provenance.map(p=>p.source).sort(),['spec/packet-data.json',exportedFile].sort());
    if (prior) assert.deepEqual(census.edges,prior); prior = census.edges;
  }
  const forged = structuredClone(packet); forged.data.membership.members[0].revision = 'f'.repeat(64);
  const census = lintCensus({docs:[],spec:{root:p.root},censusPayloads:[candidate,forged,pipeline]});
  assert.equal(census.complete,false); assert.equal(graphConformanceView(census).omitted.size,0);
});

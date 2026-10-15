import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {lintCensus} from '../source-dependency-census.mjs';
import {runnerCensus} from '../../run/dependency-census.mjs';
test('optional context is absent when empty and has identical actual-file dependencies in both censuses',t=>{
 const p=projectFixture(t);p.config.stages.prd.optional_context=['context/prepared/**'];p.save();
 const edges=()=>{const a=lintCensus(projectCensusModel(p.root,p.config)),b=runnerCensus(p.root,p.config);assert.deepEqual(a.edges,b.edges);return a.edges.filter(e=>e.provenance.some(x=>x.entry==='pipeline-stages-optional-context'));};
 assert.equal(edges().length,0);p.write('context/prepared/source.md','Prepared');assert.ok(edges().some(e=>e.from==='artifact:context/prepared/source.md'&&e.to==='artifact:config/pipeline.yaml'&&e.causal));
});

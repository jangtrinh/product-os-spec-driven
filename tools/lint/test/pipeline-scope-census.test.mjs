import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectCensusModel} from '../../lib/census-source-corpus.mjs';
import {declaredRelationCensus} from '../../lib/declared-relation-census.mjs';
import {exportedFixture} from './census-parity-fixtures.mjs';

const scopeEntry = 'pipeline-project-spec-root';
const usesScopeEntry = census => census.edges.some(edge => edge.provenance.some(ref => ref.entry === scopeEntry));

test('spec-only export without config/pipeline.yaml emits no pipeline-project-spec-root node and records pipeline not in scope', () => {
  const p = exportedFixture('fixtures/v2/full');
  try {
    assert.equal(fs.existsSync(path.join(p.root, 'config/pipeline.yaml')), false);
    const census = declaredRelationCensus(projectCensusModel(p.root, p.config));
    assert.equal(census.pipelineScope, 'pipeline not in scope');
    assert.equal(usesScopeEntry(census), false);
    assert.equal(census.nodes.has('artifact:config/pipeline.yaml'), false);
    assert.equal(census.complete, true);
  } finally {p.cleanup();}
});

test('export with config/pipeline.yaml present keeps the pipeline-project-spec-root causal edge', () => {
  const p = exportedFixture('fixtures/v2/full');
  try {
    fs.mkdirSync(path.join(p.root, 'config'));
    fs.writeFileSync(path.join(p.root, 'config/pipeline.yaml'), 'project:\n  spec_root: .\n');
    const census = declaredRelationCensus(projectCensusModel(p.root, p.config));
    assert.equal(census.pipelineScope, 'pipeline in scope');
    assert.ok(census.edges.some(edge => edge.from === 'artifact:.' && edge.to === 'artifact:config/pipeline.yaml'
      && edge.causal && edge.provenance.some(ref => ref.entry === scopeEntry)));
  } finally {p.cleanup();}
});

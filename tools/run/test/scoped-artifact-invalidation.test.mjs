import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {projectFixture} from '../../../fixtures/runner/project-fixture.mjs';
import {certifiedFixtureGraph} from '../../../fixtures/runner/amendment-controls.mjs';
import {definitionRevision} from '../../lib/definition-scope.mjs';
import {sha256} from '../../lib/config/path-selection.mjs';
import {loadRegistries} from '../registries.mjs';
import {invalidateGates, passedGateEligible} from '../invalidate-gates.mjs';
import {writeGate} from '../gate-files.mjs';

const pins = {head: 'fixture-head', build: 'not-built'};
const read = (p, file) => JSON.parse(fs.readFileSync(path.join(p.root, file)));
const scopedFile = (p, def) => `${p.config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;

function approvedFixture(t) {
  const p = projectFixture(t);
  const defs = [17, 18, 19].map(number => {
    const output = `spec/scoped-${number}.txt`;
    const input = `source/scoped-${number}.txt`;
    p.write(output, `Independent output ${number}\n`);
    p.write(input, `Independent source ${number}\n`);
    const def = {...p.definitions.prd, id: `scope-${number}`, inputs: [input], outputs: [output],
      scope: {kind: 'ac', ids: [`US-${number}.AC-01`], revision: 'unbound'}};
    def.scope.revision = definitionRevision(def);
    p.write(`review/definitions/${def.id}/1.json`, def);
    p.config.gates.scoped_definitions.push({id: def.id, version: '1'});
    return def;
  });
  p.save();
  const initial = p.run(); assert.equal(initial.code, 2, initial.out);
  const aggregate = p.gate('prd');
  const template = read(p, `review/receipts/${aggregate.data.model.receipts[0]}.json`);
  const graph = {version: '1', complete: true, nodes: defs.flatMap(def => [
    {id: `ac:${def.scope.ids[0]}`, kind: 'ac', source: def.outputs[0], revision: '1'},
  ]), edges: []};
  certifiedFixtureGraph(p, graph, template, 'scoped-graph-census');
  aggregate.data.inputs[p.config.gates.graph] = sha256(fs.readFileSync(path.join(p.root, p.config.gates.graph)));
  writeGate(p.root, p.config, 'prd', 'PENDING', aggregate.data);
  for (const def of defs) {
    const file = scopedFile(p, def); const model = read(p, file);
    model.states.human = 'APPROVED'; model.decision = `fixture-po-${def.id}`; p.write(file, model);
  }
  p.approve('prd');
  const control = p.run(); assert.equal(control.code, 0, control.out);
  const registry = loadRegistries(p.root, p.config);
  assert.equal(passedGateEligible(p.root, p.config, registry, 'prd', {...p.gate('prd'), value: 'APPROVED'}, pins), true);
  return {p, defs, registry};
}

const mutations = {
  'one-byte edit': (p, defs, field) => {
    const file = path.join(p.root, defs[0][field][0]); const bytes = fs.readFileSync(file);
    bytes[bytes.length - 2] ^= 1; fs.writeFileSync(file, bytes); return [defs[0]];
  },
  delete: (p, defs, field) => { fs.unlinkSync(path.join(p.root, defs[0][field][0])); return [defs[0]]; },
  rename: (p, defs, field) => {
    const file = path.join(p.root, defs[0][field][0]); fs.renameSync(file, `${file}.renamed`); return [defs[0]];
  },
  'two-member swap': (p, defs, field) => {
    const files = defs.slice(0, 2).map(def => path.join(p.root, def[field][0]));
    const bytes = files.map(file => fs.readFileSync(file)); assert.notDeepEqual(bytes[0], bytes[1]);
    fs.writeFileSync(files[0], bytes[1]); fs.writeFileSync(files[1], bytes[0]); return defs.slice(0, 2);
  },
};

for (const field of ['outputs', 'inputs']) for (const [name, mutate] of Object.entries(mutations)) {
  test(`scoped-only ${field}: ${name} clears changed member approvals`, t => {
    const {p, defs, registry} = approvedFixture(t);
    const manifests = defs.map(def => read(p, scopedFile(p, def)).candidate.manifest);
    const affected = mutate(p, defs, field);
    const result = invalidateGates(p.root, p.config, registry, pins);
    assert.deepEqual([...result.invalidated], ['prd']);
    const aggregate = p.gate('prd'); assert.match(aggregate.raw, /^GATE: PENDING\n/);
    assert.equal(aggregate.data.approval, undefined); assert.equal(aggregate.data.model.decision, null);
    assert.equal(aggregate.data.model.states.freshness, 'STALE');
    for (const def of affected) {
      const model = read(p, scopedFile(p, def));
      assert.equal(model.states.human, 'PENDING'); assert.equal(model.states.freshness, 'STALE');
      assert.equal(model.decision, null); assert.equal(model.states.progress, 'draft');
      assert.deepEqual(model.scope, def.scope); assert.equal(model.candidate.manifest, manifests[defs.indexOf(def)]);
      for (const id of model.receipts) assert.equal(read(p, `review/freshness/${id}.json`).freshness, 'STALE');
    }
  });
}

test('complete dependency proof retains unrelated scoped approval and exact member hashes', t => {
  const {p, defs, registry} = approvedFixture(t);
  const file = scopedFile(p, defs[2]); const before = fs.readFileSync(path.join(p.root, file));
  mutations['one-byte edit'](p, defs, 'outputs');
  const result = invalidateGates(p.root, p.config, registry, pins);
  assert.equal(result.impact?.complete, true);
  assert.deepEqual([...result.invalidated], ['prd']);
  assert.deepEqual(fs.readFileSync(path.join(p.root, file)), before);
  const model = read(p, file); assert.equal(model.states.human, 'APPROVED'); assert.equal(model.states.freshness, 'CURRENT');
  assert.equal(model.decision, `fixture-po-${defs[2].id}`);
  for (const id of model.receipts) assert.equal(fs.existsSync(path.join(p.root, `review/freshness/${id}.json`)), false);
});

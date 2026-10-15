import {definitionRevision} from '../../tools/lib/definition-scope.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical} from '../../tools/lib/config/strict-json.mjs';
import {sha256} from '../../tools/lib/config/path-selection.mjs';
import {projectFixture} from './project-fixture.mjs';
import {loadPacketSpec} from '../../tools/reader/packet/spec-context.mjs';
import {buildPacketData} from '../../tools/reader/packet/packet-data.mjs';
import {makeSupportBinder} from '../../tools/reader/packet/source-binding.mjs';
import {composedPromptFiles} from '../../tools/run/composed-prompt-files.mjs';

export function batchFixture(t) {
  const p = projectFixture(t); const initial = p.run();
  if (initial.code !== 2) throw new Error(initial.out);
  const packetPath = fileURLToPath(new URL('../../format/fixtures/review-packet/packet-data.json', import.meta.url));
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  p.write('us/US-16.md', '---\nid: US-16\ntype: us\nscenarios: [{id: SCN-16-01, ac: [AC-01, AC-02]}]\n---\n## 4. Acceptance criteria\n| ID | Then |\n|---|---|\n| AC-01 | Exact saved selection |\n| AC-02 | Next outcome |\n');
  p.write('decisions/decisions.md', 'D1 PO ruled exact saved selection and no UI.\n');
  p.write('evidence/check.txt', 'Actual fixture assertions are verified by the test suite; not product acceptance.\n');
  p.config.project.spec_root = '.';
  p.write('spec.manifest.json', {format: '2', name: 'batch-fixture', language: 'en'});
  const artifacts = Object.fromEntries(['decisions/decisions.md', 'us/US-16.md'].map(file => [file, sha256(fs.readFileSync(path.join(p.root, file)))]));
  const ids = ['US-16.AC-01', 'US-16.AC-02'];
  const membership = {version: '1', members: ids.map(id => ({kind: 'ac', id, revision: sha256(canonical(artifacts)), artifacts}))};
  const digest = sha256(canonical(membership));
  packet.membership = membership; packet.scope = {kind: 'ac', ids, revision: sha256(canonical(membership.members))};
  packet.baseline = {head: 'baseline-head', base: 'baseline-head', build: 'not-built', manifest: sha256('baseline')};
  packet.candidate = {head: p.gate('prd').data.model.candidate.head, base: 'baseline-head', build: 'not-built', manifest: digest};
  p.config.gates.baseline = 'review/baseline.json'; p.write('review/baseline.json', {id: 'baseline-1', head: packet.baseline.head, manifest: packet.baseline.manifest});
  p.write(`review/candidates/${digest}.json`, membership);
  const receipt = packet.evidence[0];
  receipt.scope = packet.scope; receipt.pins = {...packet.candidate, rules: p.config.versions.ruleset, evaluator: p.config.agents.reviewer.command}; receipt.domain = 'spec';
  receipt.review.evaluator_version = p.config.agents.reviewer.command;
  receipt.artifacts = {...artifacts, 'evidence/check.txt': sha256(fs.readFileSync(path.join(p.root, 'evidence/check.txt')))};
  for (const file of [p.config.review.rubric, ...composedPromptFiles('reviewer')]) receipt.artifacts[file] = sha256(fs.readFileSync(path.join(p.root, file)));
  receipt.review.ruleset_version = p.config.versions.ruleset; receipt.review.prompt_version = p.config.versions.templates;
  receipt.coverage = {ac: ids, passed: ids, scenarios: ['US-16.SCN-16-01'], na: []};
  receipt.review.inputs = Object.keys(artifacts);
  receipt.review.criteria.push({id: 'semantic-propagation', mandatory: true, score: 2, evidence: 'Fixture source AC and scenario match exact selected value'});
  p.write('review/receipts/fixture-receipt.json', receipt);
  packet.change.propagation[0].ac = ids; packet.change.propagation[0].status = 'verified';
  packet.requests = ids.map(id => ({id, reason: 'Review explicit fixture AC'}));
  const baseDefinition = p.definitions.prd;
  for (const [index, id] of ids.entries()) {
    const scope = {kind: 'ac', ids: [id], revision: 'unbound'};
    const definition = {...baseDefinition, id: `scope-${index}`, scope};
    scope.revision = definitionRevision(definition);
    p.write(`review/definitions/${definition.id}/1.json`, definition); p.config.gates.scoped_definitions.push({id: definition.id, version: '1'});
    const model = {...p.gate('prd').data.model, definition: {id: definition.id, version: '1'}, scope, candidate: packet.candidate, receipts: ['fixture-receipt']};
    p.write(`review/gates/scoped/${definition.id}/${scope.revision}.json`, model);
  }
  const changeSet = {id: packet.change.id, baseline: packet.baseline, candidate: packet.candidate, scope: packet.scope, source: packet.change.source, reason: packet.change.reason, state: 'Reviewed', impact: packet.change.impact, propagation: packet.change.propagation, po_decision: null, regates: ['scope-0', 'scope-1'], packet: null, receivers: []};
  p.write(`review/changes/${changeSet.id}.json`, changeSet);
  const decision = {id: 'fixture-decision', packet_id: '', data_sha256: '', scope: packet.scope, pins: packet.candidate, by: 'po@example.test', at: new Date().toISOString(), default: 'approve', reason: 'PO fixture asserted approval', overrides: [], exceptions: []};
  const saveBatch = () => {
    const dataSha = sha256(canonical(packet)); decision.packet_id = `packet-${dataSha}`; decision.data_sha256 = dataSha;
    p.write('packet-data.json', packet); p.write('decision.json', decision); p.save();
  };
  const rebuildBatch = () => {
    const spec = loadPacketSpec(p.root);
    const support = makeSupportBinder({snapshotDir: p.root, specRoot: ''});
    Object.assign(packet, buildPacketData({root: p.root, config: p.config, changeId: changeSet.id, spec, specRoot: '', support}).data);
    saveBatch();
  };
  rebuildBatch();
  const importBatch = (extra = []) => p.run(['--import-decision', 'decision.json', '--packet-data', 'packet-data.json', '--as', 'po@example.test', ...extra]);
  return {...p, packet, decision, changeSet, saveBatch, rebuildBatch, importBatch};
}

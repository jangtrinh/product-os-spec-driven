import {definitionRevision} from '../../tools/lib/definition-scope.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonical } from '../../tools/lib/config/strict-json.mjs';
import { sha256 } from '../../tools/lib/config/path-selection.mjs';
import { projectFixture } from '../runner/project-fixture.mjs';
import {composedPromptFiles} from '../../tools/run/composed-prompt-files.mjs';

/* A runner project whose exported spec is fixtures/v2/full and whose Reviewed change set asks for US-01.AC-01 and US-01.AC-02.
   Built like fixtures/runner/batch-fixture.mjs so the runner's own decision import accepts what the reader's packet produces. */
const FULL = fileURLToPath(new URL('../v2/full', import.meta.url));
const ids = ['US-01.AC-01', 'US-01.AC-02'];
const FILES = ['spec/assets/inventory.json', 'spec/contract/FC-001.md', 'spec/decisions/decision-log.md', 'spec/ux/ui-contract.md', 'spec/us/US-01.md'];

export function packetProject(t, { mutate, files = FILES, exception = false } = {}) {
  const p = projectFixture(t);
  const initial = p.run();
  if (initial.code !== 2) throw new Error(initial.out);
  fs.cpSync(FULL, path.join(p.root, 'spec'), { recursive: true });
  p.write('evidence/check.txt', 'Local assertions run by the fixture suite; not product acceptance.\n');
  const read = (f) => sha256(fs.readFileSync(path.join(p.root, f)));
  const artifacts = Object.fromEntries(files.map((f) => [f, read(f)]));
  const membership = { version: '1', members: ids.map((id) => ({ kind: 'ac', id, revision: sha256(canonical(artifacts)), artifacts })) };
  const digest = sha256(canonical(membership));
  const scope = { kind: 'ac', ids, revision: sha256(canonical(membership.members)) };
  const baseline = { head: 'baseline-head', base: 'baseline-head', build: 'not-built', manifest: sha256('baseline') };
  const candidate = { head: p.gate('prd').data.model.candidate.head, base: 'baseline-head', build: 'not-built', manifest: digest };
  p.config.gates.baseline = 'review/baseline.json';
  p.write('review/baseline.json', { id: 'baseline-1', head: baseline.head, manifest: baseline.manifest });
  p.write(`review/candidates/${digest}.json`, membership);
  const nodes = ['US-01', 'US-02', 'US-03'].flatMap((us) => [{ id: `us:${us}`, kind: 'us', revision: '1', source: `spec/us/${us}.md` }, ...[1, 2].filter((n) => us !== 'US-02' || n === 1).map((n) => ({ id: `ac:${us}.AC-0${n}`, kind: 'ac', revision: '1', source: `spec/us/${us}.md` }))]);
  const edges = nodes.filter((n) => n.kind === 'ac').map((n) => ({ from: `us:${n.id.slice(3).split('.')[0]}`, to: n.id, relation: 'derives', source: n.source, revision: '1' }));
  p.write('review/graph.json', { version: '1', complete: true, nodes, edges });
  const receipt = {
    id: 'fixture-receipt', scope, at: '2026-10-07T03:00:00Z', freshness: 'CURRENT', domain: 'spec',
    pins: { ...candidate, rules: p.config.versions.ruleset, evaluator: p.config.agents.reviewer.command },
    execution: { command: 'fixture local assertions', cwd: 'evidence', exit: 0, result: 'PASS', selected: 1, total: 1, skipped: [], baseline_debt: [], red_controls: ['stale-pins'], recovery: 'rerun the fixture suite' },
    review: { builder: 'dev', reviewer: 'qc', independent: true, evaluator_version: p.config.agents.reviewer.command, prompt_version: p.config.versions.templates, ruleset_version: p.config.versions.ruleset, verdict: 'PASS', inputs: files,
      criteria: [{ id: 'source', mandatory: true, score: 2, evidence: 'D2' }, { id: 'semantic-propagation', mandatory: true, score: 2, evidence: 'AC-01 and AC-02 wording match the amended contract rule' }], findings: [] },
    coverage: { ac: ids, passed: ids, scenarios: ['US-01.SCN-01-01', 'US-01.SCN-01-02'], na: [] },
    artifacts: { ...artifacts, 'evidence/check.txt': read('evidence/check.txt'), [p.config.review.rubric]: read(p.config.review.rubric), ...Object.fromEntries(composedPromptFiles('reviewer').map(file => [file, read(file)])) },
  };
  p.write('review/receipts/fixture-receipt.json', receipt);
  const impact = [{ node: 'ac:US-01.AC-01', domain: 'spec', classification: 'direct', reason: 'The saving rule changed', path: ['us:US-01', 'ac:US-01.AC-01'] }, { node: 'ac:US-01.AC-02', domain: 'spec', classification: 'transitive', reason: 'Shares the save flow', path: ['us:US-01', 'ac:US-01.AC-01', 'ac:US-01.AC-02'] }];
  const propagation = ids.map((id, i) => ({ behavior: i ? 'Reject a duplicate name with a hint' : 'Save a filter under a valid name', ac: [id], scenario: [`US-01.SCN-01-0${i + 1}`], ui: ['S01/normal'], evidence: ['fixture-receipt'], status: 'verified', review: 'QC read the new wording against the AC' }));
  const baseDef = p.definitions.prd;
  ids.forEach((id, i) => {
    const s = { kind: 'ac', ids: [id], revision: 'unbound' };
    s.revision=definitionRevision({...baseDef,id:`scope-${i}`,scope:s});
    p.write(`review/definitions/scope-${i}/1.json`, { ...baseDef, id: `scope-${i}`, scope: s }); p.config.gates.scoped_definitions.push({ id: `scope-${i}`, version: '1' });
    p.write(`review/gates/scoped/scope-${i}/${s.revision}.json`, { ...p.gate('prd').data.model, definition: { id: `scope-${i}`, version: '1' }, scope: s, candidate, receipts: ['fixture-receipt'] });
  });
  const changeSet = { id: 'CS-filter', baseline, candidate, scope, source: 'A-01', reason: 'Clarify the saving wording', state: 'Reviewed', impact, propagation, po_decision: null, regates: ['scope-0', 'scope-1'], packet: null, receivers: [] };
  p.write('review/changes/CS-filter.json', changeSet);
  /* An active applicability exception over the packet scope, for packets that must show and cite one. */
  if (exception) p.write('review/exceptions/applicable-1.json', { id: 'applicable-1', kind: 'applicability', scope, source: 'D1', reason: 'Only the original fixture scope is applicable', by: 'po@example.test', at: '2026-10-07T00:00:00Z', expires: '2030-01-09T00:00:00Z', deferred_gates: [], compensating_checks: ['spec review'], non_waivable: ['mandatory quality'], status: 'active' });
  if (mutate) mutate(p, { changeSet, receipt, membership });
  p.save();
  return { ...p, spec: path.join(p.root, 'spec'), changeSet, receipt, membership, scope, candidate };
}

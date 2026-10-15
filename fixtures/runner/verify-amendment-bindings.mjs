import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {amendmentControls, absentVersionHeads, changedMemberHeads} from './amendment-controls.mjs';
import {censusControls, censusFixture} from './dependency-census-controls.mjs';
import {headControls, headFixture, snapshot, put, witness} from './evidence-head-controls.mjs';
import {projectFixture} from './project-fixture.mjs';
import {dependencyCensus} from '../../tools/run/dependency-census.mjs';
import {canonical} from '../../tools/lib/config/strict-json.mjs';
import {hashes, inventory, sha256} from '../../tools/lib/config/path-selection.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)); const repo = path.resolve(here, '../..');
const output = (name, body) => fs.writeFileSync(path.join(here, name), body);
const cleanup = p => fs.rmSync(p.root, {recursive: true, force: true});
const cases = []; const greens = [];
const paired = (name, setup, group) => {
  const {p, red, restore, green} = setup();
  try {
    const before = snapshot(p); const rejected = red(); assert.equal(rejected.code, 2, rejected.out); assert.deepEqual(snapshot(p), before);
    restore(); const accepted = green(); assert.equal(accepted.code, 0, accepted.out);
    cases.push({group, name, red_exit: rejected.code, red_mutation: 'none (all project files hashed)', reason: rejected.out.trim(), green_exit: accepted.code, green_mutation: 'expected operation writes or read-only API'});
  } finally {cleanup(p);}
};
for (const [name, setup] of amendmentControls) paired(name, () => setup(null), 'bindings');
for (const control of censusControls) paired(control[0], () => censusFixture(null, control), 'declared census');
for (const [name, mutate] of headControls) paired(name, () => {
  const {p, green} = headFixture(null, mutate); return {p, red: () => p.importBatch(), restore: green, green: () => p.importBatch()};
}, 'existing evidence-head regression');
for (const pin of ['evaluator', 'rules']) {
  const {p, original, other, heads} = absentVersionHeads(null, pin);
  try {
    const selected = heads(); assert.equal(selected.eligible, true); assert.deepEqual(new Set(selected.heads.map(row => row.id)), new Set([original.id, other.id]));
    greens.push({name: `absent ${pin} pin: different versions are different eligible keys`, exit: 0, heads: selected.heads.map(row => row.id), mutation: 'none (read-only selection)'});
    other.supersedes = [{id: original.id, reason: 'Cross-version retirement must reject'}]; put(p, other); witness(p, other);
    const before = snapshot(p); const rejected = p.importBatch(); assert.equal(rejected.code, 2, rejected.out); assert.deepEqual(snapshot(p), before);
    delete other.supersedes; put(p, other); const accepted = p.importBatch(); assert.equal(accepted.code, 0, accepted.out);
    cases.push({group: 'bindings', name: `absent ${pin} pin: cross-version retirement`, red_exit: 2, red_mutation: 'none (all project files hashed)', reason: rejected.out.trim(), green_exit: 0, green_mutation: 'expected approval projections'});
  } finally {cleanup(p);}
}
{
  const {p, old, fresh, heads} = changedMemberHeads(null);
  try {const before = snapshot(p); const selected = heads(); assert.equal(selected.eligible, true); assert.deepEqual(selected.heads.map(row => row.id), [fresh.id]); assert.deepEqual(snapshot(p), before);
    greens.push({name: 'changed bytes in one member retire the prior two-member FAIL', exit: 0, heads: [fresh.id], preserved_fail: old.id, mutation: 'none (read-only selection)'});
  } finally {cleanup(p);}
}
let manual;
{
  const p = projectFixture(null);
  try {
    p.config.agents.writer.command = 'manual'; p.save(); p.write('pasted-result.txt', 'Generated prd\n');
    const result = p.run(['--paste', 'pasted-result.txt']); assert.equal(result.code, 2, result.out); assert.match(p.gate('prd').raw, /^GATE: PENDING/);
    manual = {exit: 2, gate: p.gate('prd').raw.split('\n')[0], independent_review: p.gate('prd').data.review.independent, mutation: 'expected manual checkpoint/observation/gate writes'};
    output('am9ef-manual.txt', `$ node tools/run/run.mjs --project <isolated fixture> --build not-built --paste pasted-result.txt\n${result.out}\n${canonical(manual)}\nLocal mechanism evidence; no human approval inferred.\n`);
  } finally {cleanup(p);}
}
let realSource;
{
  const p = projectFixture(null); const source = 'format/fixtures/review-packet/us/US-16.md';
  try {
    const bytes = fs.readFileSync(path.join(repo, source)); p.write('spec/us/US-16.md', bytes.toString());
    p.write('spec/prd/requirements.md', '---\nid: PRD\ntype: prd\n---\n| REQ-01 | Saved selection | Original fixture |\n');
    const nodes = [['req:REQ-01', 'req', 'spec/prd/requirements.md'], ['us:US-16', 'us', 'spec/us/US-16.md'], ['ac:US-16.AC-01', 'ac', 'spec/us/US-16.md'], ['scenario:US-16.SCN-16-01', 'scenario', 'spec/us/US-16.md']].map(([id, kind, file]) => ({id, kind, source: file, revision: sha256(fs.readFileSync(path.join(p.root, file)))}));
    const edges = [['req:REQ-01', 'us:US-16', 'derives'], ['us:US-16', 'ac:US-16.AC-01', 'derives'], ['ac:US-16.AC-01', 'scenario:US-16.SCN-16-01', 'verifies']].map(([from, to, relation]) => ({from, to, relation, source: 'spec/us/US-16.md', revision: '1'}));
    const graph = {version: '1', complete: true, nodes, edges}; const member = {kind: 'ac', id: 'US-16.AC-01', artifacts: hashes(p.root, ['spec/us/US-16.md'])};
    const before = snapshot(p); assert.equal(dependencyCensus(p.root, p.config, graph)(member), true);
    const missing = {...graph, nodes: nodes.filter(node => node.kind !== 'req'), edges: edges.slice(1)};
    assert.equal(dependencyCensus(p.root, p.config, missing)(member), false); assert.deepEqual(snapshot(p), before);
    realSource = {source, source_sha256: sha256(bytes), bound_sha256: member.artifacts['spec/us/US-16.md'], full_chain: true, missing_req: false, mutation: 'none', boundary: 'Actual repository source bytes through read-only census; no product semantic acceptance'};
    assert.equal(realSource.source_sha256, realSource.bound_sha256);
  } finally {cleanup(p);}
}
const sourceFiles = [...inventory(repo, 'tools/run'), ...inventory(repo, 'tools/lib/config'), ...inventory(repo, 'fixtures/runner')].filter(file => /\.(mjs|js)$/.test(file));
const evidence = {at: new Date().toISOString(), node: process.version, sources: Object.fromEntries(sourceFiles.map(file => [file, sha256(fs.readFileSync(path.join(repo, file)))])), cases, greens, manual, real_source: realSource, boundary: 'Builder local verification only; independent V4c, live-provider and owner acceptance remain open'};
output('am9ef-verification.json', JSON.stringify(evidence, null, 2) + '\n');
output('am9ef-verification.txt', cases.map(row => `${row.group}: ${row.name} | RED exit ${row.red_exit} | mutation none | GREEN exit ${row.green_exit} | ${row.green_mutation}`).join('\n') + '\n' + greens.map(row => `GREEN ${row.name} | exit ${row.exit} | ${row.mutation}`).join('\n') + `\nManual: exit 2 / PENDING.\nReal source: ${realSource.source_sha256}; full census true; missing REQ false; no mutation.\n${evidence.boundary}\n`);
output('am9ef-evidence.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="380"><rect width="1120" height="380" fill="#f7f9fc"/><g font-family="Arial,sans-serif" fill="#18253c"><text x="36" y="44" font-size="26">Runner evidence bindings and declared dependency census</text><text x="36" y="80" font-size="17">${cases.length} paired RED controls: exit 2, zero project file mutations; restored GREENs: exit 0</text><rect x="36" y="108" width="505" height="142" rx="12" fill="#fff0df"/><rect x="573" y="108" width="510" height="142" rx="12" fill="#e5f5eb"/><text x="54" y="147" font-size="20">Receipt binding rejects before state writes</text><text x="54" y="183" font-size="16">Review versions and full current scope revision</text><text x="54" y="217" font-size="16">Five consumers share one revision validator</text><text x="591" y="147" font-size="20">Source declarations establish the census</text><text x="591" y="183" font-size="16">Ancestors, ownership, scenarios, screens, boards</text><text x="591" y="217" font-size="16">A complete flag cannot replace missing relations</text><text x="36" y="293" font-size="18">Manual writer: exit 2 / PENDING; source-byte census verified</text><text x="36" y="333" font-size="15">Local fixture evidence. Independent V4c and owner acceptance remain open.</text></g></svg>\n`);
console.log(fs.readFileSync(path.join(here, 'am9ef-verification.txt'), 'utf8'));

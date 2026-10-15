import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {hashes, localPath, sha256, RunnerError} from '../lib/config/path-selection.mjs';
import {readRecord} from '../lib/config/schema-validation.mjs';
import {candidateFor, jsonFile} from './registries.mjs';
import {gateHeads, noImpactProof} from './gate-evidence.mjs';
import {registryOwnGateExclusions} from './own-gate-exclusions.mjs';

export function stageCandidates(root, definitions, skipped, pins, additionalInputs = [], exclude = registryOwnGateExclusions(root, definitions[0].stage, definitions)) {
  const rows = definitions.map(definition => ({definition, ...candidateFor(root, definition, skipped, additionalInputs, exclude), pins}));
  const all = new Map();
  for (const row of rows) for (const member of row.manifest.members) {
    const key = `${member.kind}:${member.id}`;
    if (all.has(key) && canonical(all.get(key)) !== canonical(member)) throw new RunnerError(`Conflicting candidate member definitions: ${key}`);
    all.set(key, member);
  }
  const members = [...all.values()].sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const manifest = {version: '1', members}; const digest = sha256(canonical(manifest));
  return rows.map(row => ({...row, manifest, digest}));
}
export function retainScoped(root, config, candidate, previous, {noImpact} = {}) {
  if (!previous?.data.invalidation?.reason.startsWith('Typed causal impact closure')) return null;
  const def = candidate.definition;
  const file = `${config.gates.dir}/scoped/${def.id}/${def.scope.revision}.json`;
  if (!fs.existsSync(localPath(root, file))) return null;
  const model = readRecord(root, file, 'gate-state.schema.json');
  if (!['APPROVED', 'NOT_REQUIRED'].includes(model.states.human) || model.states.freshness !== 'CURRENT' || canonical(model.scope) !== canonical(candidate.scope) || ['head', 'base', 'build'].some(key => model.candidate[key] !== candidate.pins[key])) return null;
  const old = readRecord(root, `${config.gates.candidates_dir}/${model.candidate.manifest}.json`, 'candidate-manifest.schema.json');
  const select = manifest => manifest.members.filter(member => member.kind === def.scope.kind && def.scope.ids.includes(member.id));
  if (canonical(select(old)) !== canonical(select(candidate.manifest))) return null;
  const pins = {head: candidate.pins.head, base: candidate.pins.base, build: candidate.pins.build, manifest: candidate.digest};
  const proof = noImpact ?? noImpactProof(jsonFile(root, config.gates.graph), pins, previous.data.invalidation.impact ? {candidate: pins, impact: previous.data.invalidation.impact} : null, {root, config});
  if (!gateHeads(root, config, model, def, {pins, noImpact: proof}).eligible) return null;
  // AM-7: preserve exact member approval; the aggregate digest may move.
  return {...model, candidate: {...model.candidate, manifest: candidate.digest}};
}

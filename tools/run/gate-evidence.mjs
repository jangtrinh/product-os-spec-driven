import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {inventory, localPath, sha256, RunnerError} from '../lib/config/path-selection.mjs';
import {jsonFile} from './registries.mjs';
import {loadEvidence, selectHeads} from './evidence-heads.mjs';
import {receiptMembers} from './receipt-keys.mjs';
import {dependencyCensus} from './dependency-census.mjs';
import {versionsUsed} from './gate-files.mjs';

export function noImpactProof(graph, pins, closure, {root, config} = {}) {
  if (!root || !config || !graph.complete || !closure || canonical(closure.candidate) !== canonical(pins) || closure.impact.some(row => row.classification === 'unknown')) return () => false;
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (closure.impact.some(row => !nodes.has(row.node) || row.path.at(-1) !== row.node || !row.path.length || row.path.some(id => !nodes.has(id)) || row.path.slice(1).some((id, index) => !graph.edges.some(edge => edge.from === row.path[index] && edge.to === id && !['mentions', 'supersedes'].includes(edge.relation))))) return () => false;
  const reached = new Set(); const queue = closure.impact.map(row => row.path[0]);
  while (queue.length) {
    const id = queue.shift(); if (reached.has(id)) continue; reached.add(id);
    for (const edge of graph.edges) if (edge.from === id && !['mentions', 'supersedes'].includes(edge.relation)) queue.push(edge.to);
  }
  return (_receipt, member) => {
    const id = `${member.kind}:${member.id}`;
    return nodes.has(id) && dependencyCensus(root, config, graph, Object.keys(member.artifacts))(member) && !reached.has(id) && ![...reached].some(key => Object.hasOwn(member.artifacts, nodes.get(key)?.source));
  };
}
export function storedNoImpact(root, config, graph, pins) {
  if (!fs.existsSync(localPath(root, config.gates.changes_dir))) return () => false;
  const proofs = inventory(root, config.gates.changes_dir).filter(file => file.endsWith('.json')).map(file => jsonFile(root, file)).filter(change => canonical(change.candidate) === canonical(pins)).map(change => noImpactProof(graph, pins, change, {root, config}));
  return (receipt, member) => proofs.length > 0 && proofs.every(proof => proof(receipt, member));
}
export function memberQueries(manifest, scope, pins, settings = {}) {
  return manifest.members.filter(member => member.kind === scope.kind && scope.ids.includes(member.id)).map(member => ({member, members: manifest.members, pins, domain: 'spec', ...settings}));
}
export function gateHeads(root, config, model, definition, settings = {}) {
  const manifest = jsonFile(root, `${config.gates.candidates_dir}/${model.candidate.manifest}.json`);
  const context = settings.context ?? loadEvidence(root, config);
  const queries = memberQueries(manifest, model.scope, settings.pins ?? model.candidate, {handoff: definition.stage === 'handoff', reviewRequired: config.review.enabled, noImpact: settings.noImpact,
    allowPendingMinor: settings.allowPendingMinor, usedVersions: versionsUsed(config, definition.stage, [definition])});
  const rows = queries.map(query => selectHeads(context, query));
  return {eligible: rows.length > 0 && rows.every(row => row.eligible), heads: rows.flatMap(row => row.heads), reason: rows.find(row => !row.eligible)?.reason};
}
export function censusEligible(context, graph, pins) {
  const file = context.config.gates.graph;
  const queries = new Map();
  for (const record of context.records.values()) {
    // currentFor checks actual source bytes before validating these rebuilt targets.
    const members = receiptMembers(context, record).map(member => ({...member, revision: sha256(canonical(member.artifacts))}));
    const bound = members.filter(member => ['artifact', 'bundle'].includes(member.kind) && Object.hasOwn(member.artifacts, file));
    for (const member of bound) {
      const current = {...pins, manifest: pins.manifest ?? record.pins.manifest};
      const filter = row => row.scope.kind === member.kind && row.scope.ids.includes(member.id);
      queries.set(canonical({member, domain: record.domain, pins: current}), {member, members, pins: current, domain: record.domain, graphProof: true, reviewRequired: true, filter});
    }
  }
  let proved = false;
  for (const query of queries.values()) {
    const result = selectHeads(context, query);
    const scored = result.heads.every(record => record.review.criteria.some(row => row.id === 'graph-completeness' && row.mandatory && row.score === 2 && row.evidence));
    if (result.heads.length && (!result.eligible || !scored)) throw new RunnerError(result.reason ?? 'Ineligible current graph evidence: missing mandatory completeness score', 2);
    proved ||= result.eligible && scored;
  }
  return graph.complete && proved && dependencyCensus(context.root, context.config, graph).complete();
}

import {requireHeads} from './evidence-heads.mjs';
import {noImpactProof} from './gate-evidence.mjs';

export function approvalHeads(context, manifest, scope, pins, graph, closure, claims = [], handoff = () => false) {
  const noImpact = noImpactProof(graph, pins, closure, context);
  const queries = [];
  for (const member of manifest.members) {
    const claimed = claims.filter(record => record.scope.kind === member.kind && record.scope.ids.includes(member.id));
    const domains = new Set(claimed.map(record => record.domain));
    if (member.kind === scope.kind && scope.ids.includes(member.id)) domains.add('spec');
    for (const domain of domains) queries.push({member, members: manifest.members, pins, domain, reviewRequired: true, handoff: handoff(member), noImpact});
  }
  return requireHeads(context, queries);
}

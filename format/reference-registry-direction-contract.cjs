'use strict';
// Expectations authored from the contracts, independently of registry edge values.
// Each row names the prerequisite role, dependent role and the owning source section.
const rows = [
  ['front-matter-trace-req', 'target', 'REQ', 'traced document', 'SPEC-FORMAT-v2.md', '3. Front matter'],
  ['front-matter-screens', 'source', 'US behavior', 'screen/state', 'SPEC-FORMAT-v2.md', '3. Front matter'],
  ['front-matter-boards', 'source', 'US behavior', 'board', 'SPEC-FORMAT-v2.md', '3. Front matter'],
  ['front-matter-defs-scenario-id', 'source', 'owning US', 'scenario', 'SPEC-FORMAT-v2.md', '3. Front matter'],
  ['front-matter-defs-scenario-ac', 'target', 'AC expectation', 'scenario', 'SPEC-FORMAT-v2.md', '3. Front matter'],
  ['front-matter-defs-scenario-test', 'source', 'scenario expectation', 'test', 'SPEC-FORMAT-v2.md', '3. Front matter'],
  ['front-matter-amendments-id', 'source', 'contract', 'amendment', 'SPEC-FORMAT-v2.md', '3. Front matter'],
  ['design-profile-tokens-generated', 'source', 'owned tokens', 'generated mirrors', 'design-model.md', '1. Adapter boundary, authority and token ownership'],
  ['screen-inventory-screens-scenarios', 'source', 'screen/state behavior', 'scenario verification', 'design-model.md', '2. Identity namespaces and screen/state inventory'],
  ['screen-inventory-screens-boards', 'source', 'screen/state behavior', 'board', 'design-model.md', '2. Identity namespaces and screen/state inventory'],
  ['ui-contract-used-by', 'source', 'UI behavior', 'scenario verification', 'design-model.md', '4. Behavioral ui-contract extension'],
  ['us-ac-identity', 'source', 'US', 'owned AC', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['us-ac-scenarios', 'source', 'AC expectation', 'scenario', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['prd-req-identity', 'source', 'declaring PRD document', 'owned REQ identity', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['prd-req-stories', 'source', 'REQ', 'derived US', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['index-story-req', 'target', 'REQ', 'indexed US', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['contract-amendment-heading', 'source', 'contract', 'amendment', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['ui-table-used-by', 'source', 'UI behavior', 'scenario verification', 'design-model.md', '4. Behavioral ui-contract extension'],
  ['epic-map-epics-page', 'source', 'build + epic map', 'derived readable page', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['epic-map-epics-capabilities-us', 'target', 'build US', 'readable capability', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['epic-map-epics-capabilities-merged-us', 'target', 'merged build US', 'readable capability', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['epic-map-epics-capabilities-req', 'target', 'REQ union', 'readable capability', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['epic-map-hidden-decision', 'target', 'scope decision', 'hidden map placement', 'SPEC-FORMAT-v2.md', '6. Required structure per type'],
  ['gate-data-outputs-key', 'source', 'producing stage', 'output artifact', 'SPEC-FORMAT-v2.md', 'Exact gate-data fields (F7)']
];
// gate-model §4: all causal relations follow prerequisite -> dependent.
// §5 AM-9f/g require every declared ancestor, incl. uses and governing authority.
// Non-declaring context/projection/history sites are non-causal; their provenance direction
// remains explicit. These closed role groups do not read registry edge/causal values.
const groups = require('./reference-registry-direction-roles.json');
const relationContract = {
  derives: ['source', true, 'prerequisite -> derived result'],
  implements: ['source', true, 'requirement -> implementation'],
  verifies: ['source', true, 'expectation -> verifying artifact'],
  uses: ['target', true, 'referenced input -> consumer (output roles explicitly reversed)'],
  governs: ['target', true, 'decision/amendment -> affected owner (affected-id rows reversed)'],
  renders: ['source', true, 'behavior/state -> rendered board'],
  mentions: ['target', false, 'navigation/context/projection; no invalidation'],
  supersedes: ['target', false, 'historical provenance; no causal propagation']
};
const expectations = new Map(rows.map(row => [row[0], {from: row[1], causal: true, row}]));
// Relation for the original source-specific roles is closed independently as well.
const sourceRelations = {
  derives: 'front-matter-trace-req front-matter-defs-scenario-id front-matter-amendments-id design-profile-tokens-generated us-ac-identity prd-req-identity prd-req-stories index-story-req contract-amendment-heading epic-map-epics-page epic-map-epics-capabilities-us epic-map-epics-capabilities-merged-us epic-map-epics-capabilities-req epic-map-hidden-decision gate-data-outputs-key',
  renders: 'front-matter-screens front-matter-boards screen-inventory-screens-boards',
  verifies: 'front-matter-defs-scenario-ac front-matter-defs-scenario-test screen-inventory-screens-scenarios ui-contract-used-by us-ac-scenarios ui-table-used-by'
};
for (const [relation, ids] of Object.entries(sourceRelations))
  for (const id of ids.split(' ')) expectations.get(id).relation = relation;
for (const [relation, from, causal, ids] of groups) for (const id of ids) {
  if (expectations.has(id)) throw new Error('duplicate independent direction role ' + id);
  expectations.set(id, {relation, from, causal});
}
function audit(entries, demand) {
  for (const entry of entries.values()) {
    for (const [i, rule] of [entry, ...(entry.cases || [])].entries()) {
      const boardCase = entry.id === 'screen-inventory-screens-source-ref' && i > 0
        && rule.when.path === 'source.kind' && rule.when.value === 'html-board';
      const role = i === 0 ? expectations.get(entry.id) : boardCase
        ? {relation: 'renders', from: 'source', causal: true} : undefined;
      demand(role, 'unaudited source-contract direction ' + entry.id);
      if (!role) continue;
      const to = role.from === 'source' ? 'target' : 'source';
      demand(rule.relation === role.relation, 'source-contract relation ' + entry.id);
      demand(rule.edge.from === role.from && rule.edge.to === to,
        'source-contract direction ' + entry.id + (boardCase ? ' html-board' : ''));
      demand(rule.causal === role.causal && (!role.causal || entry.effect === 'edge'),
        'source-contract causal edge ' + entry.id);
      if (role.row) demand(entry.grammar.file === role.row[4] && entry.grammar.section === role.row[5],
        'source-contract grammar ' + entry.id);
    }
  }
  for (const id of expectations.keys()) demand(entries.has(id), 'missing direction contract ' + id);
}
module.exports = {rows, relationContract, expectations, audit};

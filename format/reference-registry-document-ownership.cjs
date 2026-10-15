'use strict';
const {isDeepStrictEqual} = require('node:util');
// Closed identity locations are independent of the registry's effect/causal claims.
const identities = require('./reference-registry-document-identities.json');
const document = {kinds:['artifact'],id:'artifact:{document-or-record-path}'};
function audit(entries,demand) {
  const owned = new Set([...identities.direct,...identities.logicalParents]);
  for (const id of owned) {
    const entry = entries.get(id);
    demand(entry,'missing document ownership entry '+id);
    if (!entry) continue;
    demand(entry.effect === 'edge' && entry.relation === 'derives' && entry.causal === true,
      'non-causal document ownership '+id);
    demand(entry.edge.from === 'source' && entry.edge.to === 'target','reversed document ownership '+id);
    const parent = identities.logicalParents.includes(id);
    demand(isDeepStrictEqual(parent ? entry.ownership : entry.source,document),
      'document ownership source '+id);
    demand(entry.target.id !== document.id,'document ownership self-edge '+id);
    if (!parent) demand(entry.ownership === undefined,'duplicate document ownership rule '+id);
  }
  for (const entry of entries.values()) {
    demand(entry.effect !== 'declare','identity without document ownership '+entry.id);
    demand(!entry.ownership || identities.logicalParents.includes(entry.id),
      'ownership on non-declaring reference '+entry.id);
    if (entry.relation === 'mentions') demand(!entry.causal && !entry.ownership,
      'mention creates document ownership '+entry.id);
  }
}
module.exports = {identities,document,audit};

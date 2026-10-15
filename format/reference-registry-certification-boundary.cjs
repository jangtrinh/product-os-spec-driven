'use strict';
const entryId = 'candidate-manifest-members-artifacts';
const token = 'terminal-graph-only-candidate';
function audit(entries, demand) {
  const rows = [...entries.values()];
  const controls = rows.filter(entry => Object.hasOwn(entry, 'certification_boundary'));
  demand(controls.length === 1, 'graph certification boundary metadata must occur exactly once');
  for (const entry of controls) {
    demand(entry.id === entryId && entry.certification_boundary === token, 'unsupported graph certification boundary: ' + entry.id);
    demand(entry.causal === true && entry.relation === 'uses' && entry.effect === 'edge' && entry.edge?.from === 'target' && entry.edge?.to === 'source', 'invalid graph certification binding: ' + entry.id);
  }
  demand(rows.find(entry => entry.id === entryId)?.certification_boundary === token, 'missing graph certification boundary on ' + entryId);
  for (const entry of rows) for (const branch of entry.cases ?? []) demand(!Object.hasOwn(branch, 'certification_boundary'), 'unsupported graph certification boundary case: ' + entry.id);
}
module.exports = {entryId, token, audit};

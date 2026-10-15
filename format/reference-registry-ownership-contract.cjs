'use strict';
// Closed payload ownership; wildcard/union applies only to named body grammars.
const schemaTypes = ["audit-event", "batch-decision", "block-history", "candidate-manifest", "change-set", "clarify-record", "copy-catalog", "dependency-graph", "design-profile", "design-sources", "ds-catalog", "evidence-receipt", "exception", "expected-change", "feedback-record", "front-matter", "gate-definition", "gate-review", "gate-state", "glossary", "integration-record", "manifest", "model-common", "packet-data", "reference-registry", "rounds-ledger", "rulings-index", "screen-inventory", "transition", "ui-contract", "id-crosswalk", "source-ledger"];
const bodyOwners = {
  "us": [
    "us-ac-identity",
    "us-ac-scenarios"
  ],
  "us|review|build": [
    "scenario-detail-id",
    "scenario-detail-ac"
  ],
  "prd": [
    "prd-req-identity",
    "prd-req-stories",
    "prd-req-source"
  ],
  "us-index": [
    "index-story-file",
    "index-story-req"
  ],
  "contract": [
    "contract-amendment-row-id",
    "contract-amendment-affected",
    "contract-amendment-source",
    "contract-change-log-decision",
    "contract-amendment-heading",
    "contract-amendment-heading-decision"
  ],
  "decisions": [
    "decision-ledger-identity",
    "decision-ledger-affected"
  ],
  "ux": [
    "legacy-inventory-screen"
  ],
  "ui-contract": [
    "ui-table-screen",
    "ui-table-state",
    "ui-table-us",
    "ui-table-used-by",
    "ui-table-components",
    "ui-table-patterns"
  ],
  "glossary": [
    "glossary-term-anchor",
    "glossary-source",
    "glossary-copy-key",
    "glossary-exception-source"
  ],
  "*": [
    "body-document-link",
    "body-image",
    "body-wireframe-link",
    "body-id-mention"
  ],
  "note": [
    "context-term-source"
  ],
  "epic-map": [
    "epic-map-epics-id",
    "epic-map-epics-slug",
    "epic-map-epics-page",
    "epic-map-epics-capabilities-id",
    "epic-map-epics-capabilities-us",
    "epic-map-epics-capabilities-merged-us",
    "epic-map-epics-capabilities-req",
    "epic-map-hidden-us",
    "epic-map-hidden-decision",
    "epic-map-source"
  ],
  "gate-data": [
    "gate-data-context",
    "gate-data-inputs-key",
    "gate-data-outputs-key",
    "gate-data-evals-report",
    "gate-data-review-report",
    "gate-data-invalidation-changed"
  ],
  "pipeline": [
    "pipeline-gates-definitions-dir",
    "pipeline-gates-stage-definitions",
    "pipeline-gates-scoped-definitions",
    "pipeline-gates-graph",
    "pipeline-gates-receipts-dir",
    "pipeline-gates-candidates-dir",
    "pipeline-gates-decisions-dir",
    "pipeline-gates-exceptions-dir",
    "pipeline-gates-changes-dir",
    "pipeline-gates-baseline",
    "pipeline-design-adapter",
    "pipeline-project-spec-root",
    "pipeline-stages-context", "pipeline-stages-optional-context", "pipeline-stages-skill", "pipeline-review-rubric", "pipeline-review-log-dir",
    "pipeline-gates-dir", "pipeline-evals-per-file"
  ]
};
function audit(entries, demand) {
  require('./reference-registry-document-ownership.cjs').audit(entries,demand);
  const owners = new Map(schemaTypes.map(type => [type + '.schema.json', type === 'id-crosswalk' ? 'crosswalk' : type]));
  const bodies = new Map(Object.entries(bodyOwners).flatMap(([type, ids]) => ids.map(id => [id, type])));
  for (const entry of entries.values()) {
    const expected = entry.schema ? owners.get(entry.schema.file) : bodies.get(entry.id);
    demand(expected !== undefined && entry.doc_type === expected, 'doc-type ownership ' + entry.id);
  }
  for (const id of bodies.keys()) demand(entries.has(id) && !entries.get(id).schema, 'missing body registry entry ' + id);
}
module.exports = {schemaTypes, bodyOwners, audit};

<!-- Scoped runtime definition; same schema, exact candidate members, no implicit scope expansion. -->

Schema: `format/schema/gate-definition.schema.json`. Aggregate stage definition stays separate. Bind gates.scoped_definitions explicitly. Actual candidate digests computed by runner.

<!-- example: review/definitions/g3-us-ac/1.json
{
  "id": "g3-us-ac",
  "version": "1",
  "stage": "us",
  "scope": {
    "kind": "ac",
    "ids": [
      "US-01.AC-01"
    ],
    "revision": "150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba"
  },
  "inputs": [
    "spec/prd/prd.md",
    "spec/decisions/decisions.md"
  ],
  "outputs": [
    "spec/us/US-01.md"
  ],
  "checks": [
    {
      "id": "lint",
      "command": "node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage us",
      "mandatory": true,
      "blocker_policy": "Nonzero exit blocks; unreadable/empty/tool failure cannot PASS"
    }
  ],
  "reviewer": "independent-read-only",
  "decider": "po",
  "transitions": [
    "advance",
    "repair",
    "backward",
    "recovery"
  ],
  "invalidation": "Typed causal closure; incomplete uses BR-14 earliest/all downstream; unknown starts intake",
  "exceptions": [],
  "versions": {
    "workflow": "2",
    "templates": "2",
    "ruleset": "2",
    "skill": "none"
  }
}
-->

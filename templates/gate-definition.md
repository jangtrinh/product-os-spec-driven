<!-- Template quy trình/payload; không phải reader Markdown. Ví dụ cú pháp, không là receipt/approval đã xảy ra. -->

Aggregate stage definition example. Scoped definitions require their own id/version and exact enumerated member scope; không wildcard hoặc expansion ngầm. Reviewer read-only. Version bindings must match pipeline.

Schema: `format/schema/gate-definition.schema.json`. Unknown keys bị từ chối. Điền bằng source/pins thật tại runtime.

<!-- example: review/definitions/g3-us/1.json
{
  "id": "g3-us",
  "version": "1",
  "stage": "us",
  "scope": {
    "kind": "stage",
    "ids": [
      "us"
    ],
    "revision": "3572e216c35ef93193fe528d9fbbc6224125ccf1fd0b80abd92c4ec22dec4989"
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

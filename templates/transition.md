<!-- Template quy trình/payload; không phải reader Markdown. Ví dụ cú pháp, không là receipt/approval đã xảy ra. -->

Proposal with decision null không authorize backward execution. Same-stage repair kind repair; harness recovery kind recovery giữ AC; prototype/posthandoff kind exception/change-set. PO law/scope authority, QC/Dev chỉ their scope.

Schema: `format/schema/transition.schema.json`. Unknown keys bị từ chối. Điền bằng source/pins thật tại runtime.

<!-- example: review/transitions/transition-example.json
{
  "id": "transition-example",
  "kind": "backward",
  "opener": "qc",
  "at": "2026-10-07T03:00:00Z",
  "source": "finding-example",
  "reason": "Proposed source ambiguity affects acceptance; no authority yet",
  "from": {
    "stage": "tdd",
    "scope": {
      "kind": "ac",
      "ids": [
        "US-01.AC-01"
      ],
      "revision": "150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba"
    },
    "revision": "example-before"
  },
  "to": {
    "stage": "us",
    "scope": {
      "kind": "ac",
      "ids": [
        "US-01.AC-01"
      ],
      "revision": "150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba"
    },
    "revision": "example-proposed"
  },
  "impact": [
    {
      "node": "ac:US-01.AC-01",
      "domain": "spec",
      "classification": "unknown",
      "reason": "Ví dụ chưa có consumer census/semantic independence proof",
      "path": []
    }
  ],
  "authority": "po",
  "decision": null,
  "regates": [
    "g3-us",
    "g3-tdd",
    "g4-uiux",
    "g5-handoff"
  ]
}
-->

<!-- Template quy trình/payload; không phải reader Markdown. Ví dụ cú pháp, không là receipt/approval đã xảy ra. -->

Orthogonal eval/review/human/freshness/progress/delivery. Default caps 3/3 survive restart/revision/finding lineage; continuation PO scope/rationale/extra rounds/expiry giữ prior counters. A scope pending không bị scope khác che.

Schema: `format/schema/gate-state.schema.json`. Unknown keys bị từ chối. Điền bằng source/pins thật tại runtime.

<!-- example: review/gates/scoped/g3-us-ac/150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba.json
{
  "definition": {
    "id": "g3-us-ac",
    "version": "1"
  },
  "scope": {
    "kind": "ac",
    "ids": [
      "US-01.AC-01"
    ],
    "revision": "150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba"
  },
  "states": {
    "eval": "NOT_RUN",
    "review": "NOT_RUN",
    "human": "PENDING",
    "freshness": "MISSING",
    "progress": "draft",
    "delivery": "draft"
  },
  "receipts": [],
  "rounds": {
    "cycle": "example-lineage",
    "eval_fix": 0,
    "review": 0,
    "max_fix": 3,
    "max_review": 3,
    "continuation": null
  },
  "decision": null,
  "exception_ids": [],
  "candidate": {
    "head": "example-source-revision",
    "base": "example-immutable-baseline",
    "manifest": "c7704c1cc3c6a40400a54174c8d8e02ad6ff6470c692201bc241ff0fb0d25cd9",
    "build": "not-built"
  }
}
-->

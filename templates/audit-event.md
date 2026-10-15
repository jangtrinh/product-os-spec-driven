<!-- Template quy trình/payload; không phải reader Markdown. Ví dụ cú pháp, không là receipt/approval đã xảy ra. -->

Append-only JSONL each line canonical object; hash raw prior event bytes, first previous_sha256 null. Corrections append superseding event; no history delete/rewrite. Feedback open→ruled→enforced human curation, model memory not authority.

Schema: `format/schema/audit-event.schema.json`. Unknown keys bị từ chối. Điền bằng source/pins thật tại runtime.

<!-- example: review/audit.jsonl
{
  "id": "audit-example",
  "at": "2026-10-07T03:00:00Z",
  "actor": "dev",
  "type": "feedback",
  "scope": {
    "kind": "ac",
    "ids": [
      "US-01.AC-01"
    ],
    "revision": "150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba"
  },
  "before": null,
  "after": "example-proposal",
  "refs": [
    "CS-example"
  ],
  "reason": "Ví dụ đề xuất chưa là ruling hoặc approval",
  "previous_sha256": null
}
-->

<!-- Template quy trình/payload; không phải reader Markdown. Ví dụ cú pháp, không là receipt/approval đã xảy ra. -->

Expired syntax example grants no approval. Actual prototype-first approval BEFORE mutation, exact scope/source/PO/expiry/deferred gates/combined checkpoint. Continuation kind continuation adds positive extra_rounds and prior counters in audit. No-UI applicability has PO reason/confirmer.

Schema: `format/schema/exception.schema.json`. Unknown keys bị từ chối. Điền bằng source/pins thật tại runtime.

<!-- example: review/exceptions/exception-example.json
{
  "id": "exception-example",
  "kind": "prototype-first",
  "scope": {
    "kind": "ac",
    "ids": [
      "US-01.AC-01"
    ],
    "revision": "150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba"
  },
  "source": "D9 kit workflow; proposal example only",
  "reason": "Đề xuất prototype có hạn dùng, chưa được ký duyệt thực tế",
  "by": "po@example.test",
  "at": "2026-10-07T03:00:00Z",
  "expires": "2026-10-08T03:00:00Z",
  "deferred_gates": [
    "g2-contract"
  ],
  "compensating_checks": [
    "Independent concept/source review before combined checkpoint"
  ],
  "non_waivable": [
    "Mandatory score 2",
    "Critical/Major blocking",
    "Independent tests/evidence",
    "Immutable baseline history"
  ],
  "status": "expired",
  "combined_checkpoint": "g2-contract-prototype"
}
-->

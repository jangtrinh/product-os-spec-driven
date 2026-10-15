<!-- Template quy trình/payload; không phải reader Markdown. Ví dụ cú pháp, không là receipt/approval đã xảy ra. -->

Syntax-only defer, not importable approval. Reader generates canonical packet; export actual packet_id/data_sha256/full membership/pins. Authenticate PO through controller channel, overrides AC→US→default within membership. Stale/unknown/forged/reused-id-changed-bytes reject. Deferred/requested stays pending.

Schema: `format/schema/batch-decision.schema.json`. Unknown keys bị từ chối. Điền bằng source/pins thật tại runtime.

<!-- example: review/decisions/batch-example.json
{
  "id": "batch-example",
  "packet_id": "packet-ad4b4f22f1a5caeb5a9594a862e2d6fdf429c6881f288d0cc1fdce8f8e54579e",
  "data_sha256": "ad4b4f22f1a5caeb5a9594a862e2d6fdf429c6881f288d0cc1fdce8f8e54579e",
  "scope": {
    "kind": "ac",
    "ids": [
      "US-01.AC-01"
    ],
    "revision": "150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba"
  },
  "pins": {
    "head": "example-source-revision",
    "base": "example-immutable-baseline",
    "manifest": "c7704c1cc3c6a40400a54174c8d8e02ad6ff6470c692201bc241ff0fb0d25cd9",
    "build": "not-built"
  },
  "by": "po@example.test",
  "at": "2026-10-07T03:00:00Z",
  "default": "defer",
  "reason": "Ví dụ chưa đủ evidence/authority, giữ scope pending",
  "overrides": [],
  "exceptions": []
}
-->

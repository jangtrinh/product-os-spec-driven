GATE: PENDING

<!-- Runner materializes gate-data from actual expanded context/output/effective config hashes. Không chép hash mẫu thành receipt thật. Đây không phải reader document. -->

<Exactly one gate-data JSON block. No status key, own gate excluded from hashes. Only APPROVED adds approval by email/UTC. Role toggle cannot clear existing PENDING.>

<!-- example: review/gates/us.md
GATE: PENDING

```gate-data
{
  "stage": "us",
  "context": [
    "spec/prd/prd.md"
  ],
  "inputs": {
    "spec/prd/prd.md": "af74becdb1be9fc4c920f5548edf8be0e2466cf1c11152994b2afdfcbd5770de"
  },
  "outputs": {
    "spec/us/US-01.md": "5e36d12a451232a1f30f41f9ee7a104434b2aabdd534005fb946c9098cc37ee9"
  },
  "config_sha256": "d878c2546d17c4a618a410cee33463d0c39032dcf30e6af81017bdeedf9b7ef4",
  "role": {
    "owner": "po",
    "enabled": true,
    "gate": true
  },
  "evals": [],
  "review": {
    "enabled": true,
    "independent": false,
    "verdict": "NOT_RUN",
    "criteria": [],
    "findings": [],
    "report": null
  },
  "versions": {
    "workflow": "2",
    "templates": "2",
    "ruleset": "2"
  },
  "change_requests": [],
  "invalidation": null,
  "model": {
    "definition": {
      "id": "g3-us",
      "version": "1"
    },
    "scope": {
      "kind": "stage",
      "ids": [
        "us"
      ],
      "revision": "3572e216c35ef93193fe528d9fbbc6224125ccf1fd0b80abd92c4ec22dec4989"
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
}
```
-->

Ví dụ NOT_RUN/PENDING không đủ đi tiếp; config_sha256 là digest của fixture marker, runner phải tính actual effective config gồm registry/design_adapter/version/evals/rubric/prompt. Context actual includes used templates/rules/prompt, sorted unique input keys. Hash ledger after final write; detect additions/deletions, no own gate hash. Record actual eval exits only executed. APPROVED cần exact-scope decision + CURRENT mandatory checks/review; accepted Minor giữ NEEDS_CHANGES. Historical records không model không đóng new scope.

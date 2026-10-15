<!-- Template quy trình/payload; không phải reader Markdown. Ví dụ cú pháp, không là receipt/approval đã xảy ra. -->

Chỉ ví dụ NOT_RUN. Artifact hash trỏ diagnostic fixture text `Example diagnostic: no command executed.` phải được materialize trong scratch; actual run phải thay bằng real log/file hashes. No PASS from selected 0 or missing input. CURRENT only actual executed PASS/FAIL on matching pins; domain spec khác local-ci/visual/live/delivery.

Schema: `format/schema/evidence-receipt.schema.json`. Unknown keys bị từ chối. Điền bằng source/pins thật tại runtime.

<!-- example: review/receipts/receipt-example-not-run.json
{
  "id": "receipt-example-not-run",
  "scope": {
    "kind": "ac",
    "ids": [
      "US-01.AC-01"
    ],
    "revision": "150f078b912bd41265dbd1c096c0d4eb4be25c674e62e02c0365f410dc66b4ba"
  },
  "at": "2026-10-07T03:00:00Z",
  "freshness": "MISSING",
  "pins": {
    "head": "example-source-revision",
    "base": "example-immutable-baseline",
    "manifest": "c7704c1cc3c6a40400a54174c8d8e02ad6ff6470c692201bc241ff0fb0d25cd9",
    "build": "not-built",
    "source": "5e36d12a451232a1f30f41f9ee7a104434b2aabdd534005fb946c9098cc37ee9",
    "scenario": "US-01.SCN-01-01-planned",
    "test": "not-applicable: review method",
    "rules": "2",
    "prompt": "2",
    "environment": "not-executed",
    "ds": "not-applicable: pre-design"
  },
  "execution": {
    "command": "node tools/lint/lint.mjs spec --stage us",
    "cwd": "spec",
    "exit": null,
    "result": "NOT_RUN",
    "selected": 0,
    "total": 1,
    "skipped": [],
    "baseline_debt": [],
    "red_controls": [],
    "recovery": "Chạy phép kiểm thật rồi independent review trên đúng candidate"
  },
  "review": {
    "builder": "dev",
    "reviewer": "unassigned",
    "independent": false,
    "evaluator_version": "not-run",
    "prompt_version": "2",
    "ruleset_version": "2",
    "verdict": "NOT_RUN",
    "inputs": [
      "spec/us/US-01.md",
      "spec/contract/contract.md"
    ],
    "criteria": [],
    "findings": []
  },
  "coverage": {
    "ac": [
      "US-01.AC-01"
    ],
    "scenarios": [
      "US-01.SCN-01-01"
    ],
    "passed": [],
    "na": []
  },
  "artifacts": {
    "review/log/example-not-run.txt": "a01484105ac02c6335944284fef02fa233c4c0a79de85b86b66b4f0af4f36f73"
  },
  "domain": "spec"
}
-->

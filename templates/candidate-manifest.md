<!-- Template quy trình/payload; không phải reader Markdown. Ví dụ cú pháp, không là receipt/approval đã xảy ra. -->

Member sorted kind/id; mỗi member.artifacts exact raw-byte hashes, revision = sha256(canonical(artifacts)), manifest hash của full canonical payload. Scope revision hash selected member records, không head label. Example pins chỉ cú pháp, không Git/world state.

Schema: `format/schema/candidate-manifest.schema.json`. Unknown keys bị từ chối. Điền bằng source/pins thật tại runtime.

<!-- example: review/candidates/c7704c1cc3c6a40400a54174c8d8e02ad6ff6470c692201bc241ff0fb0d25cd9.json
{
  "version": "1",
  "members": [
    {
      "kind": "ac",
      "id": "FC-01.AC-01",
      "revision": "828e34c8bdf291787bbfe783d766feb4d247a7bc5ce69d7b4b00460a87fb7d57",
      "artifacts": {
        "spec/contract/contract.md": "493919a64747b533fe1d8eaf00cd02f6b364fbf34be75006074a4ad37fb04f8b",
        "spec/us/US-01.md": "5e36d12a451232a1f30f41f9ee7a104434b2aabdd534005fb946c9098cc37ee9"
      }
    },
    {
      "kind": "ac",
      "id": "US-01.AC-01",
      "revision": "828e34c8bdf291787bbfe783d766feb4d247a7bc5ce69d7b4b00460a87fb7d57",
      "artifacts": {
        "spec/contract/contract.md": "493919a64747b533fe1d8eaf00cd02f6b364fbf34be75006074a4ad37fb04f8b",
        "spec/us/US-01.md": "5e36d12a451232a1f30f41f9ee7a104434b2aabdd534005fb946c9098cc37ee9"
      }
    },
    {
      "kind": "stage",
      "id": "us",
      "revision": "828e34c8bdf291787bbfe783d766feb4d247a7bc5ce69d7b4b00460a87fb7d57",
      "artifacts": {
        "spec/contract/contract.md": "493919a64747b533fe1d8eaf00cd02f6b364fbf34be75006074a4ad37fb04f8b",
        "spec/us/US-01.md": "5e36d12a451232a1f30f41f9ee7a104434b2aabdd534005fb946c9098cc37ee9"
      }
    },
    {
      "kind": "us",
      "id": "US-01",
      "revision": "828e34c8bdf291787bbfe783d766feb4d247a7bc5ce69d7b4b00460a87fb7d57",
      "artifacts": {
        "spec/contract/contract.md": "493919a64747b533fe1d8eaf00cd02f6b364fbf34be75006074a4ad37fb04f8b",
        "spec/us/US-01.md": "5e36d12a451232a1f30f41f9ee7a104434b2aabdd534005fb946c9098cc37ee9"
      }
    }
  ]
}
-->

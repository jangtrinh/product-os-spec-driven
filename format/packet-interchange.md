# Runner and reader interchange

Normative companion to [gate model §2](gate-model.md#2-definitions-scope-and-runtime-records) and [§7](gate-model.md#7-batch-re-approval-packet-and-decision-file). These interfaces are specified here for later implementation; the [linked fixture](fixtures/review-packet/README.md) is contract evidence, not a runner or reader.

## 1. Config registries and version lookup

`config/pipeline.yaml` requires these keys in addition to the existing stage/role/review settings. All paths are POSIX project-root-relative, never config-directory-relative or relative to the caller's cwd. Resolve `--project` first; reject absolute/traversal/symlink escapes, missing files, duplicate JSON/YAML keys, unknown keys and ambiguous versions with runner exit 3. The configuration may not create a missing registry silently.

| Key | Binding |
|---|---|
| `stages.<stage>.optional_context` | optional unique array of project-relative path/glob strings in addition to required `context`; empty/absent selections contribute no inputs. Selected files are hashed in gate inputs, source snapshots, review bindings and candidate members. Empty optional selectors do not change effective stage hashes or existing definition bindings; loaded bytes do. Pure optional external-input changes stale their consuming stages; output/required/mixed changes keep graph closure and conservative fallback. |
| `versions` | exact nonempty `{workflow,templates,ruleset,skill}` strings; `skill: none` for a tool-only run. These are content/release revision labels, never `latest` or inferred installed versions |
| `gates.definitions_dir` | local directory; a definition is exactly `<dir>/<id>/<version>.json`, validated by gate-definition schema. Its id/version/stage and versions must equal the requested binding and effective config |
| `gates.stage_definitions` | object with exactly the nine stage keys; each value `{id,version}` selects its aggregate definition. Disabled stages keep explicit bindings; load their files when enabled |
| `gates.scoped_definitions` | array of `{id,version}`; empty by default. Load exact definitions for enabled stages, validate their scope against candidate membership, and persist each independently. A scope change requires a new definition version/binding; no wildcard or implicit scope expansion |
| `gates.graph` | one JSON dependency graph; schema version `version` is an exact revision label recorded and hashed, not a schema URL to fetch |
| `gates.receipts_dir` | `<dir>/<receipt-id>.json`, evidence-receipt schema; id must match filename. No directory scan may select a newer receipt by timestamp |
| `gates.candidates_dir` | `<dir>/<manifest-sha256>.json`, candidate-manifest schema; filename equals canonical payload digest |
| `gates.decisions_dir` | validated imported decisions `<dir>/<decision-id>.json`; immutable audit decides authority, this directory is a projection |
| `gates.exceptions_dir` | `<dir>/<exception-id>.json`, exception schema with exact id and current status/expiry |
| `gates.changes_dir` | `<dir>/<change-set-id>.json`, change-set schema; packet generation names one exact record, never guesses most recent |
| `gates.baseline` | AM-2: project-relative JSON `{id, head, manifest}` naming the current immutable baseline (head commit + baseline manifest digest). Required for decision import and G5; missing → exit 3. Never inferred from git branches |
| `roles.po.approvers` | AM-2: nonempty list of emails allowed to approve as PO. Required for decision import |
| `design_adapter` | optional project-relative design-profile JSON path. Required for enabled design/UIUX; exported manifest `design.profile` is spec-relative and must have identical raw-byte digest |

Registry ids/version filename segments must match `[A-Za-z0-9][A-Za-z0-9_-]*`; a definition id also meets its stricter schema pattern. Duplicate id/version content is an error. A gate record's `model.definition` resolves by the same lookup; `model.scope` equals that definition's pinned scope. Aggregate stage records enumerate required scoped results; one approval cannot hide another. Version/hash changes invalidate consuming gates and effective config hashes include every key above and `design_adapter` when present. Workflow/template/ruleset/skill versions never replace raw input digests.

Manifest `gate_model.graph/changes/receipts`, document `data`, and profile-local paths remain **spec-relative** exported copies. The runner binds project-original→exported paths explicitly via `project.spec_root` plus those manifest pointers; compare raw-byte digests before using a projection. No implicit source discovery. Graph node sources, gate input/output/context paths and receipt cwd/artifact paths use project root in runtime registries; exported receipts are rebased into the spec root with the mapping recorded, not interpreted under two bases.

## 2. Candidate member and hash manifest

[candidate-manifest.schema.json](schema/candidate-manifest.schema.json) owns `{version:"1", members:[{kind,id,revision,artifacts}]}`. Enumerate every candidate scope member, sorted by `kind`, then `id` in UTF-16 code-unit order (ECMAScript string comparison); unique `(kind,id)`. Kinds are stage/artifact/bundle/us/ac. Qualified AC ids resolve to their owning US or contract. `artifacts` maps every source file contributing to that member to SHA-256 of raw file bytes; paths project-relative. `revision = sha256(canonical(artifacts))`; these digests prove content identity, not semantic completeness. Missing contributing artifacts makes membership incomplete and blocks eligibility.

`pins.manifest = sha256(canonical(the entire candidate member manifest))`. `scope.revision` in definitions and their gate records is `sha256(canonical({definition:{id,version},kind,ids}))`, with sorted unique ids; file bytes are excluded. Receipt, packet, batch-decision and Change Set scopes retain `scope.revision = sha256(canonical(the sorted member records selected by scope.kind/ids))`, including their artifact hashes. Definition membership and reviewed content are distinct pins, neither is the candidate Git head. Every id resolves once. `head`, `base`, `build` pin exact candidate head, immutable baseline head and build revision; explicit `not-built` build is allowed for pre-code spec review and cannot establish G4. Baseline `manifest` pins its own immutable manifest. A label or count is never membership. Candidate file contains no self digest, preventing a hash cycle.

A graph self-certification candidate uses the graph-only member shape defined by gate-model §5; its artifacts still contain SHA-256 of raw graph bytes, its member and scope revisions retain the existing formulas, and its filename and pins.manifest remain the digest of the entire canonical candidate manifest. No placeholder digest, alternate filename, projected artifact digest or partially hashed candidate manifest is permitted. Ordinary stage/batch candidate membership is unchanged; mixed graph-and-product membership receives no self-certification exception. Runtime and exported graph paths must resolve through the existing original/export binding before classifying a certificate.

## 3. Canonical packet-data JSON

[packet-data.schema.json](schema/packet-data.schema.json) is the exact serialized payload. Reject unknown/duplicate keys and non-JSON values. All required keys remain present even when a collection is empty:

| Key | Value |
|---|---|
| `version`, `product` | `"1"`, `"PRODUCT:OS Spec Driven"` |
| `scope`, `baseline`, `candidate`, `membership` | full qualified-AC requested scope, baseline/candidate pins, complete candidate member manifest |
| `change` | `{id,source,reason,rules:[{source,before,after}],impact,closure:{complete,fallback},propagation}`; propagation uses Change Set row schema. Incomplete closure requires earliest fallback stage (intake when unknown); complete closure uses null |
| `screens` | inventory screen/state rows, with explicit roles/scope/source/boards and requested-scope joins; empty only for source-backed no-UI applicability |
| `evidence`, `findings`, `open`, `exceptions` | full receipt objects, criterion findings, `{id,text,blocking}` open questions, and approved/proposed exception records. Historical/missing evidence remains visible; approval eligibility separately filters it |
| `decisions`, `assumptions` | existing source-backed `{id,text,source}` decisions and `{id,text,source,confidence,what_would_flip}` assumptions (`low|medium|high`); distinct from open questions and requested choices |
| `unaffected`, `aggregate_checks` | qualified AC ids outside requested scope retained with independence proof; receipt ids for global reruns, resolving in evidence |
| `requests` | `{id,reason}` for every enumerated requested AC exactly once; HTML controls choose the resulting decision, never add scope |
| `assets` | project-relative local asset path→raw-byte SHA-256; all screenshot/measurement/preview assets needed by the packet. Empty for no-image fixtures. Embed actual asset bytes in HTML and verify each digest |

Canonical serialization: recursively sort object keys by UTF-16 code-unit order (ECMAScript string comparison); preserve array order; emit JSON strings with JSON.stringify-compatible escaping, UTF-8 without BOM, no whitespace/newline. Numbers are JSON integers in this payload; no NaN/infinity, undefined or duplicate keys. Generation sorts set-like arrays: members by kind/id, scope ids/unaffected/aggregate ids lexically, screens by screen/state, evidence/findings/open/exceptions/decisions/assumptions/requests by id, impacts by domain/node, rules by source. Preserve ordered propagation rows, causal paths, scenario steps and authority read order; sort unordered nested id/path sets lexically. Array ordering is part of the digest and may not be changed at import.

`data_sha256 = sha256(canonical(payload))`; `packet_id = "packet-" + data_sha256`. The packet carries this payload and id, but neither is added inside the payload (no self-reference). Pins, membership, receipts and asset digests must all match the current authoritative inputs before a decision is applied. Deterministic output includes inline local renderer resources at the recorded workflow version; no clock/random/network in generation. Decision time belongs only to the exported batch-decision file.

## 4. CLI entrypoints and import

```text
node tools/reader/packet.mjs <spec> --project <root> --config <project-relative-path> --change-set <id> --out <new-dir>
node tools/run/run.mjs --project <root> --config <project-relative-path> --import-decision <project-relative-file> --packet-data <project-relative-file>
```

Packet generator reads named registries and exported spec, validates lint/joins/current inputs and emits `packet-data.json` canonical bytes plus self-contained `index.html` in a new/empty output directory. It refuses a nonempty destination (no overwrite). It may render blocked/requested batches with eligibility/missing data disclosed, but invalid spec or unresolved membership is exit 3, never an approvable packet. Exit 0 = packet generated, **not approved**; 3 = invalid input/config/digest; 4 = unavailable local tool/asset. It writes no gate, audit or decision. Output paths reported on success. Reader shell and packet title carry the product name.

Decision import is mutually exclusive with ordinary traversal and `--result` (the manual writer/reviewer result interface). It parses both schemas; recomputes packet canonical digest/id; checks decision scope/pins equal packet scope/candidate; checks current baseline/candidate head/build/member/artifact hashes and full scope revision; validates PO origin as defined in §5 (asserted-local: `--as <email>` must be in `roles.po.approvers` and equal the decider; recorded as `authority: asserted-local`, a stated capability limit, not authentication), overrides/exceptions, CURRENT domain-appropriate evidence, propagation and every applicable mandatory criterion. A decision file or packet alone (without the human-supplied `--as` at import) never counts as approval; projects that need authenticated identity add an adapter (AM-8). RED stale pins, unknown AC/US scope, changed data digest or forged membership fail with exit 3 before any approval/audit mutation; missing authority or unresolved quality blocks with exit 2; environment/tool failure 4. Unknown or conflicting overrides never silently disappear. Per-AC overrides precede per-US then default; per-US expands only inside enumerated AC membership.

Import recomputes evidence heads (gate-model §5, AM-9) from the importing project's receipt store plus embedded receipts; embedded receipts can block but never retire a store receipt, and supersession is honoured only from store-resident receipts (AM-7 binding unchanged).

After all checks, append the decision audit event and update projections for eligible approved members only; requested/deferred members remain pending. Retry of the same decision id and digest returns the original receipt; different bytes with the same id errors. Exit 0 = validated decision applied/idempotently found, **not handoff/deployment acceptance**. Final mutation must leave an auditable exact-scope result. The fixture's semantic oracle is a bounded developer check, not an implementation of this CLI or authentication.

## 5. Live candidate sources and approver identity (AM-2, controller ruling 2026-10-07)

- **head**: when `--project` is a git work tree, `git rev-parse HEAD` of it; otherwise the import/stage command must pass `--head <rev>` (missing → exit 3). A dirty work tree is recorded in the audit event and makes the result ineligible for G5.
- **base**: `gates.baseline.head` and `gates.baseline.manifest` from the config registry above. No inference from branch names.
- **build**: explicit `--build <rev|not-built>` on stage runs and decision import; `not-built` never establishes G4. Missing → exit 3.
- **PO authority**: decision import requires `--as <email>`; the email must be in `roles.po.approvers` and equal the decision's decider. The audit event records `authority: asserted-local` — a locally asserted identity, not cryptographic proof; projects needing stronger identity add an adapter. An automated agent must not supply `--as`; the runner prints this rule before import.
- **Candidate manifest for a new stage result**: at gate time the runner computes the candidate member manifest from the stage's current members, writes it to `gates.candidates_dir/<sha256>.json`, and binds the gate record to that digest. Content rewrites never require a new definition. When kind/ids no longer fit the bound membership revision, the runner never rebinds: it stops with exit 2 and an audit event `scope-version-required` naming the definition id; a person adds the new definition version file and config binding.
- **One complete manifest, scoped approvals by scope revision (AM-7)**: each stage run computes ONE complete candidate member manifest; its digest is `pins.manifest`, used for G5, handoff and packets. A scoped approval binds to that definition's `scope.revision` (section 2) plus the selected members' artifact hashes — not to `pins.manifest`. A prior scoped approval stays valid when its `scope.revision` and member artifact hashes are unchanged AND the dependency closure for the change reports no direct, transitive or unknown impact on it. A changed `pins.manifest` alone never invalidates a scoped approval; it always invalidates G5/handoff results bound to the old digest.

## 6. Writer result materialization (AM-3, controller ruling 2026-10-07)

- A stage whose definition declares exactly one output accepts the writer's result as plain text; the runner writes it to that output path.
- A stage with several outputs requires the result to contain exactly one fenced block with info string `files` holding a JSON object `{ "<project-relative path>": "<UTF-8 content>" }`. Every key must be one of the stage's declared outputs (exact match after POSIX normalisation); no extra, missing, duplicate, absolute or escaping path; text outside the block is ignored and recorded in the log.
- Malformed JSON, a second `files` block, an undeclared path or a missing declared output is a writer failure: nothing is written, the attempt is logged, and it consumes one fix round (`limits.max_fix_rounds`). It is never a partial write.
- The same contract applies to CLI agents (stdout) and manual mode (`--result <file>`).


## Machine grammar declarations

These declarations own extraction locations. Every location, including non-reference fields, requires a separate census classification. Prose and schema payload constraints above retain authority.

```spec-grammar
[{"doc_type":"pipeline","location":{"kind":"json","path":"gates.definitions_dir"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.stage_definitions{value}"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.scoped_definitions[*]"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.graph"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.receipts_dir"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.candidates_dir"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.decisions_dir"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.exceptions_dir"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.changes_dir"}},{"doc_type":"pipeline","location":{"kind":"json","path":"gates.baseline"}},{"doc_type":"pipeline","location":{"kind":"json","path":"design_adapter"}},{"doc_type":"pipeline","location":{"kind":"json","path":"project.spec_root"}},{"doc_type":"pipeline","location":{"kind":"json","path":"roles.po.approvers[*]"}},{"doc_type":"pipeline","location":{"kind":"json","path":"versions.skill"}}]
```

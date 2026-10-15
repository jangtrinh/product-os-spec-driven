# PRODUCT:OS Spec Driven — lint v2

Run from the repository root with Node 18 or later:

```sh
node tools/lint/lint.mjs fixtures/v2/full
node tools/lint/lint.mjs fixtures/v2/minimal --json
node tools/lint/lint.mjs --self-test
node --test tools/lint/test/
```

`npm test` from `tools/` runs the same suite. No runtime packages, network,
Python or shell are required. Exit 0 means a nonempty selection with zero
errors; 1 means validation errors; 2 means input/schema/rule/option failure.
Warnings remain counted. JSON returns `ok`, `problems` and `stats`; text
includes source lines, stable codes, fixes and the count summary.

Normative authority: [Format v2](../../format/SPEC-FORMAT-v2.md), its local
schemas, gate model and design model. `--pipeline config/pipeline.yaml`
checks declared approvers and immutable baseline paths relative to that
project (the parent of `config/`). `--stage` defers pipeline-derived design
requirements before design output. Head/build currency and authenticated
approval remain runner checks and are explicitly NOT RUN here.

Exported-record accounting is owned by [record-accounting.mjs](record-accounting.mjs).
Each absent or empty group is disclosed per code in text and `stats.qRecords.checks`;
a required group blocks its declared gate/checkpoint. Clarification-round limits
and threshold resolution stay NOT RUN until their input contracts exist.
Approval eligibility is owned by [packet-approval.mjs](packet-approval.mjs),
using the shared [receipt rules](rules-receipts.mjs) for embedded evidence.
[current-receipts.mjs](current-receipts.mjs) selects all unretired CURRENT heads
per member/domain/pins/source. Every head must remain eligible; conflicting FAIL
blocks regardless of receipt timestamp, ID or file order. Only a CURRENT,
schema-valid, independent store receipt with an explicit same-key `supersedes`
reason and exported eval audit witness can retire another receipt. Packet-only
receipts can block but cannot retire. Freshness overlays apply before selection;
missing witnesses remain explicitly NOT RUN. Supersession validation is owned by
[receipt-supersession.mjs](receipt-supersession.mjs).
Every approval consumer uses the revision and current-membership checks in
[current-receipts.mjs](current-receipts.mjs), including aggregate checks and
terminal propagation. Scoped preservation additionally requires every declared
trace, screen, board, UI-contract and scenario relation in the shared
[source-dependency-census.mjs](source-dependency-census.mjs), followed transitively.
Missing nodes, edges or unresolved joins make the proof unavailable; an export's
completeness flag alone cannot establish independence. Census follows declared
links in both directions; impact still follows outgoing causal edges.
Amendments and decisions use their normative typed namespaces and source joins.
UI-contract contexts use `artifact:<doc-id>/<screen>/<state>` nodes (state omitted
for legacy rows), with source set to the owning contract document. This preserves
each context's many-to-many links without conflating unrelated screen contexts.
The independent graph and omission matrix live in
[declared-relations.test.mjs](test/declared-relations.test.mjs). Domain
version pins and review-version fallback keys are owned by
[receipt-evidence-key.mjs](receipt-evidence-key.mjs).
AC/SCN eligibility requires the owning source file hashes and those same paths in
`review.inputs`. Test/log outputs may accompany those original source pins.
Byte hashes and recorded review data establish consistency; semantic truth,
actual test discovery, live evidence and owner acceptance remain separate.

Fixtures are synthetic checker inputs. Their declared receipt records do
not constitute execution or approval evidence for a product. Self-test and
node:test apply the durable per-rule patches in `fixtures/v2/broken/` to
fresh temporary copies of `full`, assert the exact code/severity and clean
up only their own temporary directories. Patches retain before-byte hashes
and base64 after-bytes so image and text faults are reproducible. Regenerate
these patches after an intentional fixture change:

```sh
node tools/lint/build-broken-fixtures.mjs
```

`index.mjs` exports `lintSpec(root, options)` for local callers. The
`schemaDir` and `rules` seams are restricted to test harnesses; CLI does not
expose suppression, alternate rules or lenient mode. `schema-lite.mjs`
implements only keywords used by the shipped schemas; an unsupported
keyword/format or malformed schema fails instead of being ignored.

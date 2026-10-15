# Source provenance contract fixtures

`crosswalk.json` covers all five recognized legacy families. `source-ledger.json` retains five distinct source items and all four mapping statuses, with 5/5 preservation, 4/5 typed mapping and 0/5 demo passes. `typed-items-ledger.json` positively covers all 20 declared graph kinds, without converting source preservation into demo passes. `source.txt` is synthetic fixture text, not a migrated Public Docs bundle. Legacy labels outside the crosswalk exist only in deliberately invalid control inputs.

Run from repository root with Ajv 8 available through `SPEC_AJV_MODULE`:

```sh
node format/checks/source-provenance-schemas.cjs
node format/checks/source-provenance-semantics.cjs
node format/checks/source-provenance-review-controls.cjs
node format/checks/source-provenance-reservation-controls.cjs
node format/source-provenance-registry-red-controls.cjs
```

Schema controls reject unknown families, noncanonical targets, missing reasons, no-demo mappings and merged-summary shapes. Semantic controls reject duplicate canonical ids, legacy ids in spec bodies/keys, wrong allocation, bad digest, omitted source items, unresolved joins/targets and transferred numerators. The separate counters are recomputed from independent inventories; a shape-valid mutated count must fail.

The executable helper is a bounded format oracle. Production lint, migration and reader support must independently consume the fixed sidecar paths and enforce the same contract; passing these fixtures is not migration, reader runtime or gate acceptance.

For a real read-only source census, pass `--source-root=<input bundle>` to the semantic check; it reads the story tables, requires a nonempty scenario selection, and verifies unique deterministic allocations. It does not migrate or write that bundle.

Allocation controls cover alternate/retired owner labels, occupied labels under another owner, graph-qualified aliases and ambiguous unqualified labels. Legacy-token controls cover underscore/dash/dot suffixes and prefixes in anchors, JSON keys, filenames and lowercased heading slugs, with canonical-token positive controls.

Scenario reservations retain their namespace until strict parsing succeeds. Their owner must join a declared US/NF node in the frozen string inventory, such as `us:US-16`; a source-row owner claim cannot supply that declaration. Reservation controls reject Unicode dashes, lowercase/unknown scenario tokens and unresolved owners, retain cross-owner global collisions, and accept non-scenario namespaces without consuming scenario labels. An in-memory allocator bypass proves that the independent schema-based reservation oracle still rejects invalid inputs.

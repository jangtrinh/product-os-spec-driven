# Reference registry grammar

Normative extraction contract for [reference-registry.json](reference-registry.json), [Format v2](SPEC-FORMAT-v2.md), and [gate model](gate-model.md).

Schema resource boundary (D17): every document root `$id` MUST equal `https://spec-driven.local/format/v2/` plus its exact local file name, with no percent-encoding, dot segments, query or fragment; root ids MUST be unique. `$id` is allowed only at a schema document root. The coverage guard resolves `$ref` identities with the same URI resolver as its strict Ajv validator. Nested `$id`, `$anchor` and `$dynamicAnchor` are unsupported. Every `$ref` MUST resolve against the document root `$id` to a known local schema document and an existing JSON pointer (an empty fragment denotes its root). Unknown external URLs and unresolved fragments fail closed; a matching filename alone never establishes resource identity. The shared [schema resolver](reference-registry-schema-path.cjs) and [construct guard](reference-registry-schema-constructs.cjs) enforce this boundary.

## 1. Locations, annotations and templates

`doc_type: front-matter` means common Markdown front matter; type-specific fields retain Format §3 restrictions. `*` applies to all document types; a `|`-separated value lists applicable types. JSON doc types name the typed payload. `location.path` uses `[*]` for each array member, `{key}` for map keys and `{value}` for map values. `$defs.*` names reusable grammars, instantiated only at consumer `$ref` sites. Schema pointers are RFC 6901 into the named local schema; identifiers never cause remote schema fetching.

Every published string-capable schema location MUST carry a unique `x-spec-ref: "<entry-id>"` binding or `x-spec-ref: false` plus a checked `x-spec-exclusion`. Reasons are explanatory text only and grant no exemption. Closed categories are `alias-of`, `refinement-of`, `container-of`, `free-text`, `human-label`, `enum-literal`, `format-value`, `regex`, and the narrowly owned `legacy-id` category in §7. Structural categories name the exact owning schema pointer: aliases resolve their actual `$ref`; refinements use the same effective payload location after composition; containers point to their actual item/map child. Unrelated owners fail. Non-reference shapes must equal their pinned retained shape at the same site; an arbitrary new reason/category cannot certify a new location. Explicit id/path grammars contradict scalar exclusions. Strict Ajv registers assertion-free annotations only.

Implicit object values, keys and array tails are checked as effective locations. Closed declared property names are finite literals; pattern-defined keys remain open even with additionalProperties:false or unevaluatedProperties:false. Reference-bearing patternProperties keys are forbidden. Reference-bearing propertyNames MUST bind exactly one registry entry; unbound id/path key grammars are forbidden. Every effective open key namespace (additionalProperties not false, or patternProperties present) MUST have that key binding or explicit x-spec-ref:false with a checked exclusion category on its container. A propertyNames schema alone does not classify the namespace. Unconstrained object values and array items fail. Refinements may borrow constraints only at the same retained payload location; `$ref` constraints are resolved offline, including cycles. Every composed/conditional/definition child is visited. The explicit schema vocabulary and retained-refinement boundary are owned by [the construct guard](reference-registry-schema-constructs.cjs). Every other keyword fails with unsupported schema construct, its keyword and schema pointer. Conditional, negation and contains arms are supported only as unchanged assertions at their retained schema pointers; the effective-string proof never uses them to certify a registered value. New or changed arms require explicit proof support. These checks do not add constraints to payload schemas.

A reference in a typed payload MUST be a string value at a classified location (including explicitly bound propertyNames key strings). A registry binding MUST prove its effective value type is string, allowing null only as absence; string/non-string unions fail, including through $ref and composition. A structural object/array binding MUST mechanically expand to classified string leaves, each independently bound or carrying a checked non-reference exclusion; an empty container, non-string leaf, unresolved alias or unbounded tail fails. Integer, number, boolean, object and array-container locations whose own description or pattern declares a reference are forbidden, even if annotated or bound. Shared object aliases only expand classified leaves; their containers do not encode reference values. Schema-free source declarations and registry entries MUST agree in both directions: exactly one reference classification names the entry bound to that declared location; non-reference classifications cannot have a registry binding.

The source node owns the field/row; the target is its referenced/declared entity. `edge.from/to` selects source/target under prerequisite → dependent. `effect: declare` is retained in the control schema for backward shape compatibility but is rejected by the ownership audit; identity locations use causal `effect: edge`, relation `derives`; `context` supplies resolution context; `projection` verifies an existing graph or selection; `edge` emits the relation. Only causal edges invalidate dependents. Mentions/history/supersedes never do. `parse` is normative. `cases`, when present, applies its matching typed discriminator before emission; a nonmatching case uses the base entry. Repeated node/edge declarations retain all provenance but emit once; no self-edges.

JSON object keys MUST be unique at every depth after escape decoding, including registry and schema files. A duplicate is an error, never last-key-wins. Cases replace the base target/relation/edge/causal values and inherit the entry effect. Every effective causal case MUST have `effect: edge` and a causal relation; mentions/supersedes are always non-causal. Cases MUST share one discriminator path and have distinct values. Repeated path/value pairs (even identical cases), contradictory pairs, or different paths that could match together are rejected outright. No first/last-case precedence exists; at most one case may match.

Schema-bound paths MUST traverse declared properties, array members, shared `$ref` definitions and `{key}` propertyNames to the annotated schema node. A terminal `[*]` selects the array item; `{value}` selects declared additionalProperties/patternProperties values. `$defs.<name>` paths start at that reusable definition, never at an arbitrary instance property. Reference hints include declared id patterns and descriptions reached through items, local/shared definitions and allOf/anyOf/oneOf. Unresolved schema references cannot certify a location.

Braced templates substitute parsed context, never invent ids. Canonical identities: `us:US-n`, `ac:<US-or-contract>.AC-n`, `scenario:<US>.SCN-x-n`, `amendment:<contract>.A-n`, `decision:Dn`, `board:W-nn`, `screen-state:Snn/<explicit-state>`, `<component-or-pattern>:<adapter>/<handle>`, `artifact:<normalized-path-or-declared-record-key>`. Gate and receipt records use `gate:<id>`, `receipt:<id>`. Mixed target kinds resolve exactly one declared namespace. Legacy screen-only declarations use the actual screen identity and remain unresolved for required state coverage. Contract-local AC never resolves against a story accidentally.

Normalize local paths against their declared document/spec/tests_root/runtime-project base; realpath stays inside it. Local fragments and ids resolve in their stated namespace. Null, allowed `—`, explicit `not-applicable: <reason>` and frozen external citations emit no causal edge. Unknown/ambiguous required references make the census incomplete, not empty/green. Export/runtime rebasing preserves identity and hashes. If a citation is external, its registry causal flag applies only to the local/typed variant; no external prerequisite node is invented.

**Document identity ownership (AM-9j).** Every identity declared by an authored document or record emits a causal `artifact:<normalized declaring document path> → <kind>:<declared id>` edge with relation `derives`: the authored document is a prerequisite of the identity it defines. This uses the existing causal relation and leaves the shipped graph relation vocabulary unchanged. The closed [identity-location contract](reference-registry-document-identities.json) covers front-matter identities, PRD REQ rows, decision-ledger ids, US AC/scenario ids, contract amendments, inventory screen/state ids, catalog handles, record identities and document-qualified glossary anchors. Where a location already emits logical-parent ownership (US → AC/scenario, contract → amendment), its `ownership` endpoint additionally emits document → declared identity using the same target and provenance; it MUST NOT replace the logical-parent edge. JSON and Markdown representations coalesce after normalization, retaining provenance. Reusable definitions and packet projections inherit the original declaring document, never the containing projection. A non-declaring reference, graph endpoint projection, scenario consistency row or incidental mention never creates ownership; `manifest.readable.direct_groups` selects existing groups rather than declaring them. Equal resolved identities coalesce and emit no self-edge; required unresolved document context makes the census incomplete. Thus every document-level `trace.*` prerequisite propagates transitively to all its declared ids. Crosswalk `rows[*].id` and source-ledger `items[*].id` declare document-qualified local artifact identities and MUST emit the same document → identity `derives` ownership. Their record path is the declaring document path. Crosswalk canonical destinations, owner/source locators, ledger mapping ids and crosswalk file/row joins reference existing identities and never declare them. Crosswalk legacy spellings remain checked non-reference literals under D13/C9.

## 2. Board direction

A causal board association is **US/AC/screen-state → board**, relation `renders`: requirements and state behavior are prerequisites of their rendered board. Changing them invalidates the board; a board change does not redefine a requirement. `screens[*].source.ref` with html-board has this direction; a symbolic figma source remains non-causal navigation. Wireframe-index, generic HTML links and image previews are mentions. Matching HTML/PNG declares one W-id, never opposite causal edges. Story screen associations render from US into explicitly applicable states.

The [independent direction contract](reference-registry-direction-contract.cjs) audits every relation, direction and causal flag (including uses/governs and non-causal mentions/history) against its owning Format/design section. Format §6 Readable layer states “Pages are derived from build + map”: build US/REQ → readable capability and epic-map → readable page. Format §3/F2 and §6 define REQ → US → AC → scenario → test; contract → amendment; decision → hidden-scope map. Design §1 defines owned tokens → generated mirrors; §2/§4 define screen/UI behavior → scenario verification. Exact gate-data §F7 defines producing stage → output artifact. A PRD identity row derives its declared REQ from the PRD artifact, never from that REQ itself. Gate-model §4/§5 additionally requires prerequisite→consumer uses, amendment/decision→affected node governs, and non-causal mentions/supersedes. New locations require an independently sourced direction expectation before coverage can pass.

## 3. Documented body grammars

Rows below are exact registry locations; owning sections and parsers are in the registry. `heading: "*"` searches all unfenced headings/tables. Header alternatives split on `|`; fixed ui-contract/glossary headers remain exact. First-cell ids exclude separator rows. Expand SCN suffix ranges inclusively, preserving local association ownership. A body-heading `capture` selects a capture group from the same heading pattern. Body token patterns document a GFM parser, including reference-style links/autolinks and HTML href/src, not regex-only Markdown parsing. Code, front matter and comments are excluded.

Tables and normalized JSON represent the same association once. PRD Stories aliases its optional US column. H2 `## A-n (date, source, Dn) — title` equals H1 `# Amendment A-n (...) — title`. Explicit amendment affected ids qualify against that contract; explicit decision application/affected ids emit decision → target governs, while incidental prose/history remains mentions. Story-index REQ joins emit REQ → indexed US. US section 4 AC identity emits both document → AC and logical US → AC ownership. Scenario detail rows check front-matter consistency and do not create a second authority.

| Entry | Doc type | Location |
|---|---|---|
| us-ac-identity | us | {"kind":"body-table","heading":"^## 4\\.","column":"ID\|AC","pattern":"^AC-\\d+$"} |
| us-ac-scenarios | us | {"kind":"body-table","heading":"^## 4\\.","column":"Scenario\|Scenarios","pattern":"SCN-[A-Z0-9]+-\\d+(?:\\.\\.\\d+)?"} |
| scenario-detail-id | us\|review\|build | {"kind":"body-table","heading":"*","column":"Scenario","pattern":"SCN-[A-Z0-9]+-\\d+"} |
| scenario-detail-ac | us\|review\|build | {"kind":"body-table","heading":"*","column":"AC","pattern":"(?:[A-Za-z0-9_-]+\\.)?AC-\\d+"} |
| prd-req-identity | prd | {"kind":"body-table","heading":"*","column":"ID","pattern":"^REQ-\\d+$"} |
| prd-req-stories | prd | {"kind":"body-table","heading":"*","column":"US\|Stories","pattern":"(?:US-(?:\\d+\|P\\d+)\|NF-\\d+)"} |
| prd-req-source | prd | {"kind":"body-table","heading":"*","column":"Source","pattern":".+"} |
| index-story-file | us-index | {"kind":"body-table","heading":"*","column":"File","pattern":"[^\\s]+\\.md(?:#[^\\s]+)?"} |
| index-story-req | us-index | {"kind":"body-table","heading":"*","column":"REQ","pattern":"REQ-\\d+"} |
| contract-amendment-row-id | contract | {"kind":"body-table","heading":"^#{1,2} (?:Amendment )?A-\\d+","column":"\\#","pattern":"^A\\d+-\\d+$"} |
| contract-amendment-affected | contract | {"kind":"body-table","heading":"^#{1,2} (?:Amendment )?A-\\d+","column":"Affected ids","pattern":".+"} |
| contract-amendment-source | contract | {"kind":"body-table","heading":"^#{1,2} (?:Amendment )?A-\\d+","column":"Source","pattern":".+"} |
| contract-change-log-decision | contract | {"kind":"body-table","heading":"^## (?:\\d+\\. )?Change log","column":"Approved\|Decision","pattern":".+"} |
| decision-ledger-identity | decisions | {"kind":"body-table","heading":"*","column":"Id","pattern":"^D\\d+$"} |
| decision-ledger-affected | decisions | {"kind":"body-table","heading":"*","column":"Detail\|Source\|Affected ids","pattern":".+"} |
| legacy-inventory-screen | ux | {"kind":"body-table","heading":"*","column":"Screen\|ID","pattern":"^S\\d{2}(?:-[a-z])?$"} |
| contract-amendment-heading | contract | {"kind":"body-heading","pattern":"^#{1,2} (?:Amendment )?(A-\\d+) \\((\\d{4}-\\d{2}-\\d{2}), ([^,]+), (D\\d+)\\) — (.+)$","capture":"1"} |
| contract-amendment-heading-decision | contract | {"kind":"body-heading","pattern":"^#{1,2} (?:Amendment )?(A-\\d+) \\((\\d{4}-\\d{2}-\\d{2}), ([^,]+), (D\\d+)\\) — (.+)$","capture":"4"} |
| ui-table-screen | ui-contract | {"kind":"body-table","heading":"*","column":"Screen","pattern":".+"} |
| ui-table-state | ui-contract | {"kind":"body-table","heading":"*","column":"State","pattern":".+"} |
| ui-table-us | ui-contract | {"kind":"body-table","heading":"*","column":"US","pattern":".+"} |
| ui-table-used-by | ui-contract | {"kind":"body-table","heading":"*","column":"SCN","pattern":".+"} |
| ui-table-components | ui-contract | {"kind":"body-table","heading":"*","column":"Components","pattern":".+"} |
| ui-table-patterns | ui-contract | {"kind":"body-table","heading":"*","column":"Patterns","pattern":".+"} |
| glossary-term-anchor | glossary | {"kind":"body-table","heading":"^## Terms","column":"Anchor","pattern":".+"} |
| glossary-source | glossary | {"kind":"body-table","heading":"^## (?:Terms\|Ban list)","column":"Source","pattern":".+"} |
| glossary-copy-key | glossary | {"kind":"body-table","heading":"^## (?:Terms\|Ban list)","column":"Source key","pattern":".+"} |
| glossary-exception-source | glossary | {"kind":"body-table","heading":"^## (?:Terms\|Ban list)","column":"Exceptions","pattern":".+"} |
| body-document-link | * | {"kind":"body-heading","pattern":"\\[[^\\]\\n]+\\]\\(([^)]+\\.md(?:#[^)]*)?)\\)"} |
| body-image | * | {"kind":"body-heading","pattern":"!\\[[^\\]\\n]*\\]\\(([^)]+)\\)"} |
| body-wireframe-link | * | {"kind":"body-heading","pattern":"\\[[^\\]\\n]*\\]\\(([^)]+\\.html(?:#[^)]*)?)\\)"} |
| body-id-mention | * | {"kind":"body-heading","pattern":"(?:US-(?:\\d+\|P\\d+)\|NF-\\d+\|REQ-\\d+\|D\\d+\|(?:[A-Za-z0-9_-]+\\.)?A-\\d+\|(?:[A-Za-z0-9_-]+\\.)?AC-\\d+\|BR-\\d+)"} |
| context-term-source | note | {"kind":"body-heading","pattern":"_Source_:\\s*(.+)"} |
| epic-map-epics-id | epic-map | {"kind":"json","path":"epics[*].id"} |
| epic-map-epics-slug | epic-map | {"kind":"json","path":"epics[*].slug"} |
| epic-map-epics-page | epic-map | {"kind":"json","path":"epics[*].page"} |
| epic-map-epics-capabilities-id | epic-map | {"kind":"json","path":"epics[*].capabilities[*].id"} |
| epic-map-epics-capabilities-us | epic-map | {"kind":"json","path":"epics[*].capabilities[*].us[*]"} |
| epic-map-epics-capabilities-merged-us | epic-map | {"kind":"json","path":"epics[*].capabilities[*].merged[*].us"} |
| epic-map-epics-capabilities-req | epic-map | {"kind":"json","path":"epics[*].capabilities[*].req[*]"} |
| epic-map-hidden-us | epic-map | {"kind":"json","path":"hidden[*].us"} |
| epic-map-hidden-decision | epic-map | {"kind":"json","path":"hidden[*].decision"} |
| epic-map-source | epic-map | {"kind":"json","path":"source"} |
| gate-data-context | gate-data | {"kind":"json","path":"context[*]"} |
| gate-data-inputs-key | gate-data | {"kind":"json","path":"inputs{key}"} |
| gate-data-outputs-key | gate-data | {"kind":"json","path":"outputs{key}"} |
| gate-data-evals-report | gate-data | {"kind":"json","path":"evals[*].report"} |
| gate-data-review-report | gate-data | {"kind":"json","path":"review.report"} |
| gate-data-invalidation-changed | gate-data | {"kind":"json","path":"invalidation.changed[*]"} |

## 4. Record and projection references

Record ids declare artifact/gate/receipt/decision identities in their owning namespace. Scope/member/target.kind/id fields select explicitly typed context, never counts/wildcards. Graph endpoint properties verify the graph; they do not manufacture causal dependencies. Only a registered causal association justifies an invalidation edge. Body-declared epic-map and gate-data paths above retain existing shape rules; the registry asserts no new payload validity exemption.

Receipts use original source/AC/SCN/fixture/build as prerequisites and cite capture outputs/history without making a behavioral requirement depend on its own evidence. Supersession remains non-causal with all AM-9 witness/validity rules. Packet fields are projections: embedded inventory/receipt/change/exception/review records expand the owning schema entries with inherited owner context; they never duplicate or reverse original edges. Shared scope/pin/hash objects expand their annotated leaves; digests are not reference ids. Artifact-map entries emit path-key references, not hash-value references.

Reference resolution first checks exact typed ids, then exact local path/fragment in the declared context. A qualified graph id remains byte-identical; prefixes never double. Adapter-local component/pattern handles use the declared catalog adapter and kind; `<adapter>/<handle>` values retain their existing qualifier. Authority/catalog ids join their adjacent pinned path. Replacement/superseded ids are history. Roles/scope, rubric labels and selector names are context literals unless another registered field declares their reference namespace.

The meta-check rejects every unclassified string location, checks exact one-to-one bindings, and uses a closed doc-type/schema/body ownership contract. Non-reference declarations are a human/verifier trust boundary; deterministic checks establish shape, location and binding, never the meaning of unrestricted text. Lint/runner shared extraction and execution parity remain downstream acceptance items.

## 5. Runtime config body bindings

These project-original bindings are distinct from spec-relative manifest copies. Exact id/version selections are one documented body grammar each; version is part of the gate identity, not an independent dependency. Directory contents and selections are prerequisites of effective pipeline config; effective config feeds every consuming gate. Decision/exception authority governs that config. `project.spec_root` supplies the required original/export identity join. Versions and PO emails are literal binding/identity metadata, not graph references. D24: a spec-only export without `config/pipeline.yaml` is out of pipeline scope; the census emits no `pipeline-project-spec-root` causal node there and records the marker `pipeline not in scope`, and pipeline/gate readiness is refused rather than reported green.

| Entry | Doc type | Location |
|---|---|---|
| pipeline-gates-definitions-dir | pipeline | {"kind":"json","path":"gates.definitions_dir"} |
| pipeline-gates-stage-definitions | pipeline | {"kind":"json","path":"gates.stage_definitions{value}"} |
| pipeline-gates-scoped-definitions | pipeline | {"kind":"json","path":"gates.scoped_definitions[*]"} |
| pipeline-gates-graph | pipeline | {"kind":"json","path":"gates.graph"} |
| pipeline-gates-receipts-dir | pipeline | {"kind":"json","path":"gates.receipts_dir"} |
| pipeline-gates-candidates-dir | pipeline | {"kind":"json","path":"gates.candidates_dir"} |
| pipeline-gates-decisions-dir | pipeline | {"kind":"json","path":"gates.decisions_dir"} |
| pipeline-gates-exceptions-dir | pipeline | {"kind":"json","path":"gates.exceptions_dir"} |
| pipeline-gates-changes-dir | pipeline | {"kind":"json","path":"gates.changes_dir"} |
| pipeline-gates-baseline | pipeline | {"kind":"json","path":"gates.baseline"} |
| pipeline-design-adapter | pipeline | {"kind":"json","path":"design_adapter"} |
| pipeline-project-spec-root | pipeline | {"kind":"json","path":"project.spec_root"} |
| pipeline-stages-context | pipeline | {"kind":"json","path":"stages.*.context[*]"} |
| pipeline-stages-skill | pipeline | {"kind":"json","path":"stages.*.skill.skills[*]"} |
| pipeline-review-rubric | pipeline | {"kind":"json","path":"review.rubric"} |
| pipeline-review-log-dir | pipeline | {"kind":"json","path":"review.log_dir"} |
| pipeline-gates-dir | pipeline | {"kind":"json","path":"gates.dir"} |
| pipeline-evals-per-file | pipeline | {"kind":"json","path":"evals.*[].per_file"} |

## 6. Source discovery and semantic trust boundary

The fixed source corpus is SPEC.md §5, SPEC-FORMAT-v2, design-model, glossary-grammar and packet-interchange. `spec-grammar` fences in those owning sources declare typed locations, table selectors and heading captures. Discovery reads them directly and enumerates every source statement, inline token, YAML/JSON field and table/header cell; it never obtains discovery input from this companion table, classifications or registry. Structured declarations cover prose-only optional fields, including per_file. Exactly one separate classification per discovered site is required; missing, duplicate and stale classifications fail. Adding an undeclared normative column/config field changes the discovered corpus and fails before a registry edit. Source statements are content-pinned review units, not semantic classification by keyword.

Only typed grammar declarations bind extraction entries. Non-reference fields/captures still require classification. Source-classification files are review material, not an independently approved ruling: the DEV author cannot approve their own semantic exclusions. Independent verification must judge each non-reference declaration and every changed prose unit against the original authority. A free-text value can contain an incidental or normative reference; shape/reason/category cannot prove otherwise. Arbitrary prose semantics, dynamic parser context and downstream extraction remain explicit human/verifier boundaries. No local green count constitutes semantic acceptance.

Endpoint-context files declare each field's owning source template, target namespace and parser-available context, including cases. Namespace/kind compatibility, exact ownership, placeholder availability, case binding and templates necessarily emitting a causal self-edge are checked. Context contracts require independent review against owning schemas/body grammars; future extractor parity is not proven here. Typed identity/navigation sites suppress runtime self-edges; equal templates on causal rules are rejected. Input context/rubric/per_file paths are prerequisites, expanded within project root. review.log_dir/gates.dir designate output destinations only: non-causal context; exact output members are recorded by gate-data.outputs.

## 7. Crosswalk and source ledger bindings

Format sections 11–12 own the new typed sidecars; neither adds a Markdown type. Crosswalk row identity is a declared identity and is owned causally by its crosswalk record per AM-9j (`crosswalk-row-id`, relation `derives`); canonical selection, source locator and owner are non-causal provenance/context. Ledger source inputs, typed mappings and crosswalk joins are prerequisites of their ledger consumer (target → source, causal uses). Crosswalk canonical selection projects an already-declared identity and cannot manufacture behavior or approval. The sole legacy spelling leaf is a checked legacy-id literal; its closed shape and owning coordinate are pinned. Reasons, mapping enums and digests do not emit references.

All nine locations have schema bindings and independent endpoint/direction declarations. Endpoints use explicit record, row/item, frozen source-snapshot and crosswalk-path contexts. A screen target resolves the existing screen identity without claiming a state tuple; a feedback target is its existing record artifact. The crosswalk spelling is never a namespace.


## 6. Graph certification boundary

Graph certification MUST be evaluated over a current census conformance view derived from the full declared-reference census. The sole self-certification exception is a schema-valid content-addressed candidate manifest whose entire membership is exactly one artifact member with id equal to the configured graph path and whose artifacts map contains exactly that path; its member revision and filename digest MUST validate under packet-interchange §2. This classification is structural and MUST NOT depend on receipt verdict, timestamp, filename prefix, or selection of a preferred proof head.

Such a manifest may be omitted from the graph it certifies only when its artifact identity has no declared ownership and no causal outgoing relation in the full current census, and every causal incoming relation is its own registered candidate-manifest-members-artifacts binding from that graph. Only that terminal identity and those binding edges are omitted from this conformance view; the full census and provenance remain available. A failed or unresolved boundary check MUST NOT grant the exception. No-impact proof for an omitted identity is unavailable. Any declared ordinary dependency on that identity remains required and MUST fail closed when not represented; no exclusion propagates to its consumer.

The configured graph artifact, every graph-proof receipt identity and its document ownership, ordinary candidate manifests, and all other causal relations remain subject to AM-9f/g/i/j. Graph eligibility additionally requires the existing current raw-byte graph binding, real canonical candidate digest, independent graph-completeness review and all-current-head rules. A missing, malformed, stale, conflicting or failing proof cannot become acceptable through this exception. Proof records and their historical manifests remain stored and directly validated; exclusion from this conformance view is neither deletion nor retirement.

Both lint and runner MUST derive this view through the same registry-controlled implementation and recompute it from current declared sources before relying on graph completeness or no-impact. They MUST NOT reuse a pre-proof inventory after ordinary source changes. Changes to proof topology require regeneration and new review under existing round caps; changing only validated digest bindings must not introduce a new conformance obligation for the terminal certificate manifest.

Clarification `decision_ref` keeps existing D-id ruling references. PO-supplied answers use `input/answers.md#Q-nnn`, a project-relative artifact prerequisite even when the record is exported under `spec/records/clarify/`. Lint joins the exact question, answer, decider and UTC date to the source row; the locator never grants PO authority.

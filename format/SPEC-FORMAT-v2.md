# Spec Format v2

The standalone contract between spec producers, lint, the pipeline runner, migration and the offline reader. MUST, MUST NOT and REQUIRED are normative. The PRODUCT:OS Spec Driven kit workflow is [SPEC.md](../SPEC.md); this document owns document syntax, validation, generated inputs and migration. Normative companions: [loop/gate model](gate-model.md) and [design/UIUX model](design-model.md). Their schemas, state tables and validation rules are part of this contract. A schema validates parsed JSON values, not Markdown, cross-file references or approval.

```text
spec folder -> lint -> render -> offline reader
               |       |         PO / Dev / QA / Open items / coverage
         file:line+fix   refuses errors; --force shows a red invalid-spec banner
```

Persons are emails or roles, never personal names. A business rule has one source and is referenced by id. Unknown behavior stays explicitly `OPEN:`. Unplaceable documents are errors, never silently discarded. Generated text does not become a second source of truth. Approved specs, passing tests, recent chips and rendered screenshots are different evidence.

## 1. Folder layout

Folder names are conventions mapped by manifest artifacts. `readable/` is fixed and contains `epic-map.json`. A spec root is the document bundle, not necessarily the repository root. Kit templates, rules, prompts, pipeline configuration and review gates live outside that bundle unless explicitly exported as conforming documents.

```text
spec.manifest.json          required at spec root
README.md                   optional overview (overview)
intake/                     original BRD, brief, research, red team (intake)
contract/                   master/product + feature contract, amendments (contract)
prd/                        requirement tables (prd)
us/                         INDEX.md (us-index), US-xx.md / NF-xx.md (us)
readable/                   release, epic, readable-review pages + epic-map.json
ux/                         flows (ux), screen/state inventory (screen-inventory), selector contract (ui-contract)
ux/wireframes/png/          W-01-name.png
ux/wireframes/html/         W-01-name.html, same base name as PNG
delivery/                  wave specs, DAG, build reports, handoff (build)
reviews/                    design / QA / evidence reports (review)
decisions/                  ledger, open items, process log (decisions), glossary (glossary)
assets/                     coded screenshots and illustrations
changes/                    optional exact block wording history JSON
tests/                     optional default tests_root; never spec documents
```

Every `.md` in the document bundle is a document, except files under `tests_root` (test inputs are not reader pages). Recursively discover Markdown, including undeclared top-level folders, so misplaced documents cannot disappear. Images and linked HTML boards MUST stay inside the spec root. Board identity is `W-<two digits>`; matching PNG and HTML use the same base name. Only `overview`, `note`, and `glossary` may sit at root. `release`, `epic`, `readable-review` must be directly inside `readable/`. `ui-contract` must be in the declared UX artifact folder (convention `ux/`); `glossary` may be at root or in the decisions artifact folder. Other documents need a declared artifact folder.

Path resolution is POSIX relative to the declared base. Backslashes, absolute paths, URI schemes and paths resolving outside that base are forbidden for local resource fields. A `..` inside a document link is valid only if normalization and realpath stay inside the spec root. Symlinks must not escape. External HTTP(S) and mailto links may be displayed but are never fetched or counted as verified local destinations. Remote images are forbidden.

## 2. `spec.manifest.json`

Schema: [manifest.schema.json](schema/manifest.schema.json). Unknown keys are errors. JSON must be an object. Dates must be real calendar dates, not only match a pattern.

```json
{
  "format": "2", "title": "Saved filters", "language": "vi (EN product terms kept)",
  "date": "2026-10-07", "tests_root": "tests",
  "glossary": {"document": "decisions/glossary.md", "context": "CONTEXT.md"},
  "ui_contract": "required",
  "artifacts": [{"id": "stories", "folder": "us", "name": "User stories"}],
  "readable": {"epics": {"min": 1, "max": 8}, "capabilities": {"min": 1, "max": 7}},
  "changes": {"recent_days": 7, "locale": "vi"}
}
```

| Field | Required | Contract |
|---|---|---|
| `format` | yes | string `"2"`. `"1"` is rejected before any v2 schema/document checks, with one migration error |
| `title` | yes | nonempty, at most 80 characters; top bar, page title, overview |
| `tests_root` | yes | nonempty spec-relative directory; default in a generated project is `tests`. No escape from the spec root. May be absent on disk while there is no `auto` scenario |
| `glossary` | yes | object with `document` and/or `context`. `document` points to a local `type: glossary` Markdown file; `context` points to a local root `type: note` CONTEXT.md with term definitions and `_Avoid_` lines. Each declared file must exist |
| `language`, `date` | no | language max 40 characters; ISO date |
| `artifacts[]` | yes | nonempty list, each `id` and `name` required. `id`: `^[a-z][a-z0-9-]*$`; `name`: 1–80 characters; `folder`: one root folder matching `^[A-Za-z0-9][A-Za-z0-9_-]*$`; `n`: integer ≥1; `status`, `owner_role`: max 60 characters. Omitted folder means planned, not exported; once documents appear in the top-level folder named like a planned artifact's `id`, that artifact owns them (no manifest edit). A planned artifact whose id differs from its folder must declare `folder`. Effective `n` defaults to 1-based array position. IDs, effective numbers and folders must be unique. A declared folder must contain a file once the stage whose prompt declares output under that folder is the current stage; earlier stages defer the check (a lint without a stage always checks) |
| `tiers[]` | no | each `id`, `name` required; `id` same pattern as artifact id; optional text `audience`, `status`, `purpose`. IDs unique. Empty/absent list uses defaults below |
| `tier_by_type` | no | map of supported type to an existing tier id. `index` is always available |
| `readable` | no | `epics` and `capabilities` each accept min ≥0, max ≥1, min ≤max. `check` has the customization keys below. `direct_groups`: unique `BRD-[1-9][0-9]*` ids |
| `images.deny` | no | list of nonempty spec-relative paths of retired images; an exact normalized match or a path ending in `/` plus that path is denied |
| `theme.tokens` | no | local CSS replacing colors, fonts, spacing. Must declare every variable in the shipped default theme; additional variables allowed |
| `reading_order[]` | no | objects `{pages: [document-id, ...], note?: text}`; nonempty page lists, every id resolves case-insensitively |
| `changes.recent_days` | no | inclusive days before newest document `updated`; integer 0–36500, default 7. Never use the machine clock |
| `changes.locale` | no | `vi` or `en`; default vi if language starts with vi, else en |
| `changes.blocks` | no | local `.json` block-history file, section 10 |
| `ui_contract` | no | `optional` (default), `required`, or `legacy-absent`. Required at the design output and later stages whenever pipeline `design` or `uiux` is enabled |
| `design` | conditional | `{profile, inventory, sources?, evidence?}` local JSON paths; required at new enabled-design output and later. Profile and inventory schemas in design model. Evidence array contains receipt JSON paths |
| `gate_model` | no | `{graph, changes, receipts, records?}`: local graph JSON, change-set document paths, receipt JSON paths; if declared these three are required. Optional `records` (AM-2) is a spec-relative directory where the runner exports its gate records with fixed names: `definitions/<id>/<version>.json`, `gates/<gate-id>.json`, `transitions/<id>.json`, `exceptions/<id>.json`, `decisions/<id>.json`, `packets/<packet-id>/packet-data.json`, `clarify/<Q-id>.json` ([clarify-record](schema/clarify-record.schema.json), AM-4), `expected/<XC-id>.json` ([expected-change](schema/expected-change.schema.json), AM-4), `integration/<INT-id>.json` ([integration-record](schema/integration-record.schema.json), AM-5), `feedback/<FB-id>.json` ([feedback-record](schema/feedback-record.schema.json), AM-5), `candidates/<sha256>.json` ([candidate-manifest](schema/candidate-manifest.schema.json), AM-6; required for every exported gate that names `candidate.manifest`), `rounds/<gate-id>.json` ([rounds-ledger](schema/rounds-ledger.schema.json), AM-6), `audit.jsonl`. Lint runs every `Q-*` record rule over `records`; when `records` is absent lint prints `Q-record checks: NOT RUN (no gate_model.records)` and counts it as not checked, never as passed. In `--stage <s>` mode absent record inputs produced by stage s or later remain NOT RUN; preceding-stage declared mandatory inputs and every existing record join remain enforced. Export/handoff validates declared record requirements. Live records are enforced by the runner |
| `migrated_from`, `migration_report` | conditional | `migrated_from: "v1"` and local JSON `migration_report` required for `legacy-absent`. Both are emitted by migration, not a hand-written v2 exemption |

Default tiers, in order: vision (PO, stakeholder, lead), scope (everyone), backlog (PO, Dev, QA), release (PO, Dev, delivery), ba (BA, Dev, QA), ux (designer, Dev), build (Dev, lead), qa (QA, reviewer), decisions (everyone). The index tier is the overview. Type defaults appear in section 3. Default theme is the shipped project design-system look, replaceable by tokens without changing shell code.

`readable.check` supports `sections` and `backlogStatus` (default `Backlog`). `sections.page`, `.block`, `.release` are lists of full Markdown heading lines. `.scope`, `.releaseScope`, `.buildDetail`, `.ac`, `.acHeader`, `.acEmpty` are strings. Defaults are in section 6. User-goal epic limits default to 6–8, capability limits to 3–7; backlog epics bypass those count limits. These are structural grouping limits, not coverage exemptions. Migration preserves existing explicit limits and heading customizations.

A migration report MUST record source format `"1"`, SHA-256 of a deterministic source-tree inventory, every input/output document/US/AC/REQ/decision count, defaulted/dropped fields, missing references, absent UI-contract screen ids, and unresolved mappings. Lint checks a readable JSON object, `source_format: "1"`, `source_sha256` of 64 lowercase hex digits and `ui_contract_missing_screens` as unique screen ids before accepting `legacy-absent`. Provenance is a recorded assertion, not cryptographic proof that a human could not forge the file. The independent migration verifier proves the copy/counts.

## 3. Front matter

Every document begins with `---` on line 1, a YAML mapping, then `---`. Schema: [front-matter.schema.json](schema/front-matter.schema.json). Supported YAML: plain or quoted scalars, inline arrays/maps, nested mappings, block `- ` sequences. Duplicate mapping keys, aliases, anchors, merge keys, tags, executable values and multiple YAML documents are errors. Parse dates as strings; require booleans `true`/`false`, never on/off/yes/no. Unknown fields are errors with a suggested correction when possible.

| Field | Required | Contract |
|---|---|---|
| `id` | yes | `^[A-Za-z0-9][A-Za-z0-9_-]*$`, max 64; unique ignoring case. Used as page/deep-link id; page key is lowercase |
| `type` | yes | one of the types below |
| `title` | yes | 1–160 characters; body has no H1 except contract Amendment headings |
| `updated` | yes | real ISO `YYYY-MM-DD` |
| `status`, `owner_role`, `group` | no | max 60 characters; owner_role is a role, not a person |
| `tier` | no | existing tier id `^[a-z][a-z0-9-]*$`, overriding type default |
| `audience` | no | max 80, replaces tier audience banner |
| `label` | no | max 160; tree/pager label, defaults to title |
| `order` | no | integer ≥0; ascending within group, unnumbered follow by filename |
| `trace` | no | object of unique arrays `req`, `us`, `ac`, `decisions`, `amendments`; each target exists. AC may be local on its owning US, otherwise qualify it |
| `images` | no | array `{src, role, reason?}`; src nonempty document-relative path, role coded/wireframe, reason 1–300 characters when present; section 7 |
| `wireframe` | no | boolean; declares a page whose purpose is wireframe boards |
| `data` | conditional | spec-relative JSON payload required only for screen-inventory/change-set; body links resolve from its document, data resolves from bundle root |
| `no_ui` | no | US-only nonempty reason; gate additionally requires PO applicability confirmation |
| `primary` | no | boolean, only prd/contract; exactly one primary when several of that type, at most one otherwise |

Reserved ids, compared without case: `start`, `changes-to-read`, `reference-chain`, `amendments`, `decisions`, `dossier`, `open-items`, `po-view`, `dev-view`, `qa-view`, `coverage`. Renaming collisions is recorded by migration and updates references, never drops documents.

| Type | Meaning / default tier | Type-specific fields |
|---|---|---|
| overview / note | guide or supporting note / index | no extra required fields |
| intake | BRD, brief, research, brainstorm, red team / vision | none |
| contract | product/feature contract, amendments / scope | optional `amendments: [{id, summary}]`; summary 1–300 |
| prd | REQ tables / ba | optional primary |
| us-index | file/story/REQ index / backlog | none |
| us | one story / ba | REQUIRED `epic` (1–80), `trace.req` (≥1), `scenarios` (≥1 structured object). Optional `priority`, `wave` (max 40), `screens`, `boards` |
| release / epic / readable-review | derived readable pages / readable view | none, order sorts pages |
| ux | flows, screens, design / ux | optional boolean `inventory` |
| wireframe-index | board list / ux | optional `board_names: [{id: W-01, name: nonempty}]` |
| ui-contract | pre-code screen selectors / ux | no extra front matter; required rows below |
| screen-inventory | structured screen/state coverage / ux | required data pointer, design model §2 |
| change-set | post-handoff change draft / build | required data pointer, gate model §8 |
| build | wave spec, DAG, report, handoff / build | none |
| review | design / QA / evidence / qa | none |
| decisions | ledger, open items, process log / decisions | optional boolean `ledger`, `topics: [{id, name, note?, ids: [D1]}]`. Topic id `^[a-z][a-z0-9]*$`, name nonempty, ids nonempty |
| glossary | terms and banned wording / decisions | no extra front matter; required tables below |

Fields `epic`, `priority`, `wave`, `screens`, `boards`, `scenarios` belong only to us; `inventory` only ux; `board_names` only wireframe-index; `ledger`/`topics` only decisions; `amendments` only contract; `primary` only prd/contract. `screens`/`boards` are unique arrays of the patterns in section 4. `data` belongs only to screen-inventory/change-set; `no_ui` only to us. No other per-type fields are implied. Version/owner/source metadata of legacy contract templates belongs in body tables, not additional front matter.

### Scenario object (F2)

```yaml
scenarios:
  - id: SCN-16-01
    ac: [AC-01, AC-02]
    method: auto
    test: browser/checklist.spec.ts#ticks from a visit
    status: planned
  - id: SCN-16-13
    ac: [AC-10]
    method: visual
    status: planned
```

`id`, `ac`, `method`, `status` are required, unknown keys forbidden. `ac` is a nonempty unique array of LOCAL `AC-<digits>` ids in this US's section 4. One scenario may cover several distinguishable AC; every AC MUST have ≥1 scenario. A prefix does not assert ownership: merged `SCN-20-01` may be declared in US-16. Scenario ids are unique WITHIN a US. Reuse across US is valid as distinct associations to each owning US's AC; canonical reference is `<US-id>.<SCN-id>`. Lint and reader key the pair, never silently collapse reused ids. A bare SCN in a ui-contract row resolves against that row's listed US ids. Review checks whether reused expected results actually agree.

`method` is exactly `auto | visual | review | manual | not-built | unassigned`. `test` is required iff method is auto, forbidden otherwise. It is `<relative-file-path>#<test-name>`: one `#`, nonempty exact name, no wildcards, no absolute path or escape, resolved relative to manifest tests_root. The file MUST exist and its text MUST contain the exact SCN id and exact test-name string. This deterministic string check is NOT proof that a test framework discovers or executes the test. TDD/UIUX evals run the declared tests. Several scenarios may use one test only when each SCN id is present.

`status` is exactly `planned | passing | failing | blocked | stale`. It is a declared state, not evidence. `not-built`/`unassigned` cannot be passing, failing or stale: use planned/blocked. Missing behavior uses not-built, unknown verification assignment uses unassigned. Every unassigned association emits one ratchet warning and counts in the summary; G3 requires a reviewed assignment for selected scope, never an invented method. No global warning suppression waives the G3 requirement.

A scenario detail row in US section 6 or a traced `review`/`build` document contains `Scenario | AC | Precondition / data | Steps | Expected | Method / evidence`. It supplies fixture, viewport and environment where relevant. Front matter owns method/test/status/AC association; a body row must not contradict it. A minimal planned scenario may derive its Given/When/Then directly from the AC, without a duplicated detail row. Gate evidence is REQUIRED before passing counts toward G4, in an eval report bound to commit/build/environment and scenario id.

## 4. Ids

| Entity | Pattern / scope |
|---|---|
| requirement | `^REQ-\d+$`, unique across PRD documents |
| story | `^(US-(\d+\|P\d+)\|NF-\d+)$`, equals filename stem, case exact |
| AC / rule | `^AC-\d+$` / `^BR-\d+$`, local to document; global AC `<US-id>.AC-<digits>` |
| decision | `^D\d+$`, unique in the one primary decision ledger |
| amendment / row | `^A-\d+$` / `^A\d+-\d+$`, unique within contract; bare trace.amendments resolves in primary contract; qualified `<contract-document-id>.A-n` resolves that contract |
| capability / epic | `^C-\d+$` / `^E\d+$`; direct group `^BRD-[1-9][0-9]*$` |
| screen / board | `^S\d{2}(-[a-z])?$` / `^W-\d{2}$` |
| scenario | `^SCN-[A-Z0-9]+-\d+$`, local association keyed by owning US + id |
| contract scope row | `^SC-\d+$`, local to contract |
| glossary anchor | `^[a-z][a-z0-9-]*$`, unique across selected glossary sources |

Allocate ids at write time: read existing allocations, add the next unused id. Do not preassign, reuse a retired id or change an id's meaning. Gaps are valid; migration MUST NOT renumber AC/REQ/US to make sequences continuous. Business rules live in contract or PRD; US-specific detail may live in the owning US. A qualified trace.ac resolves the specified story/AC; an unqualified AC is only valid in trace.ac on that owning US. The reader creates forward and reverse relation lists from these associations.

Existing ids in prose (`US-16`, `REQ-13`, `D85`, `A-02`, `US-16.AC-01`) become links. Qualified AC opens its owning row. A table row whose first cell is an id gets `#<lowercase-page-id>.<row-id>` (row id keeps its spelling). Prose references are explanatory; required coverage uses machine associations, not a PRD link at the bottom of a story.

## 5. Body rules

GFM Markdown. No H1 title in body except contract `# Amendment ...`. Fences (backticks or tildes) close with the same marker and at least the opening length. Mermaid fenced blocks render as diagrams; parse failure shows source and fails reader verify. HTML boards are linked, never inlined. Story ASCII wireframes are plain fenced blocks in section 6.

Document links are relative `.md` paths, optionally a heading or table-row fragment. Heading slug: lowercase, fold accents (`đ` → `d`), replace non-alphanumerics by hyphens, trim/collapse hyphens; duplicate headings suffix `-1`, `-2` in occurrence order. `3. Dữ liệu` → `3-du-lieu`. Every local target and fragment must exist; row fragments resolve as well as headings. Cross-references, open questions and sources sections are displayed at the end without changing source Markdown.

### OPEN extraction (F5)

An actionable marker is literal, case-sensitive `OPEN:` or `OPEN[blocking]:` outside fenced code, inline code, HTML comments and front matter. Marker must start the trimmed line or a Markdown list item / blockquote / table cell (after optional bold wrapper). Mentioning the marker in quoted code is documentation, not a question. One marker = one item, at least nonempty question text; optional owner email and impacted AC follow in the same text. Multiline continuation remains attached until the next item/heading/blank line. Example: `- OPEN[blocking]: Which role may publish? Owner: po@example.test. Affects AC-03.`

Lint reports per-US total and blocking counts even when zero. OPEN alone does not fail lint and does not invent an answer. The reader's Open items page shows original question, US, source line, optional owner and direct link. `OPEN[blocking]:` emits a lint error and MUST fail G3. Ordinary OPEN that a reviewer proves changes a selected acceptance result is also a G3 blocker until settled or reclassified. Inline US markers are the canonical questions; a decisions/open-items page is an index, not a second edited copy. A resolved marker is replaced by approved behavior and linked to a dated decision. All handoff-required answers must be settled at G5.

### Writing rules and term checks (F4)

Build text may reference source rules by id. Readable prose and role-view TEXT follow the baseline writing rules: actor, action, observable result; one name per concept; explicit inputs/Then; no unsupported guesses, author instructions, advertising, vague ban-list wording, repeated rule copies, or opaque `according to BR-03`/`theo BR-03` wording. IDs in metadata, tables used by QA, links and Build detail are navigational data and remain available. Diagrams show questions with mutually exclusive answers and match the adjacent flow table. Semantic quality is reviewed, not inferred from schema success.

Lint `D-TERMS` scans displayed readable prose (release/epic/role text) for declared banned wording. Normalize Unicode NFC, case-fold, collapse whitespace. Match a whole phrase using Unicode letter/number boundaries, without stripping accents. Exclude code, link URLs, front matter, glossary ban/source tables and metadata badges. Replacement text is required; report matched phrase/source/replacement. It is not the baseline uppercase-Latin/substring heuristic. Arbitrary unknown jargon cannot be reliably classified automatically: reviewer checks all terms have an inline definition or glossary source. Explicit glossary links must resolve (`G-TERM-REF`). A ban-list never becomes a ban on identifiers or a reason to remove unknown business requirements.

## 6. Required structure per type

### `us` (compact team shape)

Exactly one numbered H2 for each 1 through 6, in order. Words after numbers may be translated. Additional unnumbered supporting H2 sections may follow. Required content:

| Section | Content |
|---|---|
| 1. User Story | role, desired behavior, user value |
| 2. Flow | start, main path, branches; ≥1 Mermaid flowchart |
| 3. Data and rules | fields/constraints and rules with source; BR table when rules apply |
| 4. Acceptance Criteria | AC table, concrete Given/When/Then, empty state when applicable |
| 5. Edge cases | empty, errors, permissions, concurrent state as applicable, reasons when not applicable |
| 6. UI | screen/state + coded capture or ASCII wireframe, or explicit no-UI reason; scenario detail where needed |

Section 4 first column contains `AC-<digits>` (header ID or AC), Then column present, Given and When separate or combined `Given / When`. Every row has header cell count, nonempty Given/When and Then; AC unique in US. Optional Scenario/Scenarios column contains SCN ids or a range with inherited prefix (`SCN-16-02..05`); expand inclusive numeric suffix ranges. Every cited SCN must be in front matter and its `ac` must include this row. Front matter associations remain authoritative when the column is omitted. Extra evidence/source columns are valid. AC gaps are preserved.

### `prd`

At least one REQ table: first header ID, rows `REQ-01`, `REQ-02`; columns requirement and source. Tables may split across headings. Optional final US (or Stories) column lists story ids and must agree with story `trace.req` and the story index. An undecomposed REQ is marked as later work in text; `S-REQ-NO-STORY` warning lists each uncovered REQ when stories exist. G3/G5 still require coverage for selected scope. Content describes problem/outcome, in/out scope, rules, sources/assumptions, dependencies and delivery conditions. Exact six-section baseline PRD is replaced by this v1-compatible shape.

### `us-index`

A table `File | Story | REQ` (additional columns allowed). One row per story file, each file and REQ resolves, REQ union equals front matter trace.req. File paths are relative to the index. Every story appears exactly once and every indexed story exists.

### `contract`

Master/product: vision/outcome, boundary, users, terms, principles, constraints, authoritative sources, templates, DS, workflow/gates, delivery mode. Feature: problem/outcome, scope, inherited master version or `product: pending` with named temporary sources, PRD/US/AC selection, flow/UIUX, dependencies, scenarios/evidence, acceptance, demo limits, handoff. Put version, owner email and inherited contract pointer in body metadata. G2 does not require built evidence; later gates complete it.

A locked contract changes through dated amendments. Heading `# Amendment A-03 (2026-10-01, owner@example.test, D83) — <title>` or equivalent `## A-03 (2026-10-01, owner@example.test, D83) — <title>`; source text inside parentheses has no comma. Every amendment has a table `# | Change (already applied to body) | Affected ids | Source`, rows `A03-01`; ≥1 row, unique amendment/row ids, affected references resolve in their stated context. Order may be newest first or last. Contract-local AC references need contract context; never treat them as US AC.

A `## <n>. Change log` or `## Change log` table has Version, Date, Why/Change and Approved/Decision columns. Required when amendments exist; every date real. Optional front matter amendment summaries must name body amendments. Trace to amendments uses the primary contract; other contracts retain their own history. Newest amendment wins until folded into body, version advances, history remains. Changed acceptance invalidates affected evidence/approvals.

### `decisions` (ledger)

At most one `ledger: true`; it has a table `Id | Decision | Detail` with unique `D1`, `D2` rows. Detail/source records question, available options (do not reconstruct missing options), decision, reason, who (email), when, application reference. Other decisions pages may hold controller defaults and open-item indexes. Topics `{id,name,note?,ids}` refer to existing decision rows; ungrouped rows remain reachable under Other decisions.

Decision date: optional Date column, else first ISO date in Detail/Source and detail. Undated row has no chip and never inherits page.updated. Dates after newest page.updated are excluded from recent changes. Newer ruling supersedes older ruling on the same subject; retain older row with superseded reference. Search before asking again. An approved answer updates the owning artifact and ledger in the same change.

### Recent changes and reading before code

Generated `changes-to-read` uses dated pages, decision rows, amendment rows in the inclusive manifest window, newest first with direct row/page links and impacted-page links. It appears atop trees and overview. Chips: vi `Mới · dd/mm` and `Thay đổi cần đọc`, en `New · dd/mm` and `Changes to read`. Chip text is searchable accent-insensitively including `Moi`. Search opens exact decision/amendment rows and their source/detail text. Recency grants no approval or permission to build.

### Readable layer (`readable/`)

One release, one epic page per non-direct epic, optional readable-review (owner review of hidden scope), epic-map.json. Pages are derived from build + map, never independent business authority. Rebuild after a source change; the checker proves structure/reference consistency, NOT semantic equivalence. Reviewer checks wording against build AC. An intake-only bundle without readable pages/map is valid; once either exists, all these checks apply.

```json
{"version":"1.0", "statuses":{"Planned":"not started"}, "epics":[
 {"id":"E1","slug":"reuse-my-filters","title":"Reuse filters","page":"epic-1.md",
  "goal":"Reuse a saved selection","roles":["Developer"],"status":"Planned","screens":["Filter bar"],
  "capabilities":[{"id":"C-01","title":"Save a selection","text":"Save the selected filters.",
  "done_when":"The saved selection reopens.","us":["US-01"],"status":"Planned","req":["REQ-01"]}]}],
 "hidden":[{"us":"US-09","reason":"build-only detail","category":"technical","decision":"D5","decision_date":"2026-01-05","confidence":"high"}]}
```

Map version is its own nonempty string, not format version; preserve v1 values such as 2.1. Optional map metadata date, language, source and epic title_en are retained. Each epic requires nonempty id/slug/title/page/goal/roles/screens/capabilities/status. Statuses are a closed dictionary of word → description (`Built`, `In review`, `Planned`, `Backlog` are defaults, not production proof). Capability id/title/text/done_when/us/status/req required; `merged: [{us,note?}]` contributes stories too. Every story is placed exactly once in capability.us, merged or hidden; every id exists. Capability req equals the exact REQ union of its stories' trace.req/index. Hidden requires reason/category/decision/real decision_date/confidence (high/medium/low); decision resolves. Hidden build scope remains available in Dev/QA and the readable-review page when present. Never prune build stories without PO approval; approved merging leaves a stub and preserves tests/ids.

Epic page sections: `## Mục tiêu`, `## Ai dùng`, `## Thay đổi gì với người dùng`, `## Phạm vi`, `## Không thuộc epic này`, `## Câu hỏi mở`, `## Build detail`. Each capability has a Scope row and `### C-nn — <name>` block, `#### 1. User Story`, `#### 2. Flow`, `#### 3. Dữ liệu và quy tắc`, `#### 4. Acceptance Criteria`, `#### 5. Edge cases`, `#### 6. UI`, then `Build detail: US-01 · REQ-01` listing exact map unions. AC table default `| ID | Given | When | Then |`, ≥1 complete four-cell row, or `Chưa có trong build spec` only when source has none. The final Build detail section has `- Stories:` matching all epic stories.

Release sections: `## Bối cảnh và vấn đề`, `## Mục tiêu và KPI`, `## Phạm vi`, `## Người dùng và vai trò`, `## Scope`, `## Thuật ngữ`; Scope contains every capability. Page/block/release headings and Scope/Build detail/AC words may be customized by manifest readable.check.sections. Prose excludes SCN-, DL-, OI-, TD-, CI- codes and `(digits)`/`(n)` counts, except Build detail metadata; show counts as badges. Structural ids BR/AC/C and source-link metadata remain available. Writing rules additionally forbid opaque rule cross-references in readable prose.

Direct groups supplement user-goal epics: ids declared in readable.direct_groups, one map entry each with `direct: true`, `page: null`, nonempty metadata/capabilities and direct story links. A story's epic begins `BRD-n` identifying the group. Exact story placement and REQ union required; no hidden direct story, no direct story taken from a user-goal epic, no undeclared direct group. Direct groups are excluded from user-goal counts; all normal epic/release/capability checks stay active.

### `ux` and `wireframe-index`

UX flows are free text. Design content covers screens/routes/US, DS components, data constraints, and errors tied to owning US/edge case. `inventory: true` marks screen inventory; its screen rows define ids used by stories. Story screens must resolve when an inventory or ui-contract exists. Wireframe index usually sets wireframe: true, lists boards, may embed PNG; story boards and board_names must resolve to PNG or HTML files. Reader offers linked HTML wireframes for named boards.

### `ui-contract` (F3)

Schema for a normalized row: [ui-contract.schema.json](schema/ui-contract.schema.json). REQUIRED body table `Screen | Route | US | Element | Kind | SCN`, ≥1 row. Header spelling is fixed; column order fixed. Cells parse to `{screen, route, us, element, kind, used_by}`. US/SCN are comma-separated ids, trim whitespace; `—` is empty used_by before TDD. Element is either `role=<accessible-role>; name=<exact accessible-name>` or `testid=<exact-test-id>` (literal semicolon separates role/name, backslash escapes it within a name). `kind` is a nonempty description, e.g. button, input, link, dialog, status. `route` begins `/` and may contain route parameters such as `:id` or `{id}`; it is a declared route, not a file/network link.

Each row has a screen id, ≥1 existing US, one selector, kind, and array used_by. Selector uses nonempty role+name OR test_id, never both. Within each legacy screen selector is unique; extended rows scope uniqueness by screen/state/roles/scope as defined in design model; repeated elements share a row with union US/SCN lists. Screen route is consistent across rows; multiple screens/states may share a route. Every US in a row must declare that screen; every listed SCN must exist in at least one listed US. Every screen declared by US or inventory has ≥1 row WHEN a contract exists. Every auto scenario for a US with screens is used by ≥1 row belonging to that US. Auto behavior without UI has explicit no-UI reason and does not need a selector. Non-auto scenarios may also reference rows.

Contract is written before UI code in design, used by TDD and UIUX. When ui_contract is required, absence is an error even if code already exists. New pipeline design/UIUX sets required when producing the design output. Optional allows non-UI or early-intake bundles to omit it. `legacy-absent` requires migrated_from + validated migration report, no ui-contract document, and exact missing-screen list matching all declared screen ids. It emits exactly one counted `W-UI-CONTRACT-LEGACY` warning per spec, including zero screens. Creating the real contract clears this state to required/optional and removes the warning; no invented selectors. G4 for new UI scope cannot pass using legacy-absent.

Extended design-enabled rows use the 12-column header and additional all-or-none fields in [design model §4](design-model.md#4-behavioral-ui-contract-extension). Existing six-column contracts remain structurally valid outside enabled-design checkpoints; no legacy selector is invented. New screen-inventory and change-set documents require the body sections in their owning models; change-set body has `## Change and impact`, `## Propagation and re-gates`, `## Approval and receivers`, linking its data payload without authoring a duplicate record.

### `glossary` (F4)

Schema for a normalized entry: [glossary.schema.json](schema/glossary.schema.json). Required `## Terms` table `Term | Anchor | Definition | Source` and `## Ban list` table `Banned | Replacement | Reason`. Tables may be empty in a just-created or migrated legacy glossary, with a sentence stating no terms/ban-list were declared in the source. Do not guess a project glossary from capitalized words. Existing sources are retained; newly chosen terms need PO/source grounding.

Term entry: nonempty term, unique slug anchor, nonempty definition, nonempty source (local link/heading, decision id, or cited original source). Reader creates explicit anchor at the term row; links to it resolve like headings. Term spelling is unique under NFC+case-fold. Ban entry: nonempty banned phrase, replacement, reason; unique banned phrase under matching normalization. Optional locale/source_key/retained_terms/exceptions follow the exact [extended glossary table grammar](glossary-grammar.md) and schema; P2/P3/P6 share its fixed headers, strict JSON cells, escaping, locale inheritance and source joins. Locale-qualified entries are unique per locale; unqualified entries apply to the manifest default. A concept has one preferred spelling per locale. Sources that are local paths/ids must resolve; external citations are displayed without fetching. Aliases are explicit separate term rows pointing at the preferred term, never substring matches.

Manifest context may supplement or replace the glossary document. CONTEXT.md is a root note with entries `- **Term**: definition. _Source_: source. _Avoid_: phrase -> replacement; phrase -> replacement.` `_Avoid_` applies only to that entry, requires nonempty replacement for every phrase; split on semicolon, not comma. Duplicate preferred terms/anchors or conflicting replacements across sources are errors. A context-only entry uses the heading slug of the term as its anchor. Generated role views expand the glossary, never display the ban-list as user instructions.

### Other types

Overview/note/intake/build/review/decisions without ledger are GFM free text with the common front matter/body/link rules. Intake retains source, sender email, time, duplicate search, nature (`roadmap`, `ad_hoc`, `feedback`, `defect`, `technical_constraint`) and handling reason. Review records result `PASS|FAIL|BLOCKED|NEEDS_REVIEW`, artifact revision/build/environment, checks, evidence, findings and limits. These semantic content obligations are rubric/gate checks, not invented front matter fields.

## 7. Images: coded versus wireframe

Any path containing a wireframes/ directory is wireframe. Other local images are coded UI/illustration. Non-wireframe sections show the coded screen. If it is not built, a wireframe requires explicit front matter `{src, role: wireframe, reason: "No coded capture exists because ..."}` unless the entire page declares wireframe: true. The reader prints `Coded screen not built yet, wireframe shown.` plus reason. Declared role must match path. Denied/missing/external/escaped images fail lint, not a placeholder success. Verify checks the rendered rule and has a red proof.

Coded captures use spec-owned assets/screens/ paths; figure captions stay in flow order. Figures use content-column width, lazy load and pointer/keyboard zoom; On this page remains separate. Evidence reports record screen/state, build/revision, viewport, environment and capture time. An image alone proves no interaction or production readiness. Migration preserves assets paths and resolves staged assets before clearing an output it owns; it never edits source or creates replacement images for missing references.

## 8. What lint checks

Every message: `file:line: [CODE] what is wrong`, then `fix: <next action>`. Severity is error unless explicitly WARNING below. Stable v1 codes remain; a code may identify several instances of the stated invariant. Schema error may coexist with a more precise invariant error, but the v1 rejection is exactly one error. No missing input, empty selection, thrown rule or unreadable schema yields success.

| Code | Rule |
|---|---|
| M-MANIFEST | manifest absent, unreadable or invalid JSON/object |
| M-SCHEMA | manifest fields violate schema, including required/type/range/unknown keys |
| M-ARTIFACT-DUP | artifact ids unique |
| M-ARTIFACT-N | effective artifact numbers unique |
| M-ARTIFACT-FOLDER | artifact folders unique |
| M-ARTIFACT-EMPTY | exported artifact folder has a file |
| M-TIER | tier ids unique, type override targets supported type/existing tier |
| M-THEME | theme CSS file exists, is readable and stays local |
| M-THEME-VARS | every shipped default variable remains declared |
| M-FORMAT-V1 | v1 input rejected once; fix names `node tools/migrate/v1-to-v2.mjs <v1-spec> --out <dir>` |
| M-PATH | manifest local resource paths/tests root stay in spec; readable min ≤max |
| M-DATE | manifest date is real |
| M-MIGRATION | legacy-absent has valid migrator provenance/report and exact screen list |
| D-FRONTMATTER-MISSING | starts with YAML front matter |
| D-FRONTMATTER-YAML | supported YAML, no duplicate keys/unsupported constructs |
| D-FRONTMATTER-SCHEMA | parsed common/type fields conform to schema |
| D-FIELD-REQUIRED | type-required nonempty fields supplied |
| D-FIELD-TYPE | type-restricted fields used only on allowed types |
| D-DATE | updated is real date |
| D-ID-DUP | document ids unique case-insensitively |
| D-ID-RESERVED | document id not reserved |
| D-US-ID | story id matches allowed story pattern |
| D-US-FILENAME | filename stem equals exact story id |
| D-TIER | declared tier exists |
| D-PLACEMENT | every document belongs in permitted root/artifact/readable/UX/decisions location |
| D-H1 | no body H1 except contract amendment |
| D-FENCE | all fenced blocks close |
| D-TERMS | declared banned wording absent in readable prose and generated role text |
| D-PERSON | person identity fields use emails/roles, not bare personal names; prose identity reviewed semantically |
| S-PRD-REQ | PRD has REQ table with ID/requirement/source |
| S-REQ-DUP | REQ defined once across PRDs |
| S-REQ-NO-STORY | WARNING: each uncovered REQ counted when stories exist |
| S-US-SECTION | six numbered story sections once/in order with Flow Mermaid and nonempty required content |
| S-US-AC-TABLE | section 4 has an AC table |
| S-US-AC-COLUMNS | header has id, Given/When and Then |
| S-US-AC-ROWS | ≥1 AC row |
| S-US-AC-ROW | complete row, header cell count, nonempty inputs and outcome |
| S-US-AC-DUP | unique local AC ids |
| S-US-SCENARIO | every body SCN/range exists in front matter and includes that AC |
| S-AC-SCENARIO | every AC has ≥1 structured scenario |
| S-SCN-SCHEMA | required scenario fields/types/method/status/test-iff-auto conform |
| S-SCN-DUP | unique scenario ids within US, pair identity preserved across US |
| S-SCN-AC | each scenario ac is nonempty, unique, real local AC |
| S-SCN-STATUS | unassigned/not-built is planned/blocked |
| S-SCN-TEST | auto test file path/name/id exists under tests_root |
| W-SCN-UNASSIGNED | WARNING: one per unassigned US+SCN, total ratchet count |
| S-SCN-DETAIL | explicit body detail association/method/result state agrees with front matter |
| S-US-INDEX | index has exact story set and REQ associations; optional PRD US column agrees (compared once stories exist, or at/after the stage that produces them; earlier stages defer it) |
| S-LEDGER-MANY | ≤1 primary ledger |
| S-LEDGER-EMPTY | primary ledger has ≥1 D row |
| S-DECISION-DUP | D ids unique |
| S-TOPIC-ID | every topic decision exists |
| S-AMENDMENT-HEADING | amendment heading shape/date/source/decision valid |
| S-AMENDMENT-ROWS | amendment has complete unique change rows, affected refs resolve |
| S-AMENDMENT-DUP | amendment ids unique within contract |
| S-CHANGELOG | contract amendments have complete change-log table and real dates |
| S-AMENDMENT-SUMMARY | summary id exists in that contract |
| S-TRACE-REQ | trace.req target exists |
| S-TRACE-US | trace.us target exists |
| S-TRACE-AC | qualified/local trace.ac has an existing owning AC |
| S-TRACE-DECISION | trace.decisions exists in primary ledger |
| S-TRACE-AMENDMENT | trace.amendments exists in primary contract |
| S-BOARD | story/index board points to PNG or HTML board file |
| S-SCREEN | story screens resolve when inventory or ui-contract exists |
| S-PRIMARY | ≤1 primary each for prd/contract; exactly 1 when multiple |
| L-LINK-OUTSIDE | local link stays in bundle after normalization/realpath |
| L-LINK-DEAD | local target exists |
| L-LINK-ANCHOR | same-page fragment resolves to heading/row/glossary anchor |
| L-LINK-FRAGMENT | target-page fragment resolves |
| L-READING-ORDER | reading-order document id exists |
| L-IMG-DECLARED | declared image exists in spec |
| L-IMG-ROLE | coded/wireframe role agrees with path |
| L-IMG-OUTSIDE | image stays local inside bundle (remote image also fails) |
| L-IMG-MISSING | referenced image exists |
| L-IMG-DENIED | image not retired by deny list |
| L-IMG-WIREFRAME | wireframe caption/declaration/reason required on non-wireframe page |
| R-EPIC-MAP | readable present implies readable/epic-map.json; JSON/shape valid |
| R-PLACEMENT | readable documents directly beside epic-map |
| R-READABLE | map fields/status/counts, exact placement/REQ unions, sections/Scope/block/AC/Build detail, hidden review/direct-group rules, no internal prose codes/counts |
| U-CONTRACT-REQUIRED | manifest required mode or enabled design/UIUX at design output and later has ≥1 ui-contract |
| U-CONTRACT-SCHEMA | normalized rows follow row schema/header, nonempty table |
| U-CONTRACT-SCREEN | all declared screens have rows when contract exists, route consistent |
| U-CONTRACT-US | every row US exists and declares the screen |
| U-CONTRACT-SELECTOR | selector complete and unique within legacy screen or extended screen/state/role/scope context |
| U-CONTRACT-SCN | SCN exists in listed US; every UI auto scenario used by row |
| W-UI-CONTRACT-LEGACY | WARNING: exactly one per proven legacy-absent spec, declared screen count |
| G-GLOSSARY | declared glossary/context exists, correct type/location/table/syntax |
| G-ENTRY | term/ban entry follows schema, source/definition/replacement nonempty |
| G-DUP | term/ban unique per locale across selected sources, anchors unique, replacements agree |
| G-TERM-REF | local term source/id/link/anchor resolves |
| O-OPEN-EMPTY | actionable OPEN marker has question text |
| O-OPEN-BLOCKING | actionable OPEN[blocking] present; G3 fails |
| B-FILE | history readable JSON inside bundle |
| B-SCHEMA | history shape/fields/types/patterns valid |
| B-ID | history ids unique |
| B-BEFORE-SHARED | exact before allocated at most once per page |
| B-PAGE | history page exists |
| B-REF | history decision/amendment exists |
| B-AFTER | nonempty after occurs in current page Markdown |
| B-TEXT | before/after strings present, not both empty |
| B-DATE | history dates real |
| E-INPUT | input unreadable, discovery failed or 0 documents selected |
| E-SCHEMA | required schema unavailable/unreadable/invalid |
| E-RULE | unexpected rule exception; include rule name, never swallow |
| E-OPTION | unsupported CLI option, including obsolete --lenient |

S-* structural and D-* checks do not certify business truth. Semantic omissions, unanchored jargon, duplicated business rules, permissions, evidence currency and all gate conditions are additionally reviewed. Required references are bidirectional in reader indexes. No average score offsets a missing mandatory criterion.

### Loop/design validation codes and RED controls

**AM-6 deterministic-input boundary (controller ruling 2026-10-07).** Lint validates every schema and cross-file declaration it can read. Q-SCOPE/HANDOFF-PINS check membership against `records/candidates/<sha256>.json`; a missing candidate file is an error. Q-ROUNDS checks `records/rounds/<gate-id>.json`: counters never exceed limits, cycle numbers are contiguous, a cycle ≥2 carries `continuation_ref` and `authorized_by`; a gate with more evaluation history than its ledger shows is an error (counter reset). DS-AUTHORITY reads design-profile authority entries of kind `ruling` pointing at a [rulings-index](schema/rulings-index.schema.json): two `active` rulings with the same `subject` and `scope` where neither lists the other in `supersedes` is an unresolved contradiction (error); a `non_waivable` ruling may never be superseded by an exception. Q-DECISION: approver list and current baseline are checked only when lint is given `--pipeline <config>`; head and current build are runtime facts checked by the runner. Without `--pipeline`, lint prints those checks as `NOT RUN` and never as passed. An exported gate whose state is accepted must have its packet and recorded independent-review evidence; otherwise error.

All new declarations are fail-closed. `Q-` checks apply to runner records plus lint of exported records, `DS-/U-/M-/D-/X-` to bundle lint, `V-` to reader/evidence verification. Semantic authority/propagation claims require recorded independent review, not a string-matching model substitute. Absent/defaulted/unverified migration design relations are required report entries and reader disclosures, not lint warning classes; accepted migrated proof warnings remain exactly unassigned-method and one legacy-absent UI warning. A new enabled-design or required gate still blocks when acceptance data is missing. Every rule below MUST have a seeded negative self-test; positive controls retain valid legacy rows, numbers, no-UI and disjoint states. Missing schema/reference/input always errors. Rules already listed above retain their codes.

| Code | Rule | RED case |
|---|---|---|
| D-DATA | New doc data pointer resolves and payload/body sections match type | screen-inventory without data, or change-set points at inventory payload |
| M-DESIGN | Enabled-design output declares valid profile/inventory; optional declared files always validate | design enabled with omitted profile |
| M-GATE-MODEL | Declared graph/change/receipt projection resolves and validates | graph path unreadable |
| DS-AUTHORITY | Authority versions/read order/ruling scope resolve; contradictions block dependent scope | older mirror selected despite newer binding ruling |
| DS-TOKENS | Declared owner/source/generated targets agree; authority changes have decisions | token source also appears as generated mirror |
| DS-CATALOG | Component/pattern refs resolve in declared versioned adapter catalogs | project/MissingComponent used in row |
| DS-CAPABILITY | Missing/unverified required capability is not PASS | browser missing with visual receipt PASS |
| DS-INVENTORY | Unique screen/state keys and valid role/scope/route/US/AC/SCN joins | S01/normal duplicated or SCN belongs to another US |
| DS-STATES | Applicable state/role/overlay/flow/consequence coverage or explicit NA/gap | required error state absent without reason/confirmer |
| DS-SOURCE | Every row has explicit source kind/ref; tool locator never inferred | figma source with null ref |
| DS-SIDECAR | Generated sidecar provenance, symbolic refs, freshness/status and locators valid | handwritten generated:false map or unverified entry CURRENT |
| DS-CURATED | Curated prose contains no current Figma locator/count inventory; artifact-aware | live node_id table in curated inventory; positive control numeric AC allowed |
| DS-BOARD | Board HTML/PNG association, role/provenance and deny status agree | wireframe PNG claimed coded proof or mismatched basename |
| U-CONTRACT-DESIGN | Enabled-design rows have all extension fields and inventory-consistent targets | state present without roles/target or row state missing from inventory |
| U-CONTRACT-CONTEXT | Selector uniqueness/SCN use holds per screen/state/role/scope | two same-context rows with same selector; disjoint-state positive control |
| DS-COPY | Locale/source key/ban exceptions/NFC/placeholders resolve in copy authority | VI source key absent or exception has no reason/source |
| Q-DEFINITION | Gate id/version/scope/checks/decider/transitions/settings valid | gate definition has no checks or unsupported transition |
| Q-SCOPE | Scope is exact sorted enumerated version-bound membership; AC qualified | approval includes bare AC-01 or duplicate membership |
| Q-TRANSITION | Backward/recovery/exception/change-set authority and re-gates recorded | backward edit without approved PO decision for changed expected |
| Q-GRAPH | Typed nodes/edges/revisions/provenance and reverse joins valid | edge target missing or reverse index omits causal consumer |
| Q-IMPACT | Closure classifications/paths/consumer completeness proved or BR-14 applied | missing shared consumer edge retains its APPROVED gate |
| Q-PROPAGATION | New behavior reviewed through AC/SCN/UI/evidence before scoped approval | A-09 tag present but old SCN expectation retained |
| Q-RECEIPT | Required exact pins, real exits/counts/inputs/provenance valid | PASS with selected 0 or exit null |
| Q-FRESHNESS | CURRENT only when all applicable pins match and evidence executed | changed build keeps previous screenshot CURRENT |
| Q-REVIEW | Builder/reviewer separation, fresh original-source pass and rubric disposition valid | same builder grades own artifact or mandatory score 1 accepted |
| Q-COVERAGE | Explicit denominator/NA and passed subset backed by all current required SCN | blocked scenario included in passed AC numerator |
| Q-STATE | Orthogonal states/crosswalk cannot promote skipped/role-disabled into quality | NOT_REQUIRED treated as G4 visual approval |
| Q-ROUNDS | Persisted counters/caps/lineage and scoped continuation retained | restart resets review counter after final FAIL |
| Q-EXCEPTION | Scoped current PO exception precedes work and preserves floors | expired prototype exception used to skip contract approval |
| Q-AUDIT | Append-only chain/exact pins/supersession/idempotency preserved | prior failure event overwritten or same event id with changed publication digest |
| Q-PACKET | Packet generation deterministic, exact scope/pins and eligibility disclosed | packet omits unknown impact or force-rendered invalid spec eligible |
| Q-DECISION | Decision digest/scope/pins/authority/overrides/current eligibility validated | old packet approves changed candidate or unknown AC override |
| Q-CHANGESET | Legal state, immutable baseline and receiver switch separate from publication | Published inferred as Acknowledged without receiver receipt |
| Q-HANDOFF-PINS | Head/base/manifest/build/scope/domain pins current at G5 | base moved while old APPROVED accepted |
| Q-CLARIFY | Over `records/clarify/*.json` (AM-4): prior answer reuse (no new open question duplicates an answered one: `duplicate_of` required), bounded rounds, dispositions preserved | binding owner ruling re-asked or deferred question made passed AC |
| Q-EXPECTED | Over `records/expected/*.json` (AM-4): changed expected result/threshold has an approved record with `amendment_ref` and at least one actual `FAIL` in RED history; BLOCKED/NOT_RUN entries are harness history only (AM-8) | test expected weakened to match implementation without decision |
| Q-FAILURE | Unreadable/empty/timeout/harness failure preserves actual failure and recovery | missing tool classified as behavioral TDD RED |
| Q-INTEGRATION | Over `records/integration/*.json` (AM-5): Shared merged dependencies re-anchored and semantic conflicts reviewed | git-clean merge of contradictory amended AC treated accepted |
| Q-FEEDBACK | Over `records/feedback/*.json` (AM-5): Open/ruled/enforced feedback and negative-control lineage explicit | model-harvested proposal auto-promoted to authority |
| V-MATRIX | Final build/viewport/state/role/mode/copy/DS/probe matrix and visual checks complete | 375 capture absent or old probe attached to new build |
| V-READER | Views/packet have working accessible design/evidence navigation and adverse fixtures | retired-source fixture fabricates active link or download control dead |
| X-DESIGN-MIGRATION | Migration copy preserves assets/metadata/generated boundaries and each delta | wireframe selector imported as verified coded control or source asset dropped |

## 9. Commands and generated role views

```text
node tools/lint/lint.mjs <spec> [--json] [--pipeline <config/pipeline.yaml>] [--stage <stage>]
node tools/lint/lint.mjs --self-test
node tools/reader/render.mjs <spec> --out <dir> [--offline] [--artifact] [--force]
node tools/reader/verify.mjs <dir> [--proof <dir>]
node tools/reader/verify.mjs --self-test
node tools/run/run.mjs --project <project-root> [--config <path>] [--result <file>]
node tools/reader/packet.mjs <spec> --project <root> --config <path> --change-set <id> --out <new-dir>
node tools/run/run.mjs --project <root> --config <path> --import-decision <file> --packet-data <file>
node tools/migrate/v1-to-v2.mjs <v1-spec> --out <new-dir>
node tools/evals/run-evals.mjs [--cases <dir>]
```

Exact config registry keys, path bases, version lookup, candidate member/hash manifest, canonical packet-data schema and generator/import behavior are in [runner/reader interchange](packet-interchange.md); [fixture](fixtures/review-packet/README.md) covers positive, stale-pin, unknown-scope and digest RED inputs. These are required future interfaces, not a claim that this phase implemented tools. Node ≥18, offline core, no Python/Bash dependency. Lint success = exit 0 only with >0 documents and zero errors; declared warnings print and count. Exit 1 validation errors, exit 2 unreadable/empty/runtime/schema failure or CLI misuse. Final line `checked N documents (...); E error(s), W warning(s)` plus REQ/US/AC/decision/amendment/image/board/scenario/OPEN counts. JSON emits `{ok, problems:[{file,line,code,severity,message,fix}], stats}`. No --lenient: warning classes are individually defined, never all-check suppression. Self-test plants a defect for every invariant/code (and verifies each warning class appears); prints `RED as expected` for each error negative control, fails if a required rule is not caught.

Render always lints first, refuses errors. --force produces a clearly invalid preview with red banner and never closes a gate. Warnings remain visible in reader/report. --artifact writes `<out>/artifact/` shell, content.json, images/, wireframes/html/; --offline writes `<out>/offline/index.html` with all required runtime assets embedded, no network. Shell updated separately in tools/reader/shell/, versioned by SHELL_VERSION; content.json includes shellMin. Re-render updates indexed content without project-specific shell code. Verify uses headless Chromium over file://, no bound port; dead local links, overflow, invalid Mermaid/images or missing required view fail. No amendments/ledger means skip those generated pages and list them as skipped, never suppress required role/Open/coverage views.

### Role-view input contract (F6)

| View | Authoritative inputs / required output |
|---|---|
| PO | design profile/inventory/source map, visual receipts and change packet/decision state plus build contract/PRD/US + epic-map, derived release/epic pages; release → user-goal epics/capabilities, direct groups, statuses, exclusions, source links |
| Dev | inventory state/roles/scope/flow, DS catalog refs, source links/departures/freshness plus every US, its story/flow/data/rules, trace-linked contract/REQ/decisions/amendments, ui-contract rows, trace.us dependencies, inline OPEN; one per-US panel including no-UI/absent-contract state |
| QA | screen/state/source joins, exact evidence receipt/freshness and batch impact plus every US AC, scenario ac/id/method/test/status and detail/evidence references; per-AC rows including all associations, uncovered/error state; area coverage matrix |
| Open items | extracted actionable US OPEN, source line, blocking state, optional owner/impacted AC; include hidden and merged stories |
| Coverage | story epic/group as area, trace.req, AC set, structured scenarios, current eval references; denominators and unassigned/blocked/not-built/stale counts |

Views are generated reader output, never hand-authored front matter types or new business authority. Even hidden/merged stories stay in Dev/QA/coverage. Metadata IDs remain visible as badges/links while explanatory sentences obey writing rules. Referenced rule text is expanded from its owning source (do not ask Dev to read an opaque rule id). Missing dependency/UI/evidence displays explicit absence, not fabricated prose. Stable keys `<lowercase-us-id>`, `<US-id>.AC-n`, `<US-id>.SCN-x-n`; search indexes current content only.

Coverage grouping uses the exact story epic string; extract leading E<n>/BRD-n as group id when present, otherwise whole string. For each area: US, REQ, AC, AC with ≥1 scenario, reviewed-method assignment, AC with every required scenario passing on CURRENT evidence, and method/status breakdown. Numerator counts AC, not scenarios; one failing/blocked/stale/planned/unassigned/not-built association prevents that AC being passed. A declared passing without current evidence is `unverified`, not green. No-UI AC remains in scenario denominator. Exclusion requires recorded PO reason/confirmer, is visible alongside totals, and is a gate decision rather than deleting rows. G3 target scenario coverage 100% plus reviewed method assignment; G4 target UI demo-scope verification 100%; G5 required-reference completeness 100%.

### Pipeline/config/gate interface (F7)

Full shape and default contexts are owned by SPEC.md section 5. Pipeline-aware lint defaults to final-bundle validation; `--stage` names the output checkpoint being checked. Before design, the pipeline-derived ui-contract presence requirement is deferred so intake can render before selectors exist. It becomes mandatory at design output and every later checkpoint; an explicit manifest ui_contract required is never deferred. All present-document/schema/reference/scenario checks always run. Unknown stage fails E-OPTION. Default traversal (not transition legality) `intake, clarify, contract, prd, us, design, tdd, uiux, handoff`. Each stage enabled boolean, exactly one owner po/qc/dev, explicit context list, evals.<stage> commands. Stage enabled is independent of role enabled. UIUX requires design+tdd enabled and nonempty design_system before any stage starts. Runner uses only declared context and listed outputs, never the writer's private chat for review.

Stage gate `review/gates/<stage>.md` FIRST LINE exactly `GATE: PENDING|APPROVED|CHANGES_REQUESTED|NOT_REQUIRED`. Remaining machine block `gate-data` is JSON: stage, input SHA-256 map, output SHA-256 map, normalized effective stage config SHA-256, context list, eval results/exits, review verdict or disabled, rubric scores/findings, approver email when approved, approval time, workflow/template/ruleset versions, retained change requests and invalidation reason. Hash raw bytes; expand directories/globs to sorted POSIX paths, include path additions/deletions and output changes, do not hash the gate file itself. Output decision-ledger files that also serve as inputs are hashed after the stage's final write, preventing immediate self-invalidation.

PENDING stops unchanged with runner exit 2. APPROVED/NOT_REQUIRED continue only with current hashes/checks. CHANGES_REQUESTED reruns with retained request. Invalid line/data/config exit 3; missing/unrunnable tool/agent exit 4; all enabled stages settled exit 0. Invalidation walks typed causal dependencies and reopens affected scoped gates; incomplete closure falls back to BR-14 (changed stage and all later gates, or intake if unknown). Semantic propagation and current pins are required to preserve independent approvals. Newly invalidated gates trigger recomputation; unchanged PENDING waits for humans. Legal repair/re-entry, persisted caps, batch decisions and post-handoff changes follow gate model. New configuration applies to stages not yet gated; it never clears a previously pending gate silently. Config change invalidates checks when relevant contract/context/eval/rubric changes, not because an unrelated role toggled.

G1 maps to intake (classification); G2 to contract (problem/direction/scope); G3 to us + tdd (requirements, reviewed scenarios and test plan); G4 to uiux (concept and evidence, or PO-confirmed no-UI reason); G5 to handoff (pinned bundle). Intermediate clarify/prd/design gates use their owner. TDD at G3 may have planned tests whose first valid failure is missing implementation; G4 requires passing tests on the built candidate. Role-disabled NOT_REQUIRED bypasses a human stop, never a deterministic check or Critical/Major/mandatory-score blocker. Reviewer rubric, VERDICT mapping and finding dispositions are in SPEC.md section 7.

## 10. Versioning, history and changes from v1

Format "2" is a breaking change. Any future change invalidating an existing valid v2 spec requires a new format and deterministic migration. New optional fields/types that keep prior validity are additive. Preserve shell/content compatibility version separately. Retired IDs remain history and are not reused.

### Block-level wording history

Optional changes.blocks names a local JSON following [block-history.schema.json](schema/block-history.schema.json): `{version: 1, entries: [...]}`. Each entry requires id (`^[a-z][a-z0-9-]*$`), page (lowercase page id, includes `_` when page id has it), real ISO date, kind row/paragraph/list, exact Markdown before and after, nonempty unique refs of D<n>/A-n, source text, full 40-lowercase-hex previous_commit. Optional source_after retains current source before migration rewrote link targets; next identifies current block after a removed block; occurrence integer ≥0 selects identical rendered current blocks. Unknown keys are errors.

History derives from the commit immediately before a wording change; producer proves provenance/reviewed exclusions and never republishes excluded process/demo content. Current Markdown stays clean/searchable, before never enters current search. In the recent window, decorate matching detail block with chip and muted struck-through before. Empty before = new, empty after = removed, not both empty. Exact before belongs to at most one record per page (B-BEFORE-SHARED); prefer best same-section match, tie by document order. At most one previous-wording label per current block; omit chip references already linked in current text. Nonempty after occurs in page Markdown, every page/ref resolves. Dates beyond newest updated are not recent. Migrator retains before bytes and rewrites current after/source_after only when links change, reporting that rewrite.

### Mechanical v1 → v2 changes (F8)

| Source | Transformation / refusal |
|---|---|
| manifest format "1" | set "2"; copy all retained fields, artifact/tier order and explicit readable limits; add tests_root "tests" if no declared source test-root mapping. Do not discover tests outside copied bundle |
| no glossary pointer | create root glossary.md with valid front matter, Terms/Ban list tables and explicit absence note; retain known term sources if supplied, no inferred definitions/bans. Add glossary.document. Imported glossary/CONTEXT fields go through their declared normalization |
| no ui-contract | set ui_contract legacy-absent, migrated_from v1, migration_report path; inventory every story/inventory screen. One counted legacy warning. Never guess role/name/test ids or routes |
| string scenarios | replace each id with object; ac derives only from explicit AC Scenario column/detail-table mappings, method unassigned, status planned, test omitted. Preserve reused ids per owning US; expand ranges deterministically |
| uncovered AC | add deterministic SCN association with next unused suffix for this owning US (NF uses SCN-NF<digits>-<n>, US-P uses SCN-P<digits>-<n>); ac [that AC], unassigned/planned. Report added ids and source AC. No expected result beyond existing AC invented |
| scenario with no explicit AC mapping | refuse a successful migration for that ambiguous association, list it and candidate references. Do not map every SCN to every AC. Produce reviewable output/report, nonzero until mapping supplied from source/owner |
| structured field imported from unrelated source | preserve only values conforming to v2 and source-backed; unknown field listed individually, never silently dropped |
| root/placement/type metadata | preserve v1 layout/ids/body. Any new reserved-id collision is renamed deterministically `<old-id>-source` then `-2`, etc., all references rewritten/report recorded. Legacy contract-only metadata moved to body metadata with counts and exact values retained |
| links/images/boards | preserve local paths/assets/HTML and missing refs at mapped destinations; report missing images without replacement. Amendment summary falls back to exact source heading, never a guessed editorial title |
| AC/REQ/US/decisions, readable map and amendments | preserve every id, row, gap, merged/hidden/direct-group relation and wording. Counts in=out per type except explicitly listed added glossary document/SCN associations or explain each difference |
| lint warnings/flags | v2 exit 0 with no errors and declared warnings counted. --lenient rejected; no global exemption. Legacy UI warning + unassigned-method warnings are visible debt, not approval |
| block history | preserve provenance, before text, refs and current-block allocation; report each link rewrite; page id with underscore allowed without breaking document id support |

Migration command never edits input, refuses an existing nonempty output directory, processes sorted relative paths, uses source dates (no machine-clock mutations in spec), writes stable JSON/text and a report (counts/defaults/drops/ambiguous mappings/absent screens). Same source + same declared mappings gives byte-identical output. Validate v1 source without weakening gates, write copy, lint v2; output lint failures remain failures and are reported. The migration report is JSON so it does not become a reader document by accident. A hand-written v2 bundle cannot claim legacy-absent. The old baseline remains immutable until the PO reviews migration and approves a new handoff.

### Additional migration deltas for design and loops

Preserve all P1 migration rules and warning ratchets. Apply [design model §7](design-model.md#7-reader-projections-and-migration): real UX/assets/boards/copy retained, explicit relation conversion only, each absent/defaulted state/role/scope/DS/source/selector/evidence reported. Do not assume a missing state is normal. Source kind not-created may be an explicit unverified migration default with reason. Generated locators move to provenance-stamped sidecar while frozen source citations survive in immutable input evidence. These design debts are migration-report entries disclosed by the reader, never additional lint warnings; A6.2 still permits only method-unassigned and one legacy-absent UI warning. Historical gates/receipts cannot become current scoped approvals; regenerate against current pins and preserve audit history. Report absent graph/impact/propagation mappings; BR-14 fallback until completeness proven. Never edit source, mint fake passing receipts, reset caps or renumber retired IDs.

### Exact gate-data fields (F7)

Section 9's gate file contains exactly one fenced `gate-data` block whose contents are a JSON object. The first-line gate value is authoritative; no duplicate status inside JSON. Unknown keys, duplicate JSON keys, wrong types, or missing required fields are runner configuration errors (exit 3). This record is a runner interface, not a spec document or a second agent lifecycle.

| Required key | Parsed value / invariant |
|---|---|
| `stage` | one of the nine stage names, identical to the gate filename stem |
| `context` | sorted unique project-relative POSIX file paths actually supplied, after directory/glob expansion; source templates, rules, rubric and prompt files used are included |
| `inputs`, `outputs` | objects mapping project-relative file path to 64 lowercase-hex SHA-256 of raw bytes. `inputs` keys equal context. `outputs` lists every artifact created/changed by this stage, including pre-existing files it edits; neither map/context includes this stage's own gate file. Earlier gate files are valid handoff inputs. Existing maps are compared to a newly resolved inventory to detect additions/deletions |
| `config_sha256` | SHA-256 of UTF-8 canonical JSON for the effective stage settings, recursively sorted object keys, array order preserved, no whitespace. Include stage enabled/owner/context/evals, writer/reviewer commands, review/rubric/limits and workflow/template/ruleset versions. Human role enabled/gate flags are recorded separately so toggling one cannot silently clear PENDING |
| `role` | `{owner: po\|qc\|dev, enabled: boolean, gate: boolean}` as resolved when this record was written |
| `evals` | array of `{command: nonempty string, exit_code: integer, report: project-relative path or null}`. Record every executed command, including each per-file expansion; no fabricated zero for NOT RUN |
| `review` | `{enabled: boolean, independent: boolean, verdict: PASS\|NEEDS_CHANGES\|FAIL\|BLOCKED\|NOT_RUN\|null, criteria: [...], findings: [...], report: path or null}` per [gate-review schema](schema/gate-review.schema.json). Enabled review persists the computed verdict, including NOT_RUN for all-NA/empty applicable selection; NOT_RUN is never eligible/passing. Disabled review uses false/false/null and empty arrays; it cannot establish G3/G4/G5 acceptance |
| `versions` | `{workflow: nonempty string, templates: nonempty string, ruleset: nonempty string}`; explicit local revision labels or content hashes, never absent/defaulted silently |
| `change_requests` | ordered array of `{text: nonempty string, by: email, at: ISO-8601 UTC date-time}`; preserved when rerunning CHANGES_REQUESTED |
| `invalidation` | null while current, else `{reason: nonempty string, changed: [project-relative paths or config keys], at: ISO-8601 UTC date-time}`; changed is nonempty |

Review criteria use [model-common criterion](schema/model-common.schema.json): `{id, mandatory, applicability?, score, evidence, reason?, confirmer?}`. Omitted applicability normalizes to applicable; applicable score is integer 0/1/2 with no NA reason/confirmer. Explicit na requires score null plus nonempty reason and authority confirmer, remains visible, and contributes zero passed numerator. VERDICT examines only applicable scores: any 0 FAIL; else any 1 or open/accepted-minor finding NEEDS_CHANGES; else nonempty all 2 PASS. Empty/all-NA applicable selection yields NOT_RUN, never PASS. Fixed/rejected findings remain history. All applicable mandatory criteria must still be 2 for eligibility. Findings are `{id, criterion, severity, file, line, impact, fix, owner, disposition, reason}`: unique nonempty id, existing criterion id, Critical/Major/Minor, local file, positive integer line, nonempty impact/fix, owner email or role, and disposition `open|fixed|rejected|accepted-minor`. Reason is nonempty for any settled disposition. `accepted-minor` additionally has `accepted_by` PO email and nonempty `follow_up`; only Minor permits it. Rejected findings require source-backed evidence in reason; they are not silently downgraded. Gate eligibility reuses SPEC section 7's mandatory-score and unresolved-finding rules, never merely the VERDICT string.

`model` is required in newly written runner gate-data and follows [gate-state.schema.json](schema/gate-state.schema.json), as defined in gate model §2. Historical P1 records without model remain readable but need regeneration before scoped acceptance. No other additional gate-data keys are permitted.

Only an APPROVED record additionally requires `approval: {by: email, at: ISO-8601 UTC date-time}`; approval is absent for all other states. UTC date-time is a real calendar timestamp ending `Z`. Timestamps record actual workflow events and are excluded from content/config hashes. They do not change migration's deterministic source documents. Gate paths and record-local paths stay inside the project realpath boundary. A malformed/hash-incomplete record cannot be treated as approval.

A reference in a typed payload MUST be a string value at a classified location. Registry bindings MUST mechanically prove an effective string value type (null denotes absence), or expand an object/array structure to independently classified string leaves; empty structures, non-string leaves and string/non-string unions fail even through aliases or composition. Non-string scalar or object/array-container locations whose own description or pattern declares a reference are forbidden; shared object aliases expand classified leaves rather than encode a container reference. Reference-bearing patternProperties keys are forbidden. Reference-bearing propertyNames MUST bind exactly one registry entry; unbound declared id/path key grammars are forbidden. Every effective open key namespace (additionalProperties not false, or patternProperties present) MUST have that explicit key binding or x-spec-ref:false on its container with a checked exclusion category. Closing additional or unevaluated properties does not close pattern-defined keys. Source classifications and registry bindings MUST agree in both directions; a non-reference source declaration cannot bind a registry entry. See [reference registry grammar](reference-registry-grammar.md). Schema coverage is fail-closed over an explicit proof vocabulary. Unsupported schema keywords fail with their keyword and schema pointer. Existing conditional, negation and contains refinements are admitted only with unchanged assertions at their retained locations; they cannot certify registered reference types. New or changed structural semantics require an explicit proof before acceptance. Schema resource ids ($id) are allowed only at document roots; nested $id, $anchor and $dynamicAnchor are unsupported. Every $ref MUST resolve against the document root $id to a known local schema document and an existing JSON pointer; unresolved or unknown external references fail closed.

## Machine grammar declarations

These declarations own extraction locations. Every location, including non-reference fields, requires a separate census classification. Prose and schema payload constraints above retain authority.

```spec-grammar
[{"doc_type":"us","location":{"kind":"body-table","heading":"^## 4\\.","column":"ID|AC","pattern":"^AC-\\d+$"}},{"doc_type":"us","location":{"kind":"body-table","heading":"^## 4\\.","column":"Scenario|Scenarios","pattern":"SCN-[A-Z0-9]+-\\d+(?:\\.\\.\\d+)?"}},{"doc_type":"us|review|build","location":{"kind":"body-table","heading":"*","column":"Scenario","pattern":"SCN-[A-Z0-9]+-\\d+"}},{"doc_type":"us|review|build","location":{"kind":"body-table","heading":"*","column":"AC","pattern":"(?:[A-Za-z0-9_-]+\\.)?AC-\\d+"}},{"doc_type":"prd","location":{"kind":"body-table","heading":"*","column":"ID","pattern":"^REQ-\\d+$"}},{"doc_type":"prd","location":{"kind":"body-table","heading":"*","column":"US|Stories","pattern":"(?:US-(?:\\d+|P\\d+)|NF-\\d+)"}},{"doc_type":"prd","location":{"kind":"body-table","heading":"*","column":"Source","pattern":".+"}},{"doc_type":"us-index","location":{"kind":"body-table","heading":"*","column":"File","pattern":"[^\\s]+\\.md(?:#[^\\s]+)?"}},{"doc_type":"us-index","location":{"kind":"body-table","heading":"*","column":"REQ","pattern":"REQ-\\d+"}},{"doc_type":"contract","location":{"kind":"body-table","heading":"^#{1,2} (?:Amendment )?A-\\d+","column":"\\#","pattern":"^A\\d+-\\d+$"}},{"doc_type":"contract","location":{"kind":"body-table","heading":"^#{1,2} (?:Amendment )?A-\\d+","column":"Affected ids","pattern":".+"}},{"doc_type":"contract","location":{"kind":"body-table","heading":"^#{1,2} (?:Amendment )?A-\\d+","column":"Source","pattern":".+"}},{"doc_type":"contract","location":{"kind":"body-table","heading":"^## (?:\\d+\\. )?Change log","column":"Approved|Decision","pattern":".+"}},{"doc_type":"decisions","location":{"kind":"body-table","heading":"*","column":"Id","pattern":"^D\\d+$"}},{"doc_type":"decisions","location":{"kind":"body-table","heading":"*","column":"Detail|Source|Affected ids","pattern":".+"}},{"doc_type":"ux","location":{"kind":"body-table","heading":"*","column":"Screen|ID","pattern":"^S\\d{2}(?:-[a-z])?$"}},{"doc_type":"contract","location":{"kind":"body-heading","pattern":"^#{1,2} (?:Amendment )?(A-\\d+) \\((\\d{4}-\\d{2}-\\d{2}), ([^,]+), (D\\d+)\\) — (.+)$","capture":"1"}},{"doc_type":"contract","location":{"kind":"body-heading","pattern":"^#{1,2} (?:Amendment )?(A-\\d+) \\((\\d{4}-\\d{2}-\\d{2}), ([^,]+), (D\\d+)\\) — (.+)$","capture":"4"}},{"doc_type":"*","location":{"kind":"body-heading","pattern":"\\[[^\\]\\n]+\\]\\(([^)]+\\.md(?:#[^)]*)?)\\)"}},{"doc_type":"*","location":{"kind":"body-heading","pattern":"!\\[[^\\]\\n]*\\]\\(([^)]+)\\)"}},{"doc_type":"*","location":{"kind":"body-heading","pattern":"\\[[^\\]\\n]*\\]\\(([^)]+\\.html(?:#[^)]*)?)\\)"}},{"doc_type":"*","location":{"kind":"body-heading","pattern":"(?:US-(?:\\d+|P\\d+)|NF-\\d+|REQ-\\d+|D\\d+|(?:[A-Za-z0-9_-]+\\.)?A-\\d+|(?:[A-Za-z0-9_-]+\\.)?AC-\\d+|BR-\\d+)"}},{"doc_type":"note","location":{"kind":"body-heading","pattern":"_Source_:\\s*(.+)"}},{"doc_type":"epic-map","location":{"kind":"json","path":"epics[*].id"}},{"doc_type":"epic-map","location":{"kind":"json","path":"epics[*].slug"}},{"doc_type":"epic-map","location":{"kind":"json","path":"epics[*].page"}},{"doc_type":"epic-map","location":{"kind":"json","path":"epics[*].capabilities[*].id"}},{"doc_type":"epic-map","location":{"kind":"json","path":"epics[*].capabilities[*].us[*]"}},{"doc_type":"epic-map","location":{"kind":"json","path":"epics[*].capabilities[*].merged[*].us"}},{"doc_type":"epic-map","location":{"kind":"json","path":"epics[*].capabilities[*].req[*]"}},{"doc_type":"epic-map","location":{"kind":"json","path":"hidden[*].us"}},{"doc_type":"epic-map","location":{"kind":"json","path":"hidden[*].decision"}},{"doc_type":"epic-map","location":{"kind":"json","path":"source"}},{"doc_type":"gate-data","location":{"kind":"json","path":"context[*]"}},{"doc_type":"gate-data","location":{"kind":"json","path":"inputs{key}"}},{"doc_type":"gate-data","location":{"kind":"json","path":"outputs{key}"}},{"doc_type":"gate-data","location":{"kind":"json","path":"evals[*].report"}},{"doc_type":"gate-data","location":{"kind":"json","path":"review.report"}},{"doc_type":"gate-data","location":{"kind":"json","path":"invalidation.changed[*]"}},{"doc_type":"contract","location":{"kind":"body-heading","pattern":"^#{1,2} (?:Amendment )?(A-\\d+) \\((\\d{4}-\\d{2}-\\d{2}), ([^,]+), (D\\d+)\\) — (.+)$","capture":"2"}},{"doc_type":"contract","location":{"kind":"body-heading","pattern":"^#{1,2} (?:Amendment )?(A-\\d+) \\((\\d{4}-\\d{2}-\\d{2}), ([^,]+), (D\\d+)\\) — (.+)$","capture":"3"}},{"doc_type":"contract","location":{"kind":"body-heading","pattern":"^#{1,2} (?:Amendment )?(A-\\d+) \\((\\d{4}-\\d{2}-\\d{2}), ([^,]+), (D\\d+)\\) — (.+)$","capture":"5"}}]
```

## 11. ID crosswalk payload (D13)

The typed JSON payload **crosswalk** follows [id-crosswalk.schema.json](schema/id-crosswalk.schema.json). An exported migration writes `provenance/id-crosswalk.json`; this is a sidecar, not a new Markdown front-matter type. Producers and consumers MUST discover that exact optional path and validate it when present. A source ledger naming a crosswalk makes it required. No manifest or pre-existing schema is extended by this amendment. The crosswalk cannot authorize missing scenario metadata, fabricated requirements, missing evidence or approval. Outside the crosswalk, detect legacy tokens case-insensitively (including normalized heading slugs), with boundaries at start/end or a character other than a Unicode letter/number. Underscore, dash, dot and path punctuation delimit the token; suffixes and prefixes using them cannot hide a legacy id. The original source snapshot exemption below remains explicit.

Each row contains a stable `id` (`CW-<digits>`), `legacy_id`, closed `family`, `canonical_kind`, `canonical_id`, positive-line `source` (`file`, `line`) and closed `assignment_rule`. `owner` is required for scenario/AC assignment and forbidden otherwise. Source locators resolve in an immutable, locally retained migration-input snapshot, with the local path/realpath boundary in §1. The original id spelling exists ONLY in `legacy_id` in this crosswalk. Typed spec bodies, record fields, keys, anchors, filenames, heading slugs and rendered typed associations MUST use canonical ids; raw retained input snapshots are source evidence, not exported typed spec bodies. Unknown families fail closed, preserve the input snapshot and report an unresolved mapping; they do not get a guessed canonical id or permissive core pattern.

Assignment consumes the complete frozen input inventory and the complete occupied/retired canonical-id inventory. Preserve existing canonical ids and meaning. Never renumber to close gaps. Rows sort by the family order below, then the numeric tuple captured from the legacy spelling, then UTF-8 byte order of source path and positive source line. Allocation is one batch against that frozen baseline; append migrations retain existing crosswalk rows as reserved allocations and allocate only new rows. Input traversal order and reruns cannot change assignments. Scenario suffix selection examines every occupied/retired scenario label in its owner, including alternate labels, rather than only the generated prefix. Resolved scenario labels and aliases already used anywhere in the spec remain taken globally; skip a candidate whose bare label is occupied under another owner. Accept fully qualified canonical or graph-namespaced occupied ids; an unqualified, malformed or unresolved scenario alias is ambiguous and blocks allocation instead of being ignored. Missing ownership, conflicting owner associations, duplicate row/legacy/fully-qualified canonical ids, an incomplete reserved-id inventory or namespace exhaustion blocks export.

Validate every explicitly `scenario:`-namespaced reservation against the strict v2 scenario grammar before removing any namespace. Unicode dash substitution, changed case, unknown labels and extra suffix text are refusals, never normalization repairs. Each occupied scenario's qualified owner must resolve to a declared story in the same complete frozen string inventory: a `us:US-n`, `us:US-Pn` or `us:NF-n` graph-node identity (an equivalent bare US/NF node identity is permitted). A source row's owner assertion does not declare an existing spec owner. Failure to resolve produces `X-CROSSWALK unresolved scenario owner`; a malformed reservation produces `X-CROSSWALK ambiguous occupied scenario`. An explicit non-scenario namespace does not reserve a scenario label even when its artifact name contains one. The semantic oracle MUST validate reservations independently of the allocator's parser; reusing a fail-open allocation result cannot certify the input census.

| Family | Recognized spelling | Canonical destination | Assignment rule |
|---|---|---|---|
| scn-pub | `SCN-PUB-xx-yy`, exactly two digits per segment | owning `US-n.SCN-n-k` (or the corresponding P/NF owner token) | `scenario-next`: next numeric suffix above all occupied/retired scenarios in that owner |
| scr-pub | `SCR-PUB-xx`, exactly two digits | `Snn` | `screen-next`: next unoccupied screen number above all occupied/retired screen numbers; fail above 99 |
| email | `EMAIL-nn`, exactly two digits | owning `US-n.AC-k` / `NF-n.AC-k` | `ac-next`: next numeric suffix above all occupied/retired AC in that owner |
| ctrl | `CTRL-nn`, exactly two digits | owning qualified AC | `ac-next`: shares the AC namespace with email and existing AC; never allocates a separate alias namespace |
| pd-feedback | `PD-n`, one or more digits | `FB-nn` feedback-record identity | `feedback-next`: next numeric suffix above all occupied/retired feedback ids |

New numeric suffixes have at least two digits; the existing §4 patterns remain strict and unchanged. Source-backed ownership must be declared by the migration inventory; proximity, a screen number or a legacy scenario segment cannot infer a story owner. Crosswalking email/control labels assigns identity only: the normalized AC must still satisfy GWT and reviewed behavior contracts. Crosswalking feedback supplies no missing sender, timestamp, ruling or negative-control facts.

Registry semantics: the canonical destination is a **non-causal `mentions` provenance edge**, canonical target → crosswalk row artifact. It projects an already-declared identity; a historical alias neither defines current behavior nor makes the canonical item depend on its provenance sidecar. The row key declares a local artifact identity; owner is non-causal context; source file is non-causal provenance, source snapshot artifact → crosswalk row artifact. Legacy spelling is a checked **`legacy-id` non-reference literal**, confined to this one schema leaf with a pinned exact closed-family grammar. It never resolves a target or emits an edge. Family/rule/kind are enum literals; line is numeric. [Registry grammar](reference-registry-grammar.md) owns the extraction bindings.

## 12. Source ledger payload (D14)

The typed JSON payload **source-ledger** follows [source-ledger.schema.json](schema/source-ledger.schema.json). Export `provenance/source-ledger.json`; discover and validate this optional fixed sidecar without introducing a Markdown type. Its required `crosswalk` path resolves relative to the ledger file, inside the bundle. An empty source inventory cannot produce a passing ledger. Keep raw input snapshots separately and retain their original bytes.

Each source item has its own immutable scoped `id`, source `file:line`, `text_sha256`, closed mapping `status`, typed `mappings` and a nonempty `reason` for every non-exact status. A known legacy-id item uses its immutable crosswalk row key as its ledger key and supplies `crosswalk_row` equal to that key (controller ruling C9, D13/D14 join). The original spelling remains in the crosswalk; the ledger VIEW MUST display it by joining that row, alongside the stable key. An unresolved join is an error, not a renamed or dropped item. Non-legacy source ids retain their original spelling in their separate source-item namespace; they do not declare typed AC/US identities.

`normalization` is exactly `nfc-lf-trim-trailing-v1`: take the exact extracted source-item text (exclude its id/table framing), normalize Unicode NFC, CRLF and CR to LF, strip ASCII spaces/tabs at the end of each line and remove terminal LF characters. Preserve leading indentation, internal whitespace, punctuation, language and case. Hash its UTF-8 bytes with SHA-256, lowercase hex. Original source bytes and raw snapshot hash remain separately pinned; this normalized text digest cannot prove raw-byte equality. Missing text, wrong extraction boundaries or changed digest blocks preservation; an empty source-item text is invalid. Every source-inventory identity must join exactly one ledger item, and every ledger item must join the inventory; duplicate/omitted items fail.

| Status | Required mapping semantics |
|---|---|
| exact | one or more existing typed items represent the whole source obligation; identity/string similarity alone is insufficient |
| partial | one or more typed items represent only a stated portion; reason names the residual gap |
| conflicting | one or more typed items contradict the source; reason names the conflict and unresolved authority |
| no-demo | zero typed/demo mappings; reason states why the source has no corresponding implementation |

Mappings are unique `{kind, id}` pairs covering all declared dependency-graph node kinds. The id is its fully namespaced canonical graph identity, and its namespace must equal kind. Resolve it against the independently validated typed inventory; bare aliases, unknown nodes and a mismatched namespace fail. Each underlying typed item retains its strict owning schema/id grammar. A screen-only node cannot establish required state coverage; a declared screen-state tuple must resolve exactly. Every target must resolve in the typed inventory; mapping one source item to many typed items is allowed and never creates duplicate source items. Mapping status is an authored, reviewed claim, not inferred from a digest or an allocation. An exact mapping does not imply implemented/passing behavior.

The summary has three distinct objects and no aggregate/shared passed numerator: `source_preservation: {total, preserved}`, `typed_coverage: {total, mapped}` and `demo_coverage: {total, passed}`. Source total = unique items in the pinned input inventory; preserved = identities whose exact normalized text digest and source join match (regardless of mapping status). Typed total = unique items in the independently declared typed inventory; mapped = distinct resolved typed targets across ledger mappings, including disclosed partial/conflicting mappings, never a pass count. Demo total = the explicitly selected demo coverage inventory; passed = its distinct items with eligible current evidence under gate-model §5, not source items or mapping rows. A partial selection discloses its selected and complete totals under that contract. Empty demo/typed selections stay zero and disclosed, never 100% passing.

A headline such as 116/116 preserved says nothing about typed coverage or demonstrated behavior. Equal numeric values do not make these measures interchangeable. Any view, report or serialized summary merging them is a defect. Recompute the three measures against their own pinned inventories/evidence; omission, duplicate targets, wrong digest, unresolved join, transferred numerator or fabricated denominator fails. Keep each item's status/reason visible in PO, Dev, QA and source-ledger projections.

Registry semantics: the source-item key declares a local ledger artifact identity; source snapshot artifact → ledger item artifact is causal `uses` because its text/digest is an input to preservation. Typed target → ledger item artifact is causal `uses` because the mapping claim must be reevaluated when that target changes; this never reverses into source text depending on an implementation. Crosswalk file/row → ledger item artifact is causal `uses` for identity resolution. Mapping kind/status/normalization/reason/digest are checked literals, not target namespaces. Registry paths are independently classified in the grammar and endpoint/direction contracts. [Executable format oracle](source-provenance-contract.cjs) and [fixtures](fixtures/source-provenance/README.md) distinguish schema shape from the required inventory/digest/uniqueness checks; they do not claim downstream runtime implementation.

## 13. Reader skin (D15)

The reader v2 default is the Public Docs reader skin, with product name PRODUCT:OS Spec Driven. [Reader skin contract](reader-skin-contract.md) owns the presentation adapter boundary and invariants: stable ids/routes, identical SPEC_DATA, pinned source hashes, native search/keyboard/role views, offline assets, accessible overlays and visible missing/stale/denied evidence. Reader implementation and independent runtime acceptance remain separate delivery gates.

# Copy-only migration

Run from the repository root:

```sh
node tools/migrate/v1-to-v2.mjs <v1-spec> --out <new-dir>
node --test tools/migrate/test/
node tools/migrate/verify-output.mjs <v1-spec> <migrated-dir>
```

Exit 0 means no migration blockers and a zero-error v2 lint result. Exit 1 leaves
reviewable output with unresolved joins or source lint defects. Exit 2 refuses an
unsafe input/output boundary, malformed input, or invalid CLI/owner mapping.
The tool refuses nonempty output and overlapping trees. A blocked tree requires a
new output directory on rerun. It supplies no publication or owner acceptance.

`migration-report.json` owns the count reconciliation, source hash, defaults,
renames, missing relations, missing external evidence, and lint results. The
Markdown companion is a reader note. Original bytes are retained under
`provenance/input-snapshot/`; text files have `.txt` and binary files `.bin`,
preventing the source snapshots from becoming additional typed reader documents
or visible board assets. The path map records every original and snapshot path.
Local assets and HTML are copied unchanged. Legacy identities in immutable assets
are inventoried and block successful export until the source supplies a canonical
asset; they are never rewritten in place. Text-only flows remain text-only.
The source baseline stays untouched.

Known scenario associations come only from explicit AC/detail rows. Uncovered
AC get an identity and `unassigned/planned`, with no invented expected result.
Ambiguous or removed AC associations block. Method/evidence prose stays disclosed
as unverified history. Historical `CURRENT` JSON freshness becomes `STALE`, with
original bytes and every delta retained; a v1 gate model is archived in the input
snapshot rather than imported as an active v2 approval model.

## Owner-supplied identity mapping

Unresolved crosswalk rows are listed in
`provenance/owner-mapping-required.json`, including their stable row key, copied
source locator and any explicitly cited candidate owners. Original spellings
remain in the frozen source; unresolved rows have no invented canonical target.
A partial crosswalk never makes a blocked export acceptable.

Copy [owner-mapping.example.json](owner-mapping.example.json), fill the actual
source hash, row, source locator, declared story owner and owner authority, then
validate against [owner-mapping.schema.json](owner-mapping.schema.json):

```sh
node tools/migrate/v1-to-v2.mjs <v1-spec> --out <new-dir> --owner-map <mapping.json>
```

The example contains deliberate placeholders and is refused against real input.
The converter rejects stale hashes, duplicate mappings, missing rows, mismatched
locators, undeclared owners and contradictions with explicit source ownership.
A mapping supplies identity ownership only; it does not add missing GWT behavior,
state coverage, diagrams, selectors, current evidence or approvals.

## Evidence boundaries

The source ledger keeps source preservation, typed mapping and demo coverage
separate. Semantic mappings stay explicitly unreviewed (`no-demo`, zero mappings)
until source/owner review supplies authority; a copied typed item is not
implementation evidence. The original upstream AC namespace remains distinct
from typed local story AC and crosswalk row keys.

`verify-output.mjs` checks retained snapshots, actual output counts, both sidecar
schemas with Ajv, extracted source-item text joins/digests, active JSON record conservation and
independent inventory reconstruction. Bullet IDs and table framing are excluded
from the text digest; raw-byte equality is checked separately through snapshots.
Canonical IDs in JSON/HTML reserve allocation slots. Colliding rewritten JSON
keys refuse before output writes. Identity checks decode JSON strings (keys and
values) and HTML entities before detection. Encoded legacy identities refuse
before any output write; frozen input bytes remain unchanged. Decoded canonical
JSON identities also reserve allocation slots.
Executable identity refusal is owned by
[`executableLegacyIdentities`](identity-surfaces.mjs): scripts with decoded legacy
tokens fail closed as `EXECUTABLE-LEGACY-ID`, before export. Code crosswalking is
unsupported; conservative inspection can also refuse tokens in comments. Runtime
string assembly or evaluation requires a separate source/owner review.
Provide `SPEC_AJV_MODULE` pointing to the existing Ajv 2020 module if it is not
locally resolvable. These checks can pass for a deliberately blocked migration:
source preservation and structural acceptance are separate checks. Pending C9
crosswalk joins make the verifier exit 1 even when every retained byte matches;
these source ownership gaps remain visible and cannot count as complete joins.

After reader v2 integration and resolution of source lint errors:

```sh
node tools/reader/render.mjs <migrated-spec> --out <reader-output> --offline --artifact
node tools/reader/verify.mjs <reader-output> --proof <proof-output>
```

PO, Dev and QA views are generated by that reader. QA conformance testing and
es-designer gates/screenshots need their actual rendered runtime; this migration
claims neither. A forced preview remains invalid and cannot close acceptance.

## Diagnostic attribution

`provenance/source-line-map.json` pins emitted Markdown lines to original source
lines. `source-defects.mjs <source> <output> [old-baseline.json]` reruns the
unchanged lint rules on both the live output and a fresh source-only projection.
The optional old baseline is named in the receipt but never trusted as proof.
Projection changes only manifest format, source-backed aliases and scenario
representation; source table cells, headers, metadata and evidence paths retain
their meaning. Its temporary copy is deleted after each check.

Each source diagnostic can certify one matching output occurrence, with the same
file, rule, message and all attributed source locations. Scenario schema errors
also match the owning scenario identity. A unique locator is `EXACT`; multiple
candidates are `AMBIGUOUS`, with every candidate retained. Output-only diagnostics
are `CONVERTER-INDUCED`; they and unresolved attribution make both this command
and `verify-output.mjs` fail. Receipts count source-defect and converter-induced
errors separately. Attribution does not adjudicate possible lint false positives.

[`normalizeDeclaredColumns`](declared-table-columns.mjs) owns table mapping by
declared labels. Unexpected labels retain their cells and become source blockers;
missing or duplicate required labels preserve the table without positional guesses.
Fresh source errors absent from output remain in attribution with
`disposition: absent-from-output`; their absence does not certify semantic repair.

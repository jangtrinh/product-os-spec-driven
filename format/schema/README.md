# PRODUCT:OS Spec Driven — Format v2 schemas

Use a standard draft-2020-12 validator with **date, date-time and email assertions enabled**. Schemas are local and share `$ref` definitions; register every local `$id` before compiling or validating instances. Their URLs are identifiers, never network dependencies. Register the assertion-free `x-spec-ref` annotation keyword in strict validators; it declares a [reference-registry](../reference-registry.json) binding or `false` with `x-spec-ref-reason` for an explicit non-reference. Register both assertion-free keywords; every string-capable schema location requires direct classification. Missing schemas, unknown keys or validation exceptions are errors.

## Current verification entrypoint

This entrypoint **supersedes** earlier independent-schema compile loops and examples. The current [document census](../checks/document-contracts.cjs) requires D1–D12. Do not compile one file before registering all references. The JavaScript block below runs the current complete suite:

```javascript
require('./format/checks/schema-suite.cjs');
```

From the kit root, with installed Ajv 8 (no package download):

```sh
SPEC_AJV_MODULE=/absolute/installed/node_modules/ajv/dist/2020 node format/checks/schema-suite.cjs
```

`SPEC_AJV_MODULE` is optional when `ajv/dist/2020` already resolves locally. The suite registers every schema first, asserts real calendar dates/date-time/email, compiles all refs, and includes linked fix-round positive/RED inputs. The original visual positive has explicit role/scope added for the intentional corrected cell contract; no former negative assertion was removed or weakened. [Compatibility cases](../checks/compatibility-suite.cjs), [fix-round suite](../checks/schema-suite.cjs) and [semantic oracles](../checks/contract-oracles.cjs) are developer checks, not implementations of the future kit tools.

A generic compile-only command with locally installed Ajv + ajv-formats:

```sh
node <<'JS'
const fs=require('node:fs');
const Ajv=require('ajv/dist/2020').default;
const addFormats=require('ajv-formats');
const a=new Ajv({strict:true,allErrors:true});addFormats(a);
a.addKeyword({keyword:"x-spec-ref",schemaType:["string","boolean"],valid:true});
a.addKeyword({keyword:"x-spec-ref-reason",schemaType:"string",valid:true});
const schemas=fs.readdirSync('format/schema').filter(f=>f.endsWith('.json')).sort()
  .map(f=>JSON.parse(fs.readFileSync('format/schema/'+f,'utf8')));
for(const s of schemas){if(!a.validateSchema(s))throw Error(JSON.stringify(a.errors));a.addSchema(s);}
for(const s of schemas){a.getSchema(s.$id);console.log('COMPILED '+s.$id);}
JS
```

An offline Python developer alternative (not a core dependency), using installed jsonschema + referencing:

```sh
python3 <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
schemas=[json.loads(p.read_text()) for p in sorted(Path('format/schema').glob('*.json'))]
registry=Registry().with_resources((s['$id'],Resource.from_contents(s)) for s in schemas)
for s in schemas:
    Draft202012Validator.check_schema(s)
    validator=Draft202012Validator(s,registry=registry,format_checker=FormatChecker())
    print('REGISTERED',s['$id'])
# validator.validate(parsed_instance) resolves only registered schemas and asserts formats.
PY
```

## Input ownership

| Schema | Parsed input |
|---|---|
| manifest, front-matter | manifest/YAML; scenario object is front-matter `$defs.scenario` |
| ui-contract, glossary, block-history | normalized rows / exact block history; [glossary grammar](../glossary-grammar.md) owns JSON cells and escaping |
| model-common | reusable types and scope root; criterion applicable/confirmed-NA encoding |
| gate-definition, gate-state, transition, dependency-graph | exact definition/scoped gate data / legal re-entry / causal graph |
| gate-review | exact gate-data.review object; shared enabled verdicts, all-NA/empty NOT_RUN and disabled false/false/null |
| evidence-receipt, audit-event, exception | capture or truthful missing observation / append-only event / scoped PO exception |
| candidate-manifest, packet-data, batch-decision, change-set | member hashes / canonical reader payload / exported decision / draft change; [interchange](../packet-interchange.md) owns bases, lookup, digest and CLI |
| design-profile, screen-inventory, design-sources, copy-catalog | adapter boundary / screen-state rows / generated locator sidecar / declared locale copy entries |

Markdown/YAML normalization follows [Format v2](../SPEC-FORMAT-v2.md); YAML dates remain strings. Shape validation does not establish identity uniqueness by key, file existence/realpath boundaries, exact role/scope cell joins, digest freshness, source authority, propagation meaning, independent review or authenticated approval. Lint/runner/reader must check these fail-closed; the linked fixture's RED cases demonstrate selected cross-field contracts without claiming production execution.

Every executed visual observation still needs full nonnull capture paths/pins; unexecuted visual cells declare requested context, MISSING, actual diagnostic artifact/recovery and zero passed coverage. NA criterion score is null with reason/confirmer and never contributes to passed numerator. Every applicable mandatory criterion stays at score 2 for eligibility. Migration design debt is individually disclosed in the required migration report; its permitted lint warnings remain only unassigned-method and exactly one legacy-absent UI-contract warning.

D13/D14 add [id-crosswalk](id-crosswalk.schema.json) and [source-ledger](source-ledger.schema.json) sidecars without changing pre-existing schemas. Shape checks: `format/checks/source-provenance-schemas.cjs`; allocation, uniqueness, inventory/digest/coverage checks: `format/checks/source-provenance-semantics.cjs`. New literal shapes are explicitly pinned in `format/reference-registry-new-schema-shapes.json`; independent semantic review remains required. The payload ownership name for id-crosswalk is `crosswalk`.

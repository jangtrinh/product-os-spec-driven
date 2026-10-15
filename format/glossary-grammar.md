# Extended glossary authoring grammar

Normative extension of [Format F4](SPEC-FORMAT-v2.md#glossary-f4). Legacy four-/three-column tables and CONTEXT `_Avoid_` keep their existing grammar. Use these exact extended headers (column order fixed) when any locale/copy extension is needed:

```text
Term | Anchor | Definition | Source | Locale | Source key | Retained terms | Exceptions
Banned | Replacement | Reason | Locale | Source key | Retained terms | Exceptions
```

Normalize term columns to `{term,anchor,definition,source,locale,source_key?,retained_terms,exceptions}`, ban columns to `{banned,replacement,reason,locale,source_key?,retained_terms,exceptions}`. Text fields are trimmed strings with literal content retained; `Locale` is a BCP47 tag (`en`, `vi`, `en-US`), or `—` to inherit manifest `language` (default `vi` as Format §2). Store the effective locale; no implicit translation. `Source key` is a nonempty exact locale-catalog key or `—` to omit. The last two cells are strict JSON: array of nonempty strings and array of `{text,reason,source}` respectively. Empty arrays are `[]`, never `—`, comma-separated prose, single quotes or blank cells. All schema fields and duplicate/unknown keys are checked.

Markdown escaping: split only on unescaped `|`, allow optional outer delimiters, trim surrounding cell whitespace, decode `\|` to literal pipe and `\\` to backslash **once**, then parse JSON cells. Encode every pipe inside a JSON string as `\|`; double every JSON backslash at the table layer (a JSON `\n` escape is authored `\\n`). A literal JSON backslash thus needs both JSON and table escaping. Reject unrecognized table escapes, malformed JSON, wrong column count, duplicate object keys and unknown locale tags. Never treat a JSON comma or semicolon as a table/array separator. Examples below contain no ambiguous escapes; verification also roundtrips pipes/backslashes.

Legacy tables normalize extension defaults to effective manifest locale, omitted source_key, empty retained_terms/exceptions. CONTEXT entries also use those defaults; CONTEXT has no new free-form locale/exception syntax. Use extended glossary tables for explicit overrides; cross-source duplicate spellings/anchors or conflicting bans remain errors. JSON schemas accept older normalized rows without extension keys; consumers apply the exact defaults before locale-aware joins.

Resolve term `source` and each exception `source` as existing local path/heading or recorded decision/ruling id; a frozen external citation may be displayed offline with recorded authority; the form `<file> §<n>[, §<n>]` is accepted when `<file>` exists under the project root (the parent of `spec/`), and a `../` escape, an absolute path, a directory or an absent file stays unresolved. A fabricated/unknown decision is `DS-COPY`/glossary-source RED, even when JSON shape is valid. Locale `source_key` resolves only in the profile's declared `catalogs` entry with `kind: copy` and that effective `locale`, never by approximate matching. Catalog JSON is `{locale: "vi", entries: {"filters.save": "Lưu bộ lọc"}}`, validated by [copy-catalog.schema.json](schema/copy-catalog.schema.json); declaration locale and raw digest must match, and two conflicting catalogs for one locale/key error. If no such catalog exists, omit source_key and retain explicit source or hold OPEN. Exceptions apply only to their row's banned/retained literal text and cited scope, never a blanket ban suppression. Keep NFC diacritics, placeholders, units and business data. Uniqueness = effective locale + NFC/casefold spelling; anchors remain unique across the glossary document for unambiguous links.

## Positive EN-only example

Assume manifest `language: en` and declared decision D1. No VI rows required.

| Term | Anchor | Definition | Source | Locale | Source key | Retained terms | Exceptions |
|---|---|---|---|---|---|---|---|
| Saved filter | saved-filter | A reusable selection. | D1 | — | — | ["API"] | [] |

## Positive VI and source exception

Assume manifest `language: vi`, D1 records the literal imported label Filter and copy catalog declares `vi: filters.save`.

| Term | Anchor | Definition | Source | Locale | Source key | Retained terms | Exceptions |
|---|---|---|---|---|---|---|---|
| Bộ lọc đã lưu | bo-loc-da-luu | Lựa chọn dùng lại. | D1 | vi | filters.save | ["API"] | [{"text":"Filter","reason":"Literal source label","source":"D1"}] |

| Banned | Replacement | Reason | Locale | Source key | Retained terms | Exceptions |
|---|---|---|---|---|---|---|
| seamless | State the observable steps. | No measured behavior. | en | — | [] | [] |

RED: `Retained terms = API, Filter`, `Exceptions = [{"text":"Filter"}]`, invalid JSON/single quotes/duplicate object keys/unescaped pipe, unknown `filters.missing`, or source `D999` absent from authority. P2 writes this grammar; P3 parses it; P6 only imports explicit source-backed extension cells. See [developer suite](checks/schema-suite.cjs); it is a bounded contract check, not the future Markdown linter.

## Machine grammar declarations

These declarations own extraction locations. Every location, including non-reference fields, requires a separate census classification. Prose and schema payload constraints above retain authority.

```spec-grammar
[{"doc_type":"glossary","location":{"kind":"body-table","heading":"^## (?:Terms|Ban list)","column":"Source","pattern":".+"}},{"doc_type":"glossary","location":{"kind":"body-table","heading":"^## (?:Terms|Ban list)","column":"Source key","pattern":".+"}},{"doc_type":"glossary","location":{"kind":"body-table","heading":"^## (?:Terms|Ban list)","column":"Exceptions","pattern":".+"}},{"doc_type":"glossary","location":{"kind":"body-table","heading":"^## Terms","column":"Anchor","pattern":".+"}}]
```

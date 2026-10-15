# Reader v2 — PRODUCT:OS Spec Driven

Offline reader, role views and batch review packet for a Spec Format v2 bundle. No network at build or run time.

```text
node tools/reader/render.mjs <spec> --out <dir> [--offline] [--artifact] [--force]
node tools/reader/verify.mjs <dir> [--matrix full] [--pages id,id] [--proof <dir>] [--playwright-from <dir>]
node tools/reader/verify.mjs --packet <packet-dir> [--proof <dir>]
node tools/reader/verify.mjs --self-test
node tools/reader/packet.mjs <spec> --project <root> --config <path> --change-set <id> --out <new-dir>
node tools/reader/make-shell.mjs [--check]
node --test tools/reader/test/
```

Lint runs first; `render` refuses a red spec (`--force` makes a visibly invalid preview). Lint needs `SPEC_AJV_MODULE` for format checks.

## Layout

| Path | Role |
|---|---|
| `indexer/` | spec → `content.json` (pages, chain, decisions, amendments, readable layer) |
| `indexer/views/` | PO, Dev (index + one panel per story), QA, Open items, Coverage, Screens, Evidence, Source ledger; each builder is a pure function of the loaded spec |
| `lib/source-ledger-load.mjs` | the only module that knows the source-ledger / id-crosswalk shape (format §11) |
| `shell-src/` → `shell/` | project-neutral shell (`make-shell.mjs` assembles it); `js/12–18-skin-*` and `css/60-skin.css` are the standard Public Docs skin (BrandCube, local Lucide icons, overlay floor, view transition); the bundled skin layer and tokens define the current public look (see below) |
| `indexer/design-stages.mjs` | the wireframe and prototype stage outputs: own nav group, prototype line annotation, screen list |
| `lib/project-revision.mjs` | project root (`~` for home) and spec revision (git short sha, `+dirty` when uncommitted, else a content digest) that every clipboard text carries |
| `packet/` | canonical packet data, self-contained HTML, client controls that export a decision file |
| `verify/` | headless Chromium over `file://`; checks, screenshots, self-test with planted defects |

## Rules the code keeps

- Role views are generated from the spec; they hold no authority and never turn a declared status into evidence. An AC is passed only when every associated scenario is passing and a CURRENT executed receipt lists it as passed.
- Missing, retired, stale, unverified, not-created and no-image states are printed beside the claim they affect; `content.json` carries `views.expect` and `verify` fails when a page hides one.
- The skin never edits `SPEC_DATA`; `verify` compares its canonical digest with the one recorded at render time.
- Packet generation writes no gate, audit or decision record. The HTML only exports a decision file; the runner imports it.
- Decision export starts disabled while digest and source binding checks run. A matching digest and verified sources enable export; mismatch or computation failure leaves it disabled with a visible warning. Regenerate a mismatched packet from current sources before reviewing it again.
- Aggregate checks name current eligible receipt heads selected by the runner's shared evidence owner. Retired and STALE history remains in the evidence data; it cannot establish a current aggregate check. Contradictory current heads and invalid supersession remain blocking.
- The packet page is a viewing surface. Its checks do not protect against arbitrary presentation changes, including CSS hiding or injected text. The runner independently rebuilds the full packet from the configured spec at HEAD and authoritative registries before approval writes; a self-consistent submitted digest alone is insufficient.

## Look: bundled public skin, style only

The reader stays a light, offline, vanilla shell that renders Markdown. No external UI kit is installed or loaded at run time: the bundled skin defines semantic light and dark colours, type scale, radius, spacing, a 64 px top bar, pill buttons, ring-bordered badges and chips, a 38 px table head with 16 x 8 cells, popovers and tooltips. Every variable has a CSS fallback so a project theme file written earlier still renders. Fonts are the Be Vietnam Pro and JetBrains Mono files already bundled in `shell/fonts/`; no licence text is bundled for either (open item).

The header reads `product:os / <project title>` and the window title `<page> · product:os / <project title>`. `data.product` in `content.json` is unchanged.

## Copy cho AI

Select text in a rendered spec page and a small box opens next to it: the location (`<file>:<lines> · <ids> › <heading>`), an optional request and the button "Copy cho AI" (Cmd/Ctrl+Enter copies, Esc closes). The clipboard gets a Markdown block with the quoted text, `File: spec/<path>.md:<start>-<end>`, `Mục`, `Trang reader`, `Project` (root, revision) and `Yêu cầu của tôi`.

- Lines are real source lines. The page markdown is rendered block by block and every block, table row and list item carries `data-src-start` / `data-src-end`; a fenced code line is exact (only inside the code text: a chip or caption of the same block cites the whole block). A Mermaid fence is drawn as SVG that carries no text-to-line mapping, so a selection inside a diagram cites the whole fence (opening to closing line), never a guessed line. `page.src` in `content.json` holds the file and the first body line; `src.map` appears only on a page where the reader inserted lines (the not-built image note). A selection over several blocks copies the union range.
- A generated page (role views, dossier, start) has no single source file. The block says "Trang tạo tự động", names the source files its links point to when it can, and never prints a line number.
- If the browser refuses the clipboard API the box shows the text selected in a textarea (press Ctrl/Cmd+C).
- Core text shapes live in `shell-src/js/00b-copy-core.js` (pure functions); the Node tests run that same file.

## Prototype

When the spec has `prototype/index.html` the reader adds a **Prototype** page next to **Wireframes** (own nav group "Wireframes & prototype"). The prototype is shown in a sandboxed frame (`sandbox="allow-scripts"`, no same-origin) fed from `content.json`; the file itself is copied unchanged to `prototype/index.html` in the output and "Mở tab mới" opens that clean copy. The copy used in the frame carries `data-src-line` on every start tag (added inside the tag, so no line moves; the tokenizer follows the prototype lint's tag rules). Toolbar: screen list, state list, Annotate, Mở tab mới. With Annotate on, hover outlines an element and a click opens the same box; the clipboard names the screen and state, the element's role and text, `spec/prototype/index.html:<line>` and the US/AC ids of the screen's trace line. The frame and the page talk by `postMessage` only.

## Wireframes page

The wireframe stage file renders as screens: one light frame per state titled `SCR-001 · <title> — <state>` (monospace kept, no code chrome), flows as `SCR-001 → SCR-002 (Save filter)`, and a contents list with the same readable titles. Heading ids are unchanged, so existing links keep working.

## The "*" mark

`*` means the page, decision or amendment is dated inside the recent window: `changes.recent_days` in the manifest (default 7) counted back from the newest `updated` date in the spec (`indexer/recent-changes.mjs`). It does not mean "since you last read": the reader keeps no read history. The pages card shows the legend and the mark carries a tooltip with the dates.

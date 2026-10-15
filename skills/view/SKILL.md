---
name: view
description: Render PRODUCT:OS Spec Driven PO, Dev and QA reader views offline. Use for /spec:view.
argument-hint: "--project <directory> [output directory]"
---
# View the spec
Read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md` first.
Ask for the project and a view directory outside it and outside the plugin cache. Show whether that directory already exists; ask before replacing an existing view. Use `spec_root` from config if it differs from `spec`.
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/status.mjs" --project "<dir>" --json
(cd "<dir>" && node "${CLAUDE_PLUGIN_ROOT}/tools/reader/render.mjs" spec --out "<view-dir>" --offline)
```
Capture the renderer exit. On success print `<view-dir>/offline/index.html`, explain PO / Dev / QA / Open items / Coverage, and open it only when the host has a local open capability (macOS: `open "<view-dir>/offline/index.html"`).
On failure show lint/errors and recovery. Never add `--force` to hide failed lint, invent receipts, or overwrite the project.

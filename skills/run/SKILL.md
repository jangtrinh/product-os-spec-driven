---
name: run
description: Run PRODUCT:OS Spec Driven stages and explain the next PO action. Use for /spec:run.
argument-hint: "--project <directory> [real build revision]"
---
# Run the pipeline
Read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md` first.
Ask for the project if missing. Verify the raw spec is filled. Tell the PO: expect 30–75 minutes per stage with real source; each model call has a bounded timeout.
Before launching the runner, read status:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/status.mjs" --project "<dir>" --json
```
Use `next_stage` and `ui_context_due`. Only when `ui_context_due` is true, ask through the host ask-user tool (≤4 questions/round, recommended first): **Có sẵn HTML / trang app, design system, danh sách component hoặc file export Figma không?** Options: **Không có / chưa rõ (Recommended)** — skip when unsure; **Đường dẫn folder**; **Đường dẫn các file**. Wait for the answer; only ask for paths if selected. This is the first wireframe run; prototype reuses UI context.
Before loading, show `${CLAUDE_PLUGIN_ROOT}/docs/context-guide.md` briefly: prepared UTF-8 text only (`.md .txt .html .htm .css .json .yaml .yml .csv .svg`), 65,536 bytes/file and 262,144 bytes/UI group including existing files. HTML saved outside the kit, DS tokens `.json`, component/frame descriptions `.md`; screenshots described in `.md`. PO prepares exports outside the kit. No secrets, personal data or whole repos. Never read Figma, understand images, summarize, convert or analyze context.
For PO-selected paths (one safely quoted `--from` per path):
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/load-context.mjs" --project "<dir>" --kind ui --from "<prepared-path>" --dry-run --json
```
Show the plan's files, bytes and refusals. Ask through ask-user: **Nạp các file theo kế hoạch?** **Nạp (Recommended)** / **Sửa nguồn trước** / **Bỏ qua**. After explicit consent rerun the exact command without `--dry-run`. Exit 3: show every refusal with preparation advice; wait for corrected files or an explicit skip. Exit 4: show the environment error. No automatic conversion, overwrite or retry.
Record the PO's completed UI choice only after **none/skip**, or after successful load. Use the host edit tool to create/update `<dir>/input/context-intake.json`, preserving other keys: `{"ui":{"asked":true,"answer":"none"}}` for no context/explicit skip, or `{"ui":{"asked":true,"answer":"loaded"}}` after successful load. This PO-owned control file is outside stage inputs; never put the marker in `input/answers.md` or `context/ui/`, where it would stale a gate. Do not mark unanswered/refused/failed loads as completed. Once recorded, do not re-ask on later runs. Status also suppresses the question after wireframe has already started, including upgraded projects.
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/run.mjs" --project "<dir>" --head fresh-source --build not-built
node "${CLAUDE_PLUGIN_ROOT}/tools/run/status.mjs" --project "<dir>" --json
```
Use a real `--head`/`--build` only when supplied or observed from the project. Preserve runtime pins when resuming a continuation. Capture the runner exit before running status.
Explain the stopped stage, gate, review/fix rounds and next command from status. Exit 2: offer `/spec:clarify` for open questions or `/spec:gate` for a pending gate/cap. Exit 3: identify the config/source error. Exit 4: identify the failed tool/log, including timeout. Exit 0 means settled enabled stages, not production acceptance.
Offer the next action; wait for a PO decision before a gate. Never call decide automatically, change caps or erase counters.

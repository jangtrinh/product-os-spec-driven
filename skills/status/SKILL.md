---
name: status
description: Read PRODUCT:OS Spec Driven stage gates, counters, open questions and the exact next command. Use for /spec:status or spec-status.
argument-hint: "--project <directory>"
---
# Read project status
Read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md` first.
Ask for the project path if absent. Run:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/status.mjs" --project "<dir>"
```
For machine-readable detail:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/status.mjs" --project "<dir>" --json
```
Explain enabled stages in order, gate values, fix/review used/cap, continuation eligibility, open Q IDs and exact next command. This command takes no lock and writes nothing.
If status lists ignored context files, tell the PO in plain words. Name each file and its reason, using the advice in docs/context-guide.md: describe the screen in a .md file, or export other material as UTF-8 text. An OS junk count is not a file to open. Ignored files stay out of stage inputs.
`none` means no gate exists and the stage is not started/settled. `PENDING` means waiting for the PO. Only current `APPROVED` / `NOT_REQUIRED` gates are settled; never summarize a fresh project as settled.
Display a PO command as a suggestion, never execute a decision from status. For a pending gate, offer `/spec:gate`; for unanswered questions, `/spec:clarify`. A settled gate is not proof of production acceptance. Missing/bad source or config exits 3; show the error instead of guessing.

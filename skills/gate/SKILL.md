---
name: gate
description: Present a spec gate and execute only the PO's same-session ask-user decision. Use for /spec:gate.
argument-hint: "--project <directory> [stage]"
---
# Decide a gate with the PO
Read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md` first.
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/status.mjs" --project "<dir>" --json
```
Read the selected `<dir>/review/gates/<stage>.md`, status review_file and actual review log. Explain gate value, review verdict and every open Critical/Major/Minor in plain words, including file:line and the review file path. A Critical/Major or mandatory failed score blocks approval; do not offer an invalid approval.
Ask through the host ask-user tool: Approve (only eligible PENDING), Request changes (ask for exact text), Continue (only `continuation_possible`, ask for exact reason), Decide later. Present the context-appropriate recommended option first, without inventing a recommendation or implying the PO has already chosen.
For Approve with open Minor findings, ask for each Minor: accept or request changes; acceptance needs the PO's own reason and follow-up. Stop if any answer is missing. Ask for the authorized PO email if the configured identity is ambiguous. Re-read status before the mutation.
Only after an explicit same-session ask-user choice, run its matching command:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/decide.mjs" --project "<dir>" --stage "<stage>" --as "<po-email>" --confirmed-via ask-user --approve
node "${CLAUDE_PLUGIN_ROOT}/tools/run/decide.mjs" --project "<dir>" --stage "<stage>" --as "<po-email>" --confirmed-via ask-user --approve --accept-minor "<finding-id>" --reason "<PO reason>" --follow-up "<PO follow-up>"
node "${CLAUDE_PLUGIN_ROOT}/tools/run/decide.mjs" --project "<dir>" --stage "<stage>" --as "<po-email>" --confirmed-via ask-user --request-changes "<PO text>"
node "${CLAUDE_PLUGIN_ROOT}/tools/run/decide.mjs" --project "<dir>" --stage "<stage>" --as "<po-email>" --confirmed-via ask-user --continue --reason "<PO reason>"
```
Run exactly one matching form, repeating the Minor flag triple for every accepted finding. Never run all example commands. Quote supplied text safely without command substitution. A no-tool/chat fallback must leave the gate pending and show the PO a direct personal command without `--confirmed-via`.
On exit 3 report the unchanged refusal; do not forge, weaken or retry around freshness/authority checks. On exit 0 read back the decision record and audit channel `agent-ask-user`, then offer the exact runner continuation printed. Never infer consent from a previous session, a timeout or a default choice.

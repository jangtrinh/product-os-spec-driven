---
name: upgrade
description: Preview and apply a PO-confirmed PRODUCT:OS Spec Driven kit upgrade. Use for /spec:upgrade.
argument-hint: "--project <directory>"
---
# Upgrade from the installed plugin kit
Read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md` first.
Confirm no stage or other upgrade is running. Run the preview first:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/init.mjs" --project "<dir>" --upgrade --dry-run
```
Explain replacements, preserved owner selections, new definitions and stages that become stale. The upgrade has rollback for ordinary write failure, not proven power-loss recovery. Answer context leaves intake outside its scope; later decision-reading stages need review again. Branding prompt headers are deliberately preserved.
Ask the PO through ask-user whether to apply this exact plan. Only after that choice:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/init.mjs" --project "<dir>" --upgrade
node "${CLAUDE_PLUGIN_ROOT}/tools/run/doctor.mjs" --project "<dir>"
```
Capture each exit and show status. A locked/conflicting/downgrade refusal exits 3: stop and show the manual recovery. Never delete a lock, erase records or force a downgrade. If the installed kit is older, update the host plugin personally first.

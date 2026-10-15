---
name: setup
description: Set up PRODUCT:OS Spec Driven dependencies and check installed writer and reviewer CLIs. Use for /spec:setup.
argument-hint: "--project <directory>"
---
# Set up the kit
Read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md` first.
Ask for the project directory if absent. Run:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/doctor.mjs" --project "<dir>"
command -v codex
command -v claude
command -v grok
```
Show doctor PASS / FAIL / NOT RUN and the actual exit. PATH discovery is not authentication or a model smoke.
If Ajv is missing, ask the PO whether to install `ajv@8` in this project. Only after that answer:
```sh
(cd "<dir>" && npm install ajv@8)
node "${CLAUDE_PLUGIN_ROOT}/tools/run/doctor.mjs" --project "<dir>"
```
If no project exists, show kit doctor (`--project "${CLAUDE_PLUGIN_ROOT}"`) and offer `/spec:new`. Never install npm dependencies into the plugin root/cache; create the project first.
Tell the PO to log in personally using their selected CLI's official flow. Never log in or raise caps for them.

---
name: clarify
description: Ask the PO each open spec question and record same-session answers as source input. Use for /spec:clarify.
argument-hint: "--project <directory>"
---
# Clarify PO decisions
Read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md` first.
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/status.mjs" --project "<dir>" --json
```
Read `<dir>/spec/decisions/decisions.md` and each `open_questions[].source`; honor dependencies and existing answers. Show one decision per question via the host ask-user tool, at most four per round. Use only the record's options, recommendation and reason; recommended option first. If no options exist, ask a free-text question. Include Decide later; that choice leaves the question open.
Confirm the PO email from `roles.po.approvers` (ask if ambiguous), and today's calendar date. After the PO answers Q-nnn in this session's ask-user tool, append that answer to `input/answers.md`:
```sh
node --input-type=module - "${CLAUDE_PLUGIN_ROOT}" "<dir>" '<answer-row-json>' <<'JS'
import {pathToFileURL} from 'node:url';
const [kit,dir,json] = process.argv.slice(2);
const {appendAnswer} = await import(pathToFileURL(kit+'/tools/run/answer-source.mjs'));
appendAnswer(dir,JSON.parse(json),'ask-user');
JS
node "${CLAUDE_PLUGIN_ROOT}/tools/run/status.mjs" --project "<dir>" --json
```
JSON fields: `id`, `answer` (exact PO text), `decided_by` (PO email), `date` (`YYYY-MM-DD`), optional `note` with the answer's source. Use proper shell quoting for JSON; never paste unescaped single quotes into a shell literal.
The helper escapes pipes/newlines and refuses duplicate IDs or invalid identity/date. Verify the recorded row and remaining open IDs. Never answer from a recommendation, write generated decision outputs or fabricate consent. If the host has no ask-user tool, wait for numbered chat replies and let the PO write the source personally.
Offer `/spec:run` to materialize `answer / decided_by / decided_at / decision_ref` into decisions and clarify records. Intake does not read this source; later decision-reading stages do.

---
name: new
description: Create a PRODUCT:OS Spec Driven project from the plugin kit with PO-owned inputs. Use for /spec:new.
argument-hint: "[project directory]"
---
# Create a project
Read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/rules.md` first.
Ask through the host ask-user tool in two rounds (at most four questions each): folder, product name, language (Vietnamese recommended / English); writer (Codex recommended / Claude / manual), reviewer (Grok recommended for Codex / Claude / Codex / manual), PO email. Keep the vendors different. Recommend only available CLIs; never choose Grok writer.
Confirm the folder is empty, outside the kit, and not a symlink. Run:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/init.mjs" --project "<dir>" --name "<name>" --lang vi --writer codex --reviewer grok
```
Substitute only the PO's answers. On exit 3 stop and show the refusal; never retry with `--force` automatically.
Write only the PO email just supplied to `roles.po.approvers` in `<dir>/config/pipeline.yaml`. Preserve YAML comments and all other values. Exact helper (replace root/project/JSON with safely quoted answered values):
```sh
node --input-type=module - "${CLAUDE_PLUGIN_ROOT}" "<dir>" '<po-email-json>' <<'JS'
import fs from 'node:fs'; import {pathToFileURL} from 'node:url';
const [kit, dir, emailJson] = process.argv.slice(2), email = JSON.parse(emailJson);
const {loadConfig,validateConfig} = await import(pathToFileURL(kit+'/tools/lib/config/config-loader.mjs'));
const {editYaml} = await import(pathToFileURL(kit+'/tools/lib/config/yaml-in-place.mjs'));
const config=loadConfig(dir); config.roles.po.approvers=[email]; validateConfig(config);
const file=dir+'/config/pipeline.yaml'; fs.writeFileSync(file,editYaml(fs.readFileSync(file,'utf8'),config));
JS
node "${CLAUDE_PLUGIN_ROOT}/tools/run/doctor.mjs" --project "<dir>"
```
After init and doctor, ask through the host ask-user tool (≤4 questions per round, recommended first): **Có sẵn tài liệu / context dự án không?** Options: **Không có / chưa rõ (Recommended)** — skip when unsure; **Đường dẫn folder**; **Đường dẫn các file**. Ask for paths only after the PO chooses a source. A refusal or no answer is not consent to load.
Before any load, briefly show `${CLAUDE_PLUGIN_ROOT}/docs/context-guide.md`: PO prepares UTF-8 `.md .txt .html .htm .css .json .yaml .yml .csv .svg`; 65,536 bytes/file and 262,144 bytes/sources group including existing files. Export other documents outside the kit; describe screenshots in `.md`. No secrets, personal data, whole repos, symlinks or kit/project-owned inputs.
Run with each PO-selected path safely quoted as a separate `--from`:
```sh
node "${CLAUDE_PLUGIN_ROOT}/tools/run/load-context.mjs" --project "<dir>" --kind sources --from "<prepared-path>" --dry-run --json
```
Capture the exit. Show the plan's files, bytes and refusals, then ask through ask-user: **Nạp các file theo kế hoạch?** **Nạp (Recommended)** / **Sửa nguồn trước** / **Bỏ qua**. Only after explicit consent rerun the exact command without `--dry-run`. Exit 3: show every refusal and preparation advice; wait for PO-prepared replacements or skip. Exit 4: show the environment error; do not silently retry. Never convert, summarize or rewrite context; never analyze a codebase, read Figma or inspect images. Do not read the selected content to prepare a summary.
Tell the PO to place the raw spec in `<dir>/input/po-spec.md`. If the PO pastes a spec or supplies a file path, read it, confirm the intended source and replacement through ask-user, then write those exact bytes there using the host edit tool. Never invent product requirements or a baseline.
Summarize created paths, doctor result and `/spec:run <dir>`.

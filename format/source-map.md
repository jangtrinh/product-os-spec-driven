# Source map — normative inputs to the kit

This map records each retained baseline or format rule and its disposition. It covers each literal `##` and `###` rule heading, including the six illustrative headings inside the v1 fenced example. Destination sections refer to SPEC.md or format/SPEC-FORMAT-v2.md in this kit.

| Source | Original heading (exact) | Destination / disposition |
|---|---|---|
| Baseline SPEC | ## 1. Mục tiêu | SPEC.md §1 |
| Baseline SPEC | ## 2. Thuật ngữ | SPEC.md §2; contract becomes product/feature, baseline schema contract becomes template |
| Baseline SPEC | ## 3. Phạm vi | SPEC.md §3; Node/offline scope replaces Python/Bash prerequisite |
| Baseline SPEC | ## 4. Quy trình | SPEC.md §4; Format §9 pipeline; gate-model.md §§1–8 (legal loops, scoped gates, Change Sets) |
| Baseline SPEC | ### 4.1. Các stage | SPEC.md §4.1; add intake/contract/handoff, keep design/tdd/uiux order |
| Baseline SPEC | ### 4.2. Stage làm rõ | SPEC.md §4.2; inline US OPEN replaces ledger-only rule per D1 |
| Baseline SPEC | ### 4.3. Luồng trong một stage | SPEC.md §4.3; C4 blocking threshold replaces non-FAIL continuation |
| Baseline SPEC | ### 4.4. Quyết định tại gate | SPEC.md §4.4; Format §9 pipeline gate-data |
| Baseline SPEC | ### 4.5. Khi kết quả đã duyệt thay đổi | SPEC.md §4.5; Format §9 SHA-256 invalidation; gate-model.md §4 (typed closure, BR-14 fallback) |
| Baseline SPEC | ### 4.6. Mã thoát | SPEC.md §4.6; Node replaces Python/Bash environment dependency |
| Baseline SPEC | ## 5. Vai trò và cấu hình | SPEC.md §5; Format §9 F7 |
| Baseline SPEC | ## 6. Tác tử và cách chạy | SPEC.md §6; reviewer receives original source in fresh read-only session (O-06) |
| Baseline SPEC | ## 7. Contract chuẩn | SPEC.md §7; schema-template meaning renamed template (C2) |
| Baseline SPEC | ### 7.1. Contract PRD | SPEC.md §7.1; Format §6 prd. Dropped: exact six headings/prefix ids; incompatible with retained v1 REQ shape |
| Baseline SPEC | ### 7.2. Contract US | SPEC.md §7.2; Format §§3,4,6 us. Dropped: I–V frame/continuous numbering; preserve v1 six-section IDs and gaps |
| Baseline SPEC | ### 7.3. Contract thiết kế | SPEC.md §7.3; Format §6 ux/ui-contract; selector and scenario split resolves O-05; design-model.md §§1–6 (DS, authority, source, state, evidence) |
| Baseline SPEC | ### 7.4. Quy tắc viết | SPEC.md §7.4; Format §5; readable prose and role text only, build id references retained (C1) |
| Baseline SPEC | ### 7.5. Rubric review | SPEC.md §7.5; Format §9 gates; baseline VERDICT/disposition retained, mandatory 2 and Critical/Major rule wins (C4) |
| Baseline SPEC | ### 7.6. Glossary, sổ quyết định và ngữ cảnh kỹ thuật | SPEC.md §7.6; Format §6 decisions/glossary and §2 pointers |
| Baseline SPEC | ## 8. Eval | SPEC.md §8; Format §§8,9 |
| Baseline SPEC | ### 8.1. Script kiểm tra | SPEC.md §8.1; Format §8 all codes. Dropped: Python/Bash scripts and uppercase-Latin substring heuristic; Node fail-closed logic replaces them |
| Baseline SPEC | ### 8.2. Review theo rubric | SPEC.md §§7.5,8.2 |
| Baseline SPEC | ### 8.3. Bộ eval chất lượng | SPEC.md §8.3; Format §9 eval command |
| Baseline SPEC | ## 9. TDD | SPEC.md §9; Format §3 Scenario. Dropped: auto test mandatory for every case; F2 allows visual/review/manual/not-built/unassigned |
| Baseline SPEC | ## 10. UIUX | SPEC.md §10; Format §§6 ui-contract,7 images,9 role views; design-model.md §§5–7 |
| Baseline SPEC | ## 11. Tạo project mới | SPEC.md §11; includes kit SPEC (O-03), excludes source-specific content |
| Baseline SPEC | ## 12. Cấu trúc thư mục | SPEC.md §12; Format §1 separates kit project from exported spec bundle |
| Baseline SPEC | ## 13. Tiêu chí hoàn thành của baseline | SPEC.md §13; extends proof/reader/migration, preserves manual/role/gate/eval requirements |
| Retained format rules | ## 1. Folder layout | Format §1 |
| Retained format rules | ## 2. `spec.manifest.json` | Format §2; manifest.schema.json |
| Retained format rules | ## 3. Front matter | Format §3; front-matter.schema.json |
| Retained format rules | ## 4. Ids | Format §4 |
| Retained format rules | ## 5. Body rules | Format §5 |
| Retained format rules | ## 6. Required structure per type | Format §6 |
| Retained format rules | ### `us` (one story, compact team shape) | Format §6 us; structured scenarios §3 |
| Retained format rules | ## 1. User Story            Là <vai trò email@>, tôi muốn <khả năng> để <giá trị>. | Format §6 us section 1; illustrative heading in source code fence, content retained |
| Retained format rules | ## 2. Flow                  start condition, main path, branches; one ```mermaid flowchart | Format §6 us section 2; illustrative heading in source code fence, content retained |
| Retained format rules | ## 3. Dữ liệu và quy tắc    table \| ID \| Quy tắc \| Nguồn \|  (BR-01 ...) | Format §6 us section 3; illustrative heading in source code fence, content retained |
| Retained format rules | ## 4. Acceptance Criteria   table \| ID \| Given \| When \| Then \| [Scenario] \|  one AC-nn row per case, empty state included | Format §6 us section 4; illustrative heading in source code fence, content retained |
| Retained format rules | ## 5. Edge cases | Format §6 us section 5; illustrative heading in source code fence, content retained |
| Retained format rules | ## 6. UI                    screen, coded screenshot or the ASCII wireframe, or one line why there is no UI | Format §6 us section 6; illustrative heading in source code fence, content retained |
| Retained format rules | ### `prd` | Format §6 prd |
| Retained format rules | ### `contract` | Format §6 contract |
| Retained format rules | ### `decisions` (the ledger, `ledger: true`) | Format §6 decisions |
| Retained format rules | ### Recent changes and reading before code | Format §6 Recent changes |
| Retained format rules | ### Readable layer (`readable/`) | Format §6 Readable layer; §9 PO |
| Retained format rules | ### `ux` and `wireframe-index` | Format §6 ux/wireframe-index; design-model.md §§2–5 (inventory and generated source sidecar) |
| Retained format rules | ## 7. Images: coded versus wireframe | Format §7; coded figure behavior and asset-copy rule retained |
| Retained format rules | ## 8. What lint checks (all strict; `--lenient` lets warnings pass) | Format §8 stable codes. Dropped: --lenient/global warning failure toggle; F2/C3 warnings are explicit and counted |
| Retained format rules | ## 9. Commands | Format §9; separate tools/lint, tools/reader, tools/run interfaces |
| Retained format rules | ## 10. Versioning | Format §10; v2 breaking change and mechanical migration |
| Retained format rules | ### Block-level wording history | Format §10 Block history; block-history.schema.json; coded figures §7 and direct groups §6 retained |

Unheaded retained content is accounted for too: coded-screen figure layout and asset migration → Format §7; direct story groups → Format §6 Readable layer. Block-history provenance, allocation and search exclusion → Format §10. No rule is replaced by a legacy pointer.

Comparison rev 2 is evidence, not newer product authority: X1 → inline OPEN (D1); X2 → template terminology (C2); X3 → readable/role text writing rules (C1). Its older runtime/skip recommendation is superseded by D2/D3/D5 and the accepted nine-stage F7 pipeline.

Baseline open O-03..O-09 → SPEC.md §14, with each choice and reason. Any future owner change is recorded in the decision ledger, not silently reinterpreted.

## Amendment authority

The literal source heading rows above remain complete. Loop/design amendments are additive normative companions; [requirements-map.md](requirements-map.md) accounts for the two scouts and D1–D11. Baseline BR-14 remains the conservative fallback rather than the sole invalidation strategy. Mandatory scores, severities, warning ratchets, default-disabled design/UIUX, and independent acceptance remain unchanged.

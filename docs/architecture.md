# Kiến trúc và bảng cắt của kit

Trạng thái: **DRAFT chờ owner ký** (P0, D35).

## 0. Nguyên tắc: model làm, gate giữ chất lượng (D42)

Spec Driven dùng LLM (Claude, Codex, Grok, Gemini…) để viết và review. Chất lượng delivery không dựa vào việc tin một model cụ thể; nó dựa vào các gate kiểm được, chạy giống nhau với mọi model:

| Lớp gate | Bắt cái gì | Ai quyết |
|---|---|---|
| Lint / eval (máy, tất định) | sai cấu trúc, thiếu trường, link gãy, ID trùng | công cụ, exit code |
| Reviewer độc lập (LLM khác vendor với writer, phiên mới, chỉ đọc) | sai nghĩa so với nguồn, AC không kiểm được, bịa | rubric + `review-data` máy đọc được |
| Gate người (G1–G5) | luật sản phẩm, phạm vi, chấp nhận Minor | chỉ PO; không agent nào duyệt thay |
| Ràng buộc nội dung (hash/membership) | duyệt cũ dùng cho nội dung đã đổi | runner, tự động STALE |

Hệ quả: (1) model là thành phần thay được — đổi vendor không đổi gate; (2) lời "xong/đạt" của model không phải bằng chứng, chỉ exit code, review đọc được và quyết định của PO mới tính; (3) writer không tự chấm mình — reviewer khác vendor; (4) giới hạn số lần gọi và timeout do runner giữ, không do prompt.

## 1. Năm tầng

| Tầng | Nội dung | Ai đọc |
|---|---|---|
| Luật | `SPEC.md`, `format/SPEC-FORMAT-v2.md`, `format/schema/`, `format/reference-registry.json` | công cụ, tác tử, người |
| Nội dung kit | `templates/`, `rules/`, `prompts/`, `config/pipeline.yaml` | tác tử viết, reviewer |
| Công cụ Node | `tools/lint`, `tools/run`, `tools/reader`, `tools/lib` (+ `tools/migrate`, `tools/evals` cho kit-dev) | người chạy, CI |
| Project | `input/po-spec.md`, `spec/`, `review/`, `ui/`, `tests/` | PO, Dev, QA |
| Ngoài kit | model CLI hoặc chat manual, DS adapter, project adapter | gọi công cụ, không sửa lõi |

## 2. Flow

`intake (G1) → clarify → contract (G2) → prd → us → wireframe → prototype → [design] → tdd (G3) → [uiux] (G4) → handoff (G5)`; `[ ]` = tắt mặc định. Sau G5 mọi thay đổi đi qua Change Set. Trong mỗi stage: runner ghép context + `prompts/<stage>.md` → tác tử viết → lint (≤3 vòng sửa) → reviewer phiên mới chấm rubric (≤3 vòng) → gate PENDING/NOT_REQUIRED. Mã thoát runner: 0 xong · 2 chờ người · 3 cấu hình sai · 4 công cụ/tác tử hỏng.

## 3. Lỗi chặn số 1 (đã tái hiện 2026-10-10)

Project tạo theo `SPEC.md` §11 trên thư mục trống → `node tools/run/run.mjs --project .` thoát **3**: `ENOENT review/definitions/g1-intake/1.json`. Gate definition có revision sha256 nên không viết tay được; hiện chỉ `fixtures/runner/project-fixture.mjs` tạo ra nó. P11 (`init`) sửa lỗi này.

## 4. Bảng cắt KEEP / MOVE / DEFER (cần owner ký)

Nguyên tắc: phần chép vào project phải nhỏ, chạy được, đọc hiểu trong 1 giờ. Phần phục vụ phát triển kit ở lại repo kit. **P0 chỉ chốt danh sách; việc dời file làm ở P14**, sau khi dogfood cho biết phần nào thật sự dùng.

### 4.1. KEEP — ship vào project

| Path | Ghi chú |
|---|---|
| `SPEC.md` | rút còn khoảng 200 dòng ở P14 (bỏ chi tiết packet, proof project-copy, §14) |
| `format/SPEC-FORMAT-v2.md`, `format/schema/` | schema tối thiểu chốt ở P14 theo những gì runner/lint thật sự đọc |
| `format/reference-registry.json` + 5 file runtime: `reference-registry-certification-boundary.cjs`, `-document-ownership.cjs`, `-document-identities.json`, `-schema-identity.cjs`, `-schema-path.cjs` | `tools/lib` import trực tiếp (closure đo bằng `require` 2026-10-10) |
| `templates/` (gồm wireframe.md, prototype.md): change-set(.json/.md), contract, decisions, epic, epic-map(.json/.md), gate, gate-state, glossary, handoff, intake, note, overview, prd, release, review, review-log, scenario-case, screen-inventory(.json/.md), spec.manifest(.json/.md), tech-context, ui-contract, us, us-index, ux, wireframe-index | khung tài liệu chính |
| `rules/` (4 file), `prompts/` (viết lại ở P12), `config/pipeline.yaml` | |
| `tools/lint`, `tools/run`, `tools/reader`, `tools/lib` | Q-record lint chỉ chạy khi có records |
| `evals/cases/` 2–3 case | baseline + greenfield, chuyển sang đo chất lượng spec |

### 4.2. MOVE → `kit-dev/` (không chép vào project)

| Path | Số lượng |
|---|---|
| `format/reference-registry-*` không thuộc runtime closure (red-controls, guards, classification, discovery, `-new-schema-shapes.json`, `-direction-roles.json`…) | 24 file |
| `format/checks/`, `format/evidence/`, `format/reference-registry-grammar.md` | 22 file + thư mục |
| `fixtures/runner/am9*`, `*evidence*`, `fix-v4*` (artefact các vòng verify) | đo lại ở P14 |
| `tools/migrate` → `adapters/migrate-v1/` (owner-only, D35) | 21 file |
| `tools/evals` harness cũ (fake agent) | thay bằng eval chất lượng ở P13/P14 |

### 4.3. DEFER — giữ code, tắt mặc định, không mở rộng

- Bộ duyệt lô (packet), `--import-decision`, delivery-state (D8).
- Scoped gates, receipt supersession, graph certification (D21).
- P4b export records (D26); P5b, P6, P9 (D34).
- 19 template bản ghi quy trình → `templates/records/`, runner sinh khi cần: audit-event, batch-decision, build, candidate-manifest, clarify-record, contract-amendment, decision-log-row, dependency-graph, ds-catalog, evidence-receipt, exception, expected-change, gate-definition, readable-review, scope-table, scoped-gate-definition, transition, visual-receipt, `evidence/`.

### 4.4. OUT of git (P14, D35)

Bằng chứng chạy, báo cáo và dự án ví dụ thật nằm ngoài repo (`.gitignore`); repo chỉ giữ bộ kit và fixture chung.

### 4.5. MERGE

- Phần chung của 10 prompt → `prompts/_common.md`, runner ghép (P12).
- `context/tech.template.md` trùng `templates/tech-context.md` → giữ một.
- README 3 dòng → README thật: cài, init, chạy, 3 view (P14).

## 5. Ràng buộc khi dời file (P14)

1. Kiểm `config/pipeline.yaml` stage context, `tools/lib/kit-content-paths.mjs` và census lint trước khi dời bất kỳ template hay format file nào; dời là thay đổi có test, không phải `mv`.
2. Không file `.mjs` nào trong `tools/`, `fixtures/`, `format/checks/` tham chiếu `examples/` (grep 2026-10-10); vẫn chạy lại toàn bộ gate sau khi untrack để chắc chắn.
3. Giữ lịch sử quyết định: D-row cũ không xóa, ghi dòng thay thế.

### 5.1. Nội dung hai stage UI/UX

`tools/lib/kit-content-paths.mjs` sở hữu toàn bộ `prompts/` và `templates/`: wireframe/prototype được init/upgrade/pack cùng corpus; census loại chúng khỏi authored project identities. Hai outputs literal giữ membership ổn định khi thêm screen. Lint dùng screen/state model, US/AC nguồn và đồ thị anchors, không cần browser. Runner dùng STAGES chuẩn bất kể thứ tự YAML; review-required list chung bắt review độc lập cho cả hai.

`wireframe` và `prototype` không vào nhánh design adapter. Wireframe/prototype đọc tokens và prepared UI text từ `optional_context: [context/ui/**]` khi có. Tdd/handoff đọc cả hai outputs; design/uiux sở hữu reviews/ nên handoff bỏ qua reviews chưa có khi chúng tắt.

## 6. Lộ trình (D35)

P0 (bảng này) → P11 `init` + `doctor` + agent wrappers ∥ P12 prompt → P13 dogfood greenfield (Codex viết, Claude review) → P14 sửa theo dogfood + cắt → mở lại P5b → P6 → P9.

## PRODUCT:OS command layer

Eight plugin skills wrap the existing kit, not a second runner. PO answers enter through `input/answers.md`; source/context hashes bind them after intake. Gate skills execute a PO decision only after an explicit same-session host question-tool answer (D54); audit records retain `direct` or `agent-ask-user`. The flag asserts provenance, not authentication. Caps, independent review and refusal rules remain runner-owned.

`load-context.mjs` validates a whole batch before copying exact UTF-8 bytes. Generic `optional_context` selectors select nothing when absent and bind actual files in stage inputs, snapshots, review bindings, candidate members and both censuses. Empty selectors stay outside the effective config hash and definition membership so upgrade preserves approvals. Pure optional external-source changes invalidate readers; produced-output/required/mixed changes retain causal/conservative invalidation. `input/context-intake.json` records the PO UI choice outside all stage selections. Status exposes `next_stage` and `ui_context_due` read-only.

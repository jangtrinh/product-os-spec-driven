# PRODUCT:OS Spec Driven

PRODUCT:OS Spec Driven nhận spec thô của PO rồi lập intake, contract, PRD, user story, scenario test và bản bàn giao.
PO giữ luật sản phẩm, phạm vi và gate G1–G5. `/spec:gate` chỉ ghi quyết định sau lựa chọn của PO qua tool hỏi người dùng trong cùng phiên; agent không tự duyệt.
Writer và reviewer là CLI có sẵn trên máy: Codex, Claude Code, Grok. Reviewer khác hãng với writer, chạy phiên mới và chỉ đọc.
Lời "xong" của model không phải bằng chứng. Chỉ mã thoát, file gate và quyết định của PO mới tính.

> **Trạng thái:** mới chỉ stage `intake` chạy hết với model thật. Các stage sau có code và test nhưng chưa chạy trên dự án thật; README gắn nhãn **chưa chứng minh** cho các stage đó. Giới hạn đầy đủ: [docs/known-limits.md](known-limits.md).

## Mục lục

[Cài bằng plugin](#cài-bằng-plugin) là đường bắt đầu; archive ở mục 2.

1. [Kit làm gì](#1-kit-làm-gì)
2. [Cài thủ công](#2-cài-thủ-công-archive-một-lần-mỗi-máy)
3. [Bắt đầu một dự án](#3-bắt-đầu-một-dự-án)
4. [Vòng làm việc: chạy, dừng, quyết, chạy lại](#4-vòng-làm-việc-chạy-dừng-quyết-chạy-lại)
5. [Làm từng stage](#5-làm-từng-stage)
6. [Câu hỏi làm rõ](#6-câu-hỏi-làm-rõ)
7. [Không có CLI: chế độ manual](#7-không-có-cli-chế-độ-manual)
8. [Nâng cấp kit](#8-nâng-cấp-kit)
9. [Troubleshoot](#9-troubleshoot)
10. [Việc không được làm](#10-việc-không-được-làm)
11. [Cho kit owner](#11-cho-kit-owner)

Tra nhanh lệnh: [docs/po-quickstart.md](po-quickstart.md). Kiến trúc: [docs/architecture.md](architecture.md).

## Cài bằng plugin

Cài từ chính repo này trong Claude Code. Các lệnh dưới dùng tên GitHub sau khi director đổi repo thành `jangtrinh/product-os-spec-driven`:

```text
/plugin marketplace add jangtrinh/product-os-spec-driven
/plugin install spec@product-os-spec-driven
/spec:setup
/spec:new
/spec:run
/spec:clarify
/spec:gate
```

Plugin tên `spec`, marketplace `product-os-spec-driven`; kit nằm trong plugin, không cần tải archive riêng. `/spec:new` hỏi thư mục, tên sản phẩm, ngôn ngữ, writer/reviewer và email PO rồi tạo project ngoài plugin. `/spec:status` đọc gate/counters/câu hỏi; `/spec:view` mở reader; `/spec:upgrade` xem dry-run, hỏi PO rồi nâng cấp.

Lần đầu `marketplace add` clone toàn bộ repo (chỉ kit, tools, test và tài liệu; khoảng 42 MB file và 12 MB lịch sử Git, đo 2026-10-13) và cần quyền đọc GitHub của repo, như khi cài một kit khác.

### Cài từ thư mục

Đường offline: nhận thư mục plugin từ kit owner (`<plugin-dir>`), rồi cài trong Claude Code:

```text
/plugin marketplace add <plugin-dir>
/plugin install spec@product-os-spec-driven
/spec:setup
```

Kit owner tạo thư mục plugin mỏng từ checkout này bằng `node scripts/pack-plugin.mjs --out <new-dir> --dry-run`, sau đó bỏ `--dry-run`. Lệnh chỉ stage file, không publish; loại `plans/`, bằng chứng báo cáo, Git và `node_modules`. Runtime đã đo khoảng 36,2 MB. Marketplace source `./` cần root chứa kit; không có cơ chế cache-ignore được xác nhận trong manifest Claude đã kiểm. Plugin vẫn phân phối chính từ repo này; thư mục mỏng là lựa chọn offline.

### Host đã kiểm

Kết quả dưới đây đo bằng HOME/config tạm, không đổi cấu hình thật. Chỉ smoke `status`; chưa kiểm một phiên PO trả lời hoặc duyệt gate trên từng host.

| Host | Cài / gọi | Smoke trên fixture | Tool hỏi PO |
|---|---|---|---|
| Claude Code 2.1.296 | Hai lệnh `/plugin` ở trên; `/spec:status` | Marketplace + install thành công; model smoke **NOT RUN**: scratch config báo `Not logged in` (0 API tokens). PO đăng nhập trong cấu hình tạm rồi kiểm `/spec:status` trước khi dùng. | `AskUserQuestion` trong phiên tương tác; chưa kiểm bằng một câu trả lời PO trong smoke. |
| Codex 0.162.1 | `node "<plugin-dir>/scripts/install-hosts.mjs" --host codex`; `$spec-status` | **PASS**: nạp skill + chạy status, exit 0. | `request_user_input` khi có trong Plan mode; `request_user_input_async` ở Default mode, được host smoke xác nhận có. |
| Grok 1.0.50 | `node "<plugin-dir>/scripts/install-hosts.mjs" --host grok`; `/spec-status` | **PASS**: discover 8/8 skills, nạp status + chạy lệnh, exit 0 / `end_turn`. | `ask_user_question` được host smoke xác nhận có. |

Codex/Grok dùng tên parity `spec-setup` … `spec-upgrade`, cùng nội dung tám `/spec:*` của Claude. Thêm `--check` vào lệnh installer để chỉ đọc tình trạng cài. Không có tool hỏi người dùng: skill hỏi câu đánh số trong chat và đợi; gate giữ pending, PO tự chạy lệnh trực tiếp. Agent không ghi `agent-ask-user` từ chat thường.

Cơ chế cài theo [Claude plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces), [Codex local skills](https://developers.openai.com/codex/skills) và [Grok skills/Claude compatibility](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/08-skills.md). Các link mô tả host; bảng smoke ghi kết quả thực tế, không suy từ tài liệu.

## 1. Kit làm gì

| Stage UI/UX mặc định | Output | Quyết định |
|---|---|---|
| wireframe | ASCII trong `spec/wireframe/wireframes.md` | PO gate wireframe |
| prototype | HTML offline trong `spec/prototype/index.html` | PO gate prototype |


```text
input/po-spec.md
   │
intake (G1) → clarify → contract (G2) → prd → us → wireframe → prototype → [design] → tdd (G3) → [uiux] (G4) → handoff (G5)
```

`[ ]` là stage tắt mặc định. Trong mỗi stage, runner làm bốn bước:

1. **Writer** viết output của stage từ context đã khai trong `config/pipeline.yaml`.
2. **Lint** kiểm cấu trúc. Lint đỏ thì writer sửa; tối đa 3 lượt sửa.
3. **Reviewer** (khác hãng, phiên mới, chỉ đọc) chấm theo rubric. Có finding thì writer sửa; tối đa 3 lượt review.
4. **Gate:** runner ghi `review/gates/<stage>.md` là `GATE: PENDING` rồi dừng chờ PO. Stage không cần người duyệt thì ghi `GATE: NOT_REQUIRED` và đi tiếp.

PO đọc output, rồi duyệt, yêu cầu sửa, hoặc cho thêm lượt khi hết lượt. Runner chạy lại từ chỗ đã dừng.

| Vai | Ai | Làm gì |
|---|---|---|
| PO | người | Viết spec thô, trả lời câu hỏi, duyệt gate bằng `decide.mjs` |
| Writer | `codex`, `claude` hoặc `manual` | Viết output của stage |
| Reviewer | `grok`, `claude`, `codex` hoặc `manual` | Chấm output, ghi finding |
| Runner | `tools/run/run.mjs` | Gọi writer, lint, reviewer; giữ lượt, timeout, gate, audit |

## 2. Cài thủ công (archive, một lần mỗi máy)

### 2.1. Cần có

| Thứ | Ghi chú |
|---|---|
| Node >= 18 | `node --version` |
| npm và mạng | Một lần mỗi project, để cài Ajv |
| `codex` | Writer mặc định. Có trên PATH, đã đăng nhập |
| `grok` hoặc `claude` | Reviewer. Có trên PATH, đã đăng nhập |
| Chrome/Chromium cho Playwright | Không bắt buộc. Chỉ cần khi chụp ảnh reader |

Doctor không đăng nhập giúp và không gọi model. Đăng nhập từng CLI theo cách của CLI đó trước khi chạy.

### 2.2. Giải nén archive

Kit owner phát một file `spec-driven-kit-<version>-<commit>.tar.gz` kèm `SHA256SUMS`. Chỉ dùng archive mới nhất kit owner phát.

```sh
shasum -a 256 spec-driven-kit-<version>-<commit>.tar.gz
mkdir -p ~/spec-driven-kit
tar xzf spec-driven-kit-<version>-<commit>.tar.gz -C ~/spec-driven-kit
cd ~/spec-driven-kit
```

Số `shasum` in ra phải trùng dòng tương ứng trong `SHA256SUMS`. Khác thì đừng giải nén; hỏi kit owner.

Từ đây, mọi lệnh `node tools/run/...` chạy trong thư mục kit này (`~/spec-driven-kit`), trừ khi mục ghi khác.

### 2.3. Doctor trên máy

```sh
node tools/run/doctor.mjs
```

Kết quả mẫu trên máy chưa có Ajv:

```text
PASS Node: 24.13.1 (requires >=18)
NOT RUN kit: unknown (no lock)
FAIL Ajv 2020: set SPEC_AJV_MODULE to an installed ajv/dist/2020 module or make ajv/dist/2020 resolvable in this project
NOT RUN Playwright: reader verify/screenshots unavailable (...)
PASS writer: manual; no agent CLI required
PASS reviewer: manual; no agent CLI required
```

Ở bước này, `FAIL Ajv 2020` và `NOT RUN kit` là bình thường: Ajv cài vào project ở mục 3.3. Đi tiếp.

`FAIL Node: <phiên bản>; use Node >=18 and rerun doctor` thì cài Node >= 18 rồi chạy lại.

Mã thoát của doctor: 0 là mục bắt buộc đạt, 1 là một mục bắt buộc hỏng, 2 là không kiểm được project hoặc tùy chọn. `NOT RUN` của Playwright không làm doctor thoát 1.

## 3. Bắt đầu một dự án

Một sản phẩm là một project, nhiều feature theo thời gian. `<dir>` là thư mục project: trống, nằm ngoài thư mục kit, không phải symlink.

### 3.1. Tạo project

Writer Codex, reviewer Grok (cấu hình đã chạy thật):

```sh
node tools/run/init.mjs --project <dir> --name "<tên dự án>" --lang vi --writer codex --reviewer grok
```

Writer Codex, reviewer Claude Code:

```sh
node tools/run/init.mjs --project <dir> --name "<tên dự án>" --lang vi --writer codex --reviewer claude
```

| Cờ | Giá trị |
|---|---|
| `--lang` | `vi` hoặc `en` |
| `--writer` | `codex`, `claude` hoặc `manual` |
| `--reviewer` | `grok`, `claude`, `codex` hoặc `manual`. Nên khác hãng với writer |

Grok chỉ làm reviewer. `--writer grok` thoát 3: `Grok is reviewer-only; no grok writer is shipped. Select --writer codex|claude|manual with --reviewer grok.`

Reviewer Grok mặc định model `grok-4.7`, reviewer Claude mặc định `sonnet`. Init thành công in dòng `Run: node tools/run/run.mjs --project "<dir>" --head fresh-source --build not-built`; giữ lệnh đó.

### Nạp tài liệu đã có

`/spec:new` hỏi PO có context dự án không sau init và doctor. Chọn không có/chưa rõ, folder hoặc các file đã chuẩn bị. Agent xem kế hoạch bằng `load-context.mjs --dry-run`, hỏi PO xác nhận rồi chép nguyên byte; PO tự export/tinh gọn bên ngoài kit.

`context/sources/` dành cho docs, spec trước, glossary, luật nghiệp vụ và trích đoạn code; intake–us đọc nhóm này. `context/ui/` dành cho HTML, DS tokens, component/frame/flow; wireframe, prototype, design và uiux đọc nhóm đó. Thư mục vắng/trống được bỏ qua. Văn bản UTF-8 tối đa 65.536 byte/file, 262.144 byte/nhóm (kể cả đã nạp); ảnh/PDF/DOCX/Figma thô phải được PO xuất/mô tả thành text. Không nạp secrets, dữ liệu cá nhân hoặc cả repo. [Hướng dẫn chuẩn bị context](context-guide.md).

```sh
node tools/run/load-context.mjs --project "<dir>" --kind sources --from "<prepared-dir>" --dry-run
node tools/run/load-context.mjs --project "<dir>" --kind sources --from "<prepared-dir>"
```

Một xung đột, format sai hoặc vượt cap làm cả đợt thoát 3 không ghi. File cùng byte là no-op. Nạp sau approval làm cũ đúng các gate đọc context; output đổi có thể làm cũ gate phụ thuộc.

### 3.2. Khai email PO

Mở `<dir>/config/pipeline.yaml`. Thêm email thật của PO dưới `roles.po`:

```yaml
roles:
  po:
    enabled: true
    gate: true
    approvers:
      - "<po-email>"
```

Chỉ email trong danh sách này chạy được `decide.mjs`. Thêm sau cũng được; gate đã có không bị coi là cũ. Sau khi sửa approvers, doctor vẫn in `kit: current`; `WARN kit: drift` chỉ đến từ sửa phần kit trong config (ví dụ stage context) hoặc file kit khác.

### 3.3. Cài Ajv và doctor trên project

```sh
(cd <dir> && npm install ajv@8)
node tools/run/doctor.mjs --project <dir>
```

Phải thấy `PASS Ajv 2020: Draft 2020-12 schema compiles`, và writer, reviewer `PASS` với chữ `available (not invoked)`. Doctor thoát 0 thì đi tiếp.

### 3.4. Đặt spec thô

Mở `<dir>/input/po-spec.md`. Xóa nội dung mẫu, dán spec thô của PO, giữ đúng tên file. Đây là nguồn spec chính của stage `intake`; tài liệu đã chuẩn bị có thể nạp bổ sung vào `context/sources/`.

Viết spec để writer không phải đoán:

- Đánh số mục (`§1.2`, `§6.1`…). Writer và reviewer trích theo số mục.
- Luật nghiệp vụ, con số, ngưỡng, quyền: ghi rõ. Chỗ chưa chốt thì ghi "chưa chốt".
- Đoạn phải giữ nguyên văn (công thức, câu thông báo, bảng quyền): ghi rõ là nguyên văn.

### 3.5. Chạy lần đầu

```sh
node tools/run/run.mjs --project <dir> --head fresh-source --build not-built
```

- `--head fresh-source`: archive không có git, nên phải ghi `--head`. Giữ đúng chữ này cho tới khi project nằm trong git.
- `--build not-built`: spec trước khi có code.

Spec thật mất khoảng 30–75 phút cho một stage. Để terminal chạy. Mỗi lần gọi model có timeout 25 phút (wrapper) và 30 phút (runner).

## 4. Vòng làm việc: chạy, dừng, quyết, chạy lại

```text
run.mjs ──► exit 2 (chờ PO) ──► PO đọc ──► decide.mjs ──► run.mjs lần nữa
   │
   ├─ exit 0: các stage đang bật đã xong, gate còn đúng
   ├─ exit 3: input/cấu hình sai → sửa đúng chỗ runner in → chạy lại
   └─ exit 4: CLI/tác tử hỏng → mục 9 → chạy lại
```

### 4.1. Mã thoát của runner

| Mã | Nghĩa | PO làm |
|---|---|---|
| 0 | Các stage đang bật đã xong, gate còn đúng | Đọc file gate. Đây chưa phải nghiệm thu production |
| 2 | Chờ người: gate `PENDING`, checkpoint manual, hoặc hết lượt | Đọc dòng runner in, làm theo mục 4.3–4.4 |
| 3 | Cấu hình, input hoặc gate sai | Đọc khóa/file runner in, sửa đúng chỗ đó, chạy lại |
| 4 | Công cụ hoặc tác tử hỏng, kể cả timeout | Mục 9. Timeout là lỗi, không phải xong |

Mã của doctor (mục 2.3) khác mã của runner.

### 4.2. Đọc kết quả

| Ở đâu | Có gì |
|---|---|
| `<dir>/spec/` | Output các stage (`intake/`, `decisions/`, `contract/`, `prd/`, `us/`, `tests/`, `delivery/`…) |
| `<dir>/review/gates/<stage>.md` | Gate: dòng đầu là trạng thái, kèm finding. Lệnh `decide.mjs` không nằm trong file; runner in nó ra terminal ở lần dừng đó |
| `<dir>/review/log/<stage>-review-<n>.txt` | Nguyên văn lượt review thứ n |
| `<dir>/review/log/` | Log lint/eval và review |

Xem spec dạng trang web. Chạy trong `<dir>`; `<view-dir>` là thư mục nằm ngoài project, chạy lại thì bản xem được ghi đè:

```sh
cd <dir>
node tools/reader/render.mjs spec --out <view-dir> --offline
```

Mở `<view-dir>/offline/index.html` bằng trình duyệt. Trang có view PO, Dev, QA, Open items (câu hỏi còn mở) và Coverage. Lint đỏ thì render từ chối; đó là tín hiệu spec chưa qua cấu trúc.

### 4.3. Dòng đầu của file gate

| Dòng đầu | Ai ghi | Lần chạy sau |
|---|---|---|
| `GATE: PENDING` | runner | Giữ nguyên, thoát 2 |
| `GATE: APPROVED` | PO qua `decide.mjs`, có email và thời điểm | Đi tiếp khi hash, eval và review còn đúng |
| `GATE: CHANGES_REQUESTED` | PO qua `decide.mjs`, kèm yêu cầu sửa | Chạy lại stage với yêu cầu đó |
| `GATE: NOT_REQUIRED` | runner | Đi tiếp khi kiểm tra còn đúng |

Dòng đầu khác bốn giá trị trên: runner thoát 3 trước khi chạy stage. Nội dung output hoặc nguồn đổi sau khi duyệt thì gate thành cũ (STALE) và stage chạy lại.

### 4.4. Quyết định của PO

PO tự chạy `decide.mjs` với email trong `roles.po.approvers`, hoặc dùng `/spec:gate`: agent trình gate, review/finding rồi hỏi Approve / Request changes / Continue qua tool hỏi người dùng. Chỉ sau lựa chọn của PO trong **cùng phiên** (và reason/follow-up riêng cho từng Minor), agent chạy lệnh khớp lựa chọn với `--confirmed-via ask-user`. Quyết định và audit ghi `channel: agent-ask-user`; lệnh PO trực tiếp ghi `direct`, bản ghi cũ không có channel được hiểu là `direct`. Ngoài đường này agent không chạy decide và không thêm `--as`. `--as` cùng channel là tự khai cục bộ, không phải xác thực hay bằng chứng mật mã của tool.

Khi gate `PENDING`, runner in sẵn lệnh, điền đường dẫn project và từng id Minor còn mở. Thay `<po-email>` và lý do.

Duyệt (không còn finding Minor mở):

```sh
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --approve
```

Duyệt và chấp nhận finding Minor (lặp bộ ba cờ cho mỗi id còn mở):

```sh
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --approve --accept-minor <finding-id> --reason "<text>" --follow-up "<text>"
```

Yêu cầu sửa:

```sh
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --request-changes "<text>"
```

Hết lượt (runner in `cap exhausted` hoặc `NEEDS_CHANGES; inspect …review-3`; lúc này có thể chưa có gate). Đọc file review được in, rồi chọn: cho thêm một lượt, hoặc dừng stage.

```sh
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --continue --reason "<text>"
```

Mỗi `--continue` thêm đúng một lượt sửa + eval + review độc lập, có hạn 30 ngày. Lệnh chỉ nhận khi stage đã hết lượt. Nó không duyệt gate, không bỏ qua finding Critical/Major hay tiêu chí bắt buộc. Counters không reset.

Lệnh được nhận thì in đường dẫn đã ghi và lệnh `run.mjs` tiếp theo. Chạy lệnh đó. Bị từ chối: thoát 3, không ghi file.

`node tools/run/decide.mjs --help` in đủ các dạng lệnh.

## 5. Làm từng stage

Nhãn: **đã chạy thật** = đã chạy hết với model thật trên dự án thật; **chưa chứng minh** = có code và test, chưa chạy trên dự án thật; **tắt** = tắt mặc định. Stage chưa chứng minh mà gặp việc README không nêu: dừng và hỏi kit owner.

### intake — G1 · đã chạy thật

- **Vào:** `input/po-spec.md` và `context/sources/` nếu có.
- **Ra:** `spec/spec.manifest.json`, `spec/README.md`, `spec/intake/intake.md`, `spec/glossary.md`, `spec/decisions/decisions.md`.
- **PO kiểm:** mọi mục của spec thô đều có mặt trong intake; đoạn cần nguyên văn vẫn nguyên văn; thuật ngữ đúng nghĩa; câu hỏi `Q-xxx` trong `decisions.md` đúng là điều chưa chốt.
- **Quyết:** duyệt G1, hoặc `--request-changes` nêu mục còn thiếu.
- **Lưu ý:** trên spec thật (~17 KB) writer từng bỏ sót đoạn nguồn nguyên văn qua cả 3 lượt sửa. Gặp trường hợp này, đọc review cuối rồi chọn `--continue` hoặc dừng; kit owner đang sửa prompt writer (P14).

### clarify — chưa chứng minh

- **Vào:** spec thô, `decisions.md`, `glossary.md`.
- **Ra:** `spec/decisions/decisions.md` (câu hỏi và câu trả lời), cập nhật `spec/intake/intake.md`.
- **PO làm:** trả lời câu hỏi. Xem mục 6.

### contract — G2 · chưa chứng minh

- **Vào:** `spec/intake/`, `decisions.md`, `glossary.md`.
- **Ra:** `spec/contract/contract.md`.
- **PO kiểm:** luật sản phẩm, phạm vi, ràng buộc khớp spec thô và các câu đã trả lời. Không có luật nào model tự thêm.

### prd — chưa chứng minh

- **Vào:** `spec/contract/`.
- **Ra:** `spec/prd/prd.md` với id `REQ`, nối được về contract.
- **PO kiểm:** mỗi yêu cầu có nguồn trong contract; không có yêu cầu mồ côi.

### us — G3 (cùng tdd) · chưa chứng minh

- **Vào:** `spec/prd/`.
- **Ra:** `spec/us/INDEX.md`, `spec/us/<US-id>.md`, `spec/readable/release.md`, `spec/readable/epic-<n>.md`, `spec/readable/epic-map.json`.
- **PO kiểm:** AC dạng Given/When/Then kiểm được; điểm chưa rõ giữ `OPEN:`; điểm đổi kết quả nghiệm thu giữ `OPEN[blocking]:`. `OPEN[blocking]` chặn G3.

### wireframe — chưa chứng minh

- **Vào:** US, PRD, quyết định, glossary và `context/ui/` nếu có.
- **Context đã có:** trước lần đầu chạy wireframe, `/spec:run` hỏi HTML/app pages, tokens DS, component list hoặc exports Figma; xem [hướng dẫn](context-guide.md). Chọn không có vẫn chạy được. Lựa chọn lưu trong `input/context-intake.json` nên lần sau không hỏi lại, không làm cũ gate chỉ vì ghi lựa chọn.
- **Ra:** đúng một file `spec/wireframe/wireframes.md`: danh sách SCR-<nnn>, US/AC nguồn, một flow mỗi US và ASCII cho normal / empty / error / loading (hoặc `N/A: <reason>`).
- **PO kiểm:** mọi màn/flow và AC được phủ, không thêm luật mới; duyệt gate `wireframe` riêng. Stage bật mặc định, không cần design adapter.

### prototype — chưa chứng minh

- **Vào:** wireframe đã duyệt, US và glossary.
- **Ra:** đúng một file `spec/prototype/index.html`, mở offline trong trình duyệt. Start page nối từng flow bằng anchors; mỗi section SCR-nnn--state hiển thị US/AC nguồn.
- **PO kiểm:** đi hết flow, rỗng/lỗi/loading và link; duyệt gate `prototype` riêng trước tdd. Mặc định system font và xám lo-fi, không JavaScript hay URL ngoài.
- **Design system:** nạp token file `.json` đã chuẩn bị vào `context/ui/`; wireframe và prototype dùng context này. Path DS bắt buộc của adapter vẫn chuẩn bị riêng khi bật design/uiux. Hai stage chưa chạy với model thật.

### design — tắt

Thiết kế UX và ui-contract. Cần thư mục `context/design/` và design system. Muốn bật thì hỏi kit owner.

### tdd — G3 · chưa chứng minh

- **Vào:** `spec/us/`, wireframe và prototype; scenario cite SCR ids.
- **Ra:** `spec/tests/cases/<US-id>.md`, cập nhật scenario trong `spec/us/<US-id>.md`, `review/evidence/tdd.json`.
- **PO/QC kiểm:** mỗi AC có scenario; scenario kiểm được kết quả, không chỉ kiểm có file.

### uiux — G4 · tắt

Nghiệm thu UI trên build thật, cần revision build thật thay cho `not-built`. Bật khi thiếu design, tdd hoặc `design_system` thì thoát 3. Hỏi kit owner trước khi bật.

### handoff — G5 · chưa chứng minh

- **Vào:** contract, PRD, US, readable, `spec/reviews/`, gates.
- **Ra:** `spec/delivery/handoff.md`, `spec/delivery/baseline-manifest.json`, `spec/delivery/receiver-records.json`.
- **Context:** wireframe và prototype đi vào bàn giao. Khi design và uiux tắt, `spec/reviews/` chưa có được bỏ qua theo producer map; không cần tạo file review giả.
- **Trước G5:** thay baseline chưa xuất bản trong `review/baseline.json` (`id`, `head`, `manifest`) bằng snapshot bất biến thật. Chưa rõ nội dung thì hỏi kit owner.

## 6. Câu hỏi làm rõ

Câu hỏi nằm ở `spec/decisions/decisions.md` (`Q-001`, `Q-002`…) và trang Open items của reader. Chỉ PO trả lời. Câu chưa trả lời giữ `OPEN:`. Câu làm đổi kết quả nghiệm thu giữ `OPEN[blocking]:` và chặn G3. Agent không tự điền một phương án chưa duyệt.

Dùng `/spec:clarify <dir>`. Skill đọc các Q chưa trả lời qua status và sổ quyết định, hỏi PO từng quyết định bằng tool hỏi người dùng (tối đa 4 câu/vòng, recommendation có nguồn đứng đầu). PO chọn để sau thì Q giữ mở. Agent chỉ ghi câu PO vừa trả lời cùng email, ngày và nguồn vào `<dir>/input/answers.md`:

```markdown
| Q | Answer | Decided by | Date | Note |
|---|---|---|---|---|
| Q-001 | <câu PO trả lời> | <po-email> | YYYY-MM-DD | channel: agent-ask-user |
```

Chạy `/spec:run` để stage clarify chuyển nguồn đó vào `spec/decisions/decisions.md` và clarify record: `answer`, `decided_by`, `decided_at`, `decision_ref: input/answers.md#Q-001`. Thiếu hàng trả lời thì vẫn mở; agent không chọn theo recommendation. Không sửa tay generated `decisions.md`. `input/answers.md` không nằm trong intake context nên trả lời không làm stale G1; các stage sau đọc quyết định cũng đọc nguồn này.

Đường ghi/đọc, binding nguồn và giữ G1 đã kiểm trên fixture; chất lượng clarify với model thật và một phiên PO tương tác chưa được chứng minh. Nếu host không có tool hỏi người dùng, skill hỏi câu đánh số trong chat, đợi PO trả lời và hướng dẫn PO tự ghi nguồn; agent không giả lập channel tool.

## 7. Không có CLI: chế độ manual

Init với `--writer manual --reviewer manual`. Runner in prompt rồi thoát 2:

```text
Manual writer: save the response, rerun --result <project-relative-file>. Waiting at review/manual/intake.json
```

1. Dán prompt vào một phiên chat mới.
2. Lưu câu trả lời vào một file **trong** `<dir>`, ví dụ `<dir>/response.txt`.
3. Chạy lại:

```sh
node tools/run/run.mjs --project <dir> --head fresh-source --build not-built --result response.txt
```

Runner in lệnh thì chạy đúng lệnh đó. Lượt reviewer: dán prompt vào một chat **mới**, rồi thêm `--independent-review` vào lệnh `--result`. Thiếu cờ này, review bị ghi là không độc lập và gate không đóng được nghiệm thu.

## 8. Nâng cấp kit

Giải nén archive mới vào thư mục mới, rồi chạy từ thư mục kit mới:

```sh
node tools/run/init.mjs --project <dir> --upgrade --dry-run
node tools/run/init.mjs --project <dir> --upgrade
node tools/run/doctor.mjs --project <dir>
```

- `--dry-run` không ghi file. `already current` nghĩa là không có gì để ghi.
- Upgrade giữ nguyên input, spec, review, gate, quyết định và counters; sửa `config/pipeline.yaml` tại chỗ, giữ comment.
- Nâng cấp giữa hai stage khi có thể. Đổi kit khi stage đang dở làm stage đó viết lại và tốn một lượt sửa.
- Kit cũ hơn thoát 3: `Refusing kit downgrade: recorded <version> (<commit>), source <version> (<commit>)`. Không có cờ hạ cấp.

## 9. Troubleshoot

Đọc dòng runner in cuối cùng, tìm trong bảng. Câu in ra là tiếng Anh, giữ nguyên văn.

### 9.1. Cài đặt và tạo project

| Runner/doctor in | Mã | Làm gì |
|---|---|---|
| `FAIL Node: <phiên bản>; use Node >=18 and rerun doctor` | doctor 1 | Cài Node >= 18, chạy lại doctor |
| `FAIL Ajv 2020: set SPEC_AJV_MODULE …` | doctor 1 | `(cd <dir> && npm install ajv@8)`, chạy lại doctor với `--project <dir>`. Hoặc đặt `SPEC_AJV_MODULE` tới `ajv/dist/2020` đã cài |
| `FAIL <writer\|reviewer>: <cli> unavailable; put it on PATH …` | doctor 1 | Cài CLI, đưa lên PATH, đăng nhập. Hoặc chọn `manual` |
| `NOT RUN Playwright: …` | không lỗi | Chỉ cần khi chụp ảnh reader. Làm theo câu in: `set PLAYWRIGHT_FROM=…`, rồi `npx playwright install chromium` |
| `WARN kit: drift (N files)` | không lỗi | Cảnh báo: phần kit trong config hoặc file kit đã đổi. Sửa approvers không gây cảnh báo này khi `kit.lock.json` đã có `configDigest` (init hoặc upgrade từ bản này). Lock cũ chưa có `configDigest` vẫn so cả file config cho tới lần upgrade kế tiếp; sửa lại nếu không cố ý |
| `Target is non-empty; use another empty directory or --force …` | 3 | Dùng thư mục trống khác. Lần đầu không dùng `--force` |
| `Target overlaps the source kit` | 3 | Đặt project ngoài thư mục kit |
| `Grok is reviewer-only; …` | 3 | Dùng `--writer codex` hoặc `claude` với `--reviewer grok` |

Lint hai stage: `W-FLOW` (thiếu/sai flow hoặc screen), `W-TRACE` (US/AC không có nguồn), `W-SCREEN` (screen trùng/rỗng), `W-STATE` (thiếu state/ASCII/N/A reason). Sửa `wireframes.md` theo `templates/wireframe.md` rồi chạy lại stage.

| Lint in | Làm gì |
|---|---|
| `W-FLOW` / `W-TRACE` | Khớp mỗi US với một flow và giữ US/AC có thật trong nguồn |
| `W-SCREEN` / `W-STATE` | Giữ SCR ids duy nhất và đủ ASCII hoặc N/A reason cho bốn states |
| `W-INPUT` / `P-INPUT` | Khôi phục file output literal của stage |
| `P-SCREEN` | Vẽ layout wireframe thành khung screen với header, fields, buttons, rows và state message; trace ngoài khung |
| `P-ELEMENT` | Dùng đúng allow-list trong templates/prototype.md; bỏ tag ngoài grammar, dùng controls readonly/disabled và metadata cho charset/viewport |
| `P-STATE` / `P-TRACE` | Khớp section screen×state và US/AC với wireframe |
| `P-ANCHOR` / `P-FLOW` | Sửa href trỏ id có thật và đường đi anchors từ start |
| `P-OFFLINE` | Bỏ URL/resource/script, dùng một style inline và anchors |

### 9.2. Khi chạy

| Runner in | Mã | Làm gì |
|---|---|---|
| `--head required outside a git worktree` | 3 | Thêm `--head fresh-source` |
| `--build required (use not-built for pre-code review)` | 3 | Thêm `--build not-built` |
| `<stage>: GATE: PENDING -> review/gates/<stage>.md` hoặc `Waiting: review/gates/<stage>.md (GATE: PENDING)` | 2 | Đọc gate, chạy lệnh `decide.mjs` (mục 4.4) |
| `Fix cap exhausted at <stage>; …` hoặc `Review cap exhausted at <stage>; …` | 2 | Đọc review cuối, rồi PO `--continue` hoặc dừng stage |
| `<stage>: NEEDS_CHANGES; inspect review/log/<stage>-review-3.txt` | 2 | Như trên. Finding Critical/Major không cho tạo gate |
| `<stage>: source/context changed after last review; …` | 2 | Nguồn đổi sau review cuối khi đã hết lượt. Chạy lệnh recovery được in |
| `Manual writer: save the response, rerun --result …` | 2 | Mục 7 |
| `<file>: --result does not match the pending prompt/input/phase` | 3 | File trả lời không thuộc bước đang chờ hoặc input đã đổi. Lấy prompt mới runner in, trả lời lại |
| `Runtime busy at <stage>; retry after the current attempt settles` | 2 | Một lần chạy khác đang chạy stage này. Chờ nó xong. Không chạy hai `run.mjs` cùng project |
| `Missing or empty context/selection: spec/reviews/` | 3 | Handoff bị chặn trên cấu hình mặc định (mục 5). Báo kit owner |
| `scope-version-required: <definition>` | 2 | Danh sách file của stage đổi (thêm, xóa, đổi tên). Dừng, không viết tay file definition; hỏi kit owner |
| `<file>: invalid first gate line …` | 3 | File gate bị sửa tay. Hỏi kit owner; đừng tự viết lại |

### 9.3. CLI và model

| Runner in | Mã | Làm gì |
|---|---|---|
| `Writer not runnable: <cmd>; …` | 4 | Chạy `doctor --project <dir>`. Kiểm CLI còn trên PATH và còn đăng nhập (chạy thử CLI đó trong terminal). Rồi chạy lại `run.mjs` |
| `Reviewer not runnable: <cmd>; …` | 4 | Như trên. Lần gọi reviewer hỏng vẫn tính một lượt review |
| `Reviewer format repair not runnable: …` | 4 | Lần gọi reviewer để sửa định dạng bị hỏng (CLI lỗi, timeout). Xử lý như `Reviewer not runnable` |
| `<lỗi định dạng>; raw output: review/log/<stage>-review-<n>-format-repair.txt` | 4 | Reviewer trả sai định dạng hai lần. Chạy lại một lần; lặp lại thì báo kit owner kèm file đó |
| `Eval tool failure: <command>; see <report>` | 4 | Lệnh lint/eval không chạy được. Đọc file report. Thường do thiếu Ajv trong project |
| `Command not runnable: <command>: ENOENT` | 4 | Lệnh agent không tìm thấy. Kiểm PATH, hoặc chạy lại doctor |
| Thoát 4 sau khoảng 25–30 phút | 4 | Timeout. Chạy lại một lần. Lặp lại thì báo kit owner kèm `review/log/` |

### 9.4. Quyết định

| `decide.mjs` in | Làm gì |
|---|---|
| `Unrecognized PO authority --as` | Email `--as` phải trùng hệt một dòng trong `roles.po.approvers` (mục 3.2) |
| `<stage>: current PENDING gate required` | Gate chưa ở `PENDING`. Chạy `run.mjs` trước. Hết lượt thì dùng `--continue` |
| `<stage>: Critical/Major finding blocks decision` | Không duyệt được. Dùng `--request-changes` hoặc chờ sửa |
| `Every open Minor must be accepted with reason and follow-up` | Thêm `--accept-minor <id> --reason "…" --follow-up "…"` cho từng id còn mở |
| `<stage>: stale gate; source/context/output/config changed after review` | Output hoặc nguồn đổi sau review. Chạy lại `run.mjs` |
| `<stage>: continuation requires an exhausted review or fix cap` | Stage chưa hết lượt. Chạy `run.mjs` bình thường |

### 9.5. Nâng cấp

| Runner in | Làm gì |
|---|---|
| `Upgrade locked by holder pid <n>, start <time> (looks exited); confirm that process has exited, then delete <file> and rerun` | Xác nhận process đã thoát, xóa `<dir>/.kit-upgrade.lock`, chạy lại |
| `… (looks live) …` | Không xóa lock. Chờ process kia xong |
| `Config conflict: <key>; project and new kit both changed the installing default` | Thoát 3, không ghi. Hỏi kit owner về khóa đó |
| `Refusing kit downgrade: …` | Dùng archive mới hơn |

Vẫn kẹt: gửi kit owner dòng runner in cuối, mã thoát, và thư mục `<dir>/review/log/`.

## 10. Việc không được làm

- Không sửa tay output của stage (`spec/…`) và file gate (`review/gates/…`).
- Ngoài `/spec:gate` sau lựa chọn PO qua tool hỏi trong cùng phiên, không để agent chạy `decide.mjs`, thêm `--as`, hay ghi `accepted-minor`.
- Không xóa `review/` để lấy lại lượt. Counters không reset.
- Không dùng `--writer grok` hoặc `--agent grok`.
- Không chạy hai `run.mjs` cùng lúc trên một project.
- Không xóa `.kit-upgrade.lock` khi holder còn `looks live`.

## 11. Cho kit owner

Đóng archive phát hành từ git checkout sạch (lệnh từ chối cây có thay đổi chưa commit, thoát 3):

```sh
node tools/release/pack.mjs --out <releases-dir>
```

- Tăng patch version trong `tools/package.json` (và `package-lock.json`) trước mỗi lần đóng (D51), để archive xếp được thứ tự.
- Lệnh ghi `spec-driven-kit-<version>-<shortsha>.tar.gz` và `SHA256SUMS`. Phát cả hai.
- Smoke trước khi phát: giải nén vào thư mục trống, chạy mục 2.3 → 3.5.

Test (trong repo kit; lint/reader cần `SPEC_AJV_MODULE`):

```sh
node --test tools/run/test/
(cd tools && npm test)
node --test tools/release/test/
```

Chi tiết runner, wrapper và hợp đồng review: [tools/run/README.md](../tools/run/README.md).

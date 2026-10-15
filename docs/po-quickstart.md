# Tra lệnh nhanh

Hướng dẫn đầy đủ (cài đặt, bắt đầu dự án, từng stage, troubleshoot): [README.md](../README.md). Trang này chỉ gom lệnh để chép.

## Cài bằng plugin

Trong Claude Code:

```text
/plugin marketplace add jangtrinh/product-os-spec-driven
/plugin install spec@product-os-spec-driven
/spec:setup
/spec:new
/spec:run
/spec:clarify
/spec:gate
```

Lần đầu add clone toàn bộ repo (khoảng 42 MB file và 12 MB lịch sử Git, đo 2026-10-13) và cần quyền đọc GitHub, như một kit khác.

Tra gate/counters: `/spec:status`; xem: `/spec:view`; preview rồi hỏi PO nâng cấp: `/spec:upgrade`. Codex/Grok dùng tên `spec-<command>`; cách cài và kết quả smoke từng host ở [PO guide §Cài bằng plugin](po-guide.md#cài-bằng-plugin).

Câu trả lời là nguồn PO `input/answers.md`; không sửa generated decisions. Gate được ghi qua tool hỏi dùng channel `agent-ask-user`; trực tiếp và legacy = `direct`.

### Cài từ thư mục

Offline: kit owner chạy `node scripts/pack-plugin.mjs --out <new-dir> --dry-run`, xem danh sách rồi bỏ `--dry-run`; gửi thư mục mỏng cho PO. Trong Claude Code:

```text
/plugin marketplace add <plugin-dir>
/plugin install spec@product-os-spec-driven
/spec:setup
```

## Cài thủ công

Chạy mọi lệnh `node tools/run/...` từ thư mục kit đã giải nén. `<dir>` là thư mục project: trống khi init, nằm ngoài kit, không phải symlink. Thay `<po-email>` bằng email có trong `roles.po.approvers`.

## Cài và tạo project

```sh
node tools/run/doctor.mjs
node tools/run/init.mjs --project <dir> --name "<tên dự án>" --lang vi --writer codex --reviewer grok
(cd <dir> && npm install ajv@8)
node tools/run/doctor.mjs --project <dir>
```

Sau init: thêm email PO vào `roles.po.approvers` trong `<dir>/config/pipeline.yaml` ([PO guide §3.2](po-guide.md#32-khai-email-po)), rồi dán spec thô vào `<dir>/input/po-spec.md`. Doctor in `kit: current` sau khi sửa approvers; `WARN kit: drift` chỉ khi sửa phần kit trong config (ví dụ stage context) hoặc file kit khác.

Init từ chối thư mục không trống (`Target is non-empty; use another empty directory or --force to copy only missing kit files`) và thư mục trùng kit (`Target overlaps the source kit`). Lần đầu không dùng `--force`; `--force` chỉ chép file kit còn thiếu, giữ nguyên mọi file đã có. Init trên project đã có config với `--writer`/`--reviewer`/`--agent` khác config thì thoát mã 3, không ghi gì, và in dòng `agents.<role>.command` cần sửa tay.

## Nạp context đã chuẩn bị

PO tự chuẩn bị text theo [context-guide.md](context-guide.md); skill hỏi và xin xác nhận kế hoạch trước khi chép. Tối đa 65.536 byte/file, 262.144 byte/nhóm tính cả file đã nạp.

```sh
node tools/run/load-context.mjs --project "<dir>" --kind sources --from "<prepared-dir>" --dry-run --json
node tools/run/load-context.mjs --project "<dir>" --kind sources --from "<prepared-dir>"
node tools/run/load-context.mjs --project "<dir>" --kind ui --from "<page.html>" --from "<tokens.json>" --dry-run
node tools/run/load-context.mjs --project "<dir>" --kind ui --from "<page.html>" --from "<tokens.json>"
```

## Chạy

```sh
node tools/run/run.mjs --project <dir> --head fresh-source --build not-built
```

`node tools/run/run.mjs --help` in: `--project <root> [--config <path>] --build <rev|not-built> [--head <rev>] [--stage <name>] [--result <file>|--paste <file>] [--supersedes <receipt-id> --reason <text>] [--import-decision <file> --packet-data <file> --as <PO-email>]`.

Timeout mặc định: wrapper 1500000 ms (25 phút), runner 1800000 ms (30 phút). `--timeout-ms <ms>` đặt timeout runner cho lần chạy đó; số nhỏ hơn wrapper làm runner cắt trước và thoát 4, không tự nâng số.

Mã thoát: 0 xong · 2 chờ người · 3 input/cấu hình sai · 4 công cụ/tác tử hỏng ([PO guide §4.1](po-guide.md#41-mã-thoát-của-runner)).

Flow mặc định thêm `us → wireframe → prototype → tdd`: cả hai gate `wireframe` / `prototype` do PO duyệt bằng lệnh dưới. Mở `<dir>/spec/prototype/index.html` offline; chưa chạy với model thật. DS: nạp tokens vào `context/ui/`; `/spec:run` hỏi trước lần đầu wireframe và ghi lựa chọn một lần ở `input/context-intake.json`.

## Quyết định gate (chỉ PO tự chạy)

```sh
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --approve
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --approve --accept-minor <finding-id> --reason "<text>" --follow-up "<text>"
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --request-changes "<text>"
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --continue --reason "<text>"
node tools/run/decide.mjs --help
```

`--continue` chỉ dùng khi runner in `cap exhausted` hoặc `NEEDS_CHANGES; inspect …review-3`: thêm một lượt sửa + eval + review độc lập, không duyệt gate, counters không reset. Bị từ chối: thoát 3, không ghi file. Được nhận: chạy lại `run.mjs`.

## Manual

```sh
node tools/run/run.mjs --project <dir> --head fresh-source --build not-built --result response.txt
node tools/run/run.mjs --project <dir> --head fresh-source --build not-built --result review.txt --independent-review
```

File trả lời nằm trong `<dir>`. `--independent-review` chỉ khi lượt reviewer đã chạy trong chat mới. `--paste <file>` đưa kết quả writer đầu tiên khi chưa có checkpoint.

## Xem spec

```sh
cd <dir>
node tools/reader/render.mjs spec --out <view-dir> --offline
```

Mở `<view-dir>/offline/index.html`.

## Nâng cấp

Chạy từ thư mục kit mới:

```sh
node tools/run/init.mjs --project <dir> --upgrade --dry-run
node tools/run/init.mjs --project <dir> --upgrade
node tools/run/doctor.mjs --project <dir>
```

- Xung đột config thoát 3, không ghi: `Config conflict: <key>; project and new kit both changed the installing default`.
- Kit cũ hơn thoát 3: `Refusing kit downgrade: recorded <version> (<commit>), source <version> (<commit>)`. Không có cờ hạ cấp.
- Còn `.kit-upgrade.lock`: thoát 3, in pid, giờ bắt đầu, `looks live` hoặc `looks exited`, kèm `confirm that process has exited, then delete <file> and rerun`. Chỉ xóa `<dir>/.kit-upgrade.lock` khi holder đã thoát.

## Import quyết định và baseline (chưa chứng minh)

```sh
node tools/run/run.mjs --project <dir> --head fresh-source --build <final-build-rev> --import-decision decision.json --packet-data packet-data.json --as <po-email>
```

PO tự chạy; `/spec:gate` chỉ ghi sau lựa chọn qua tool hỏi người dùng trong cùng phiên, với `--confirmed-via ask-user`. Ngoài đường đó agent không thêm `--as`. Trước G5 hoặc import, thay baseline chưa xuất bản trong `review/baseline.json` (`id`, `head`, `manifest`) bằng snapshot bất biến thật. Chưa rõ thì hỏi kit owner.

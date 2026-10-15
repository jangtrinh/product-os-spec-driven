---
id: <document-id>
type: contract
title: "<title>"
updated: "2026-10-07"
status: draft
---

<Chèn amendment vào contract hiện có. Không tạo nguồn luật thứ hai.>

# Amendment A-<n> (<date>, <source-without-comma>, <D-id>) — <title>

| # | Change (already applied to body) | Affected ids | Source |
|---|---|---|---|
| A<n>-01 | <đã gộp vào body> | <qualified ids> | <source> |

## Change log
<Version, Date, Change, Decision. Giữ nguyên before/history.>

<!-- example: contract/contract.md
---
id: FC-01
type: contract
title: "Contract có amendment"
updated: "2026-10-07"
status: draft
primary: true
amendments: [{id: A-01, summary: "Giữ phạm vi hoãn ở trạng thái chờ"}]
---

## Metadata
| Mục | Giá trị |
|---|---|
| Version | 0.1 |
| Owner | po@example.test |
| Product | pending |
| Temporary authority | SPEC.md §4.5.1; format/packet-interchange.md §4 |
## Vấn đề và kết quả
PO cần giữ phạm vi chưa quyết ở trạng thái chờ.
## Phạm vi và nguồn chuẩn
| ID | Rule | Source |
|---|---|---|
| SC-01 | Hoãn quyết định giữ phạm vi chờ | SPEC.md §4.5.1 |
Nguồn tạm là kit. Chưa có Product Contract riêng. Ngoài phạm vi: tự duyệt hoặc triển khai sản phẩm.
## Nghiệm thu
| ID | Given | When | Then | Source |
|---|---|---|---|---|
| AC-01 | Phạm vi đang chờ | PO chọn hoãn | Phạm vi vẫn chờ | format/packet-interchange.md §4 |
PRD-01, US-01 và US-01.AC-01 mô tả phạm vi ví dụ.
## Flow, UIUX và dependency
Đọc US-01 và tài liệu design. DS chưa được chọn. Không có built evidence ở G2.
## Scenario và bằng chứng
Cách kiểm đã chọn là review. Chưa thực thi hay nghiệm thu G4.
## Bàn giao và giới hạn demo
Không bàn giao cho Dev/QC trước quyết định và bằng chứng đúng phiên bản.
# Amendment A-01 (2026-10-07, po@example.test, D1) — Làm rõ trạng thái chờ
| # | Change (already applied to body) | Affected ids | Source |
|---|---|---|---|
| A01-01 | Giữ phạm vi hoãn ở trạng thái chờ | SC-01, FC-01.AC-01, US-01.AC-01 | D1 |
## Change log
| Version | Date | Change | Decision |
|---|---|---|---|
| 0.2 | 2026-10-07 | Làm rõ trạng thái chờ | D1 |
-->

Quy tắc: PO quyết luật/phạm vi. Mỗi hành vi đổi cần ma trận rule → qualified AC → bước SCN/expected → screen/state/target hoặc no-UI reason/confirmer → test/visual receipt. Reviewer xác minh nghĩa từng hàng ở current pins. Id/tag đúng chưa đủ. Dùng Change Set cho propagation, closure và re-gates.

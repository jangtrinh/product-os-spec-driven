---
id: PRD-01
type: prd
title: "Orders Console — Bộ lọc đã lưu — Yêu cầu sản phẩm"
updated: "2026-10-14"
status: draft
primary: true
trace:
  decisions: [D1, D2, D3, D4]
---

## Vấn đề và kết quả
Nhân viên vận hành đơn hàng cần lưu tổ hợp điều kiện lọc hiện tại thành bộ lọc có tên để dùng lại bằng một lần bấm thay vì chọn lại từng điều kiện.

## Phạm vi
Trong phạm vi: lưu bộ lọc hiện tại với tên (US-01) và dùng lại hoặc xóa bộ lọc đã lưu (US-02). Ngoài phạm vi: chia sẻ bộ lọc và đổi tên bộ lọc.

## Yêu cầu và quy tắc
| ID | Requirement | Source | US |
|---|---|---|---|
| REQ-01 | Cho phép lưu bộ lọc hiện tại với tên dài từ 1 đến 40 ký tự, không trùng tên bộ lọc khác của cùng người dùng, tối đa 20 bộ lọc mỗi người dùng | FC-01.AC-01 | US-01 |
| REQ-02 | Từ chối lưu khi tên rỗng, dài hơn 40 ký tự, trùng tên hoặc đã đủ 20 bộ lọc, và hiển thị lý do ngay tại hộp thoại | FC-01.AC-02 | US-01 |
| REQ-03 | Cho phép áp dụng lại điều kiện của bộ lọc đã lưu bằng một lần bấm và xóa bộ lọc sau khi xác nhận | FC-01.AC-03 | US-02 |

## Flow và dependency
Người dùng lọc danh sách đơn, bấm Lưu bộ lọc để nhập tên, rồi mở danh sách bộ lọc để áp dụng hoặc xóa; kho lưu bộ lọc phân tách theo người dùng.

## Giả định và bàn giao
Không còn câu hỏi mở. Bàn giao đặc tả cho stage US, Wireframe, Prototype, TDD và Handoff.

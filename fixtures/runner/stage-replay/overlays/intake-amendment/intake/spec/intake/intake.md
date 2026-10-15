---
id: saved-filters-intake
type: intake
title: "Orders Console — Bộ lọc đã lưu — Ghi nhận đầu vào"
updated: "2026-10-14"
status: draft
---

## Nguồn và phân loại

| Mục | Giá trị |
|---|---|
| Source | `input/po-spec.md` |
| Sender | po@example.test |
| Time | 2026-10-14T00:00:00Z (chờ PO xác nhận tại [Q-001](../decisions/decisions.md#questions)). |
| Nature | roadmap — chờ PO xác nhận tại [Q-001](../decisions/decisions.md#questions). |
| Handling | Giữ nguyên văn yêu cầu của PO; tách 2 luồng chính US-01 và US-02. |
| Duplicate search | Orders Console hiện chưa có chức năng lưu tổ hợp điều kiện lọc; không có yêu cầu trùng. |
| Reason | Ghi nhận phạm vi bản đầu gồm lưu, áp dụng lại và xóa bộ lọc của chính người dùng. |

### Trích dẫn nguồn nguyên văn

Từ `input/po-spec.md` §1:

> Mục tiêu: cho phép người dùng lưu tổ hợp điều kiện lọc hiện tại thành một bộ lọc có tên và dùng lại bộ lọc đó bằng một lần bấm.

Từ `input/po-spec.md` §2:

> Tên bộ lọc dài từ 1 đến 40 ký tự và không trùng tên bộ lọc khác của chính người dùng đó.

Từ `input/po-spec.md` §3:

> Không chia sẻ bộ lọc giữa nhiều người dùng.

## Vấn đề và kết quả

Nhân viên vận hành đơn hàng phải chọn lại trạng thái, kênh bán và khoảng ngày mỗi lần mở danh sách đơn. Kết quả mong đợi của bản đầu là người dùng lưu tổ hợp điều kiện hiện tại với tên dài từ 1 đến 40 ký tự, giữ tối đa 20 bộ lọc, áp dụng lại bằng một lần bấm và xóa bộ lọc không còn dùng.

## Giới hạn

- Số bộ lọc tối đa cho mỗi người dùng (20) chờ PO chốt tại [Q-002](../decisions/decisions.md#questions).
- Độ dài tên bộ lọc (1 đến 40 ký tự, không trùng) chờ PO chốt tại [Q-003](../decisions/decisions.md#questions).

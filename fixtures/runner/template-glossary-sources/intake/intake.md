---
id: saved-filters-intake
type: intake
title: "Saved filters — Ghi nhận đầu vào"
updated: "2026-10-14"
status: draft
---

## Nguồn và phân loại

| Mục | Giá trị |
|---|---|
| Source | `input/po-spec.md`, `context/sources/domain-context.md` |
| Sender | owner@example.test |
| Time | 2026-10-14T00:00:00Z (đã xác nhận tại [D2](../decisions/decisions.md#decisions), [Q-001](../decisions/decisions.md#questions)). |
| Nature | roadmap — đã được PO xác nhận tại [D2](../decisions/decisions.md#decisions) ([Q-001](../decisions/decisions.md#questions)). |
| Handling | Giữ nguyên văn yêu cầu của PO; tách 2 luồng chính US-01 và US-02. |
| Duplicate search | Đã đối chiếu `context/sources/domain-context.md`: các danh sách Orders, Customers và Invoices hiện chưa có chức năng lưu bộ lọc. |
| Reason | Ghi nhận phạm vi MVP: bộ lọc đã lưu là của riêng từng người dùng, không chia sẻ. |

### Trích dẫn nguồn nguyên văn

Từ `input/po-spec.md` §1:

> Cho phép người dùng lưu tổ hợp bộ lọc đang áp dụng trên một danh sách thành **bộ lọc đã lưu** có tên, và mở lại bộ lọc đó bằng một lượt chọn từ thanh công cụ của danh sách.

Từ `input/po-spec.md` §2:

> Khi người dùng lưu bộ lọc (tên tối đa 40 ký tự), hệ thống chỉ lưu điều kiện lọc của các danh sách `Orders`, `Customers` và `Invoices` mà tài khoản hiện tại xem được.

Từ `input/po-spec.md` §3:

> Bộ lọc đã lưu là của riêng từng người dùng, không chia sẻ giữa các tài khoản. Mở bộ lọc không đổi dữ liệu của danh sách, chỉ đổi điều kiện lọc đang hiển thị.

## Vấn đề và kết quả

Nhân viên vận hành hiện phải chọn lại cùng một tổ hợp bộ lọc mỗi lần mở Orders, Customers hoặc Invoices để tra cứu đơn hàng (`ORD-xxx`), khách hàng (`CUS-xxx`) và hóa đơn (`INV-xxx`). Kết quả mong đợi của MVP là lưu bộ lọc với tên tối đa 40 ký tự, mở lại bộ lọc đã lưu bằng một lượt chọn, hiển thị thẻ đếm kết quả cạnh tên bộ lọc và xóa bộ lọc sau khi người dùng xác nhận.

## Giới hạn

- Số bộ lọc đã lưu tối đa của mỗi người dùng (20 bộ lọc trên mỗi danh sách) đã được PO chốt tại [D3](../decisions/decisions.md#decisions) ([Q-002](../decisions/decisions.md#questions)).
- Giới hạn tần suất lưu bộ lọc (tối đa 5 lượt/phút/người dùng) đã được PO chốt tại [D4](../decisions/decisions.md#decisions) ([Q-003](../decisions/decisions.md#questions)).

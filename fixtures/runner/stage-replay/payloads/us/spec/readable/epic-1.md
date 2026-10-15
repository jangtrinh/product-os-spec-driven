---
id: epic-1-saved-filters
type: epic
title: "Epic E1 — Lưu và dùng lại bộ lọc"
updated: "2026-10-14"
status: draft
---

## Mục tiêu
Cho phép người dùng lưu tổ hợp điều kiện lọc danh sách đơn thành bộ lọc có tên, áp dụng lại bằng một lần bấm và xóa bộ lọc không còn dùng.

## Ai dùng
Nhân viên vận hành đơn hàng. Trạng thái Planned.

## Thay đổi gì với người dùng
Người dùng bấm tên bộ lọc đã lưu thay vì chọn lại trạng thái, kênh bán và khoảng ngày mỗi lần mở danh sách đơn.

## Phạm vi
| ID | Tên | Mô tả | Trạng thái |
|---|---|---|---|
| C-01 | Lưu bộ lọc hiện tại với tên | Nhập tên dài từ 1 đến 40 ký tự và lưu tối đa 20 bộ lọc cho mỗi người dùng | Planned |
| C-02 | Áp dụng lại và xóa bộ lọc đã lưu | Bấm tên bộ lọc để áp dụng điều kiện hoặc xóa bộ lọc sau khi xác nhận | Planned |

### C-01 — Lưu bộ lọc hiện tại với tên
#### 1. User Story
Là nhân viên vận hành đơn hàng, tôi muốn lưu tổ hợp điều kiện lọc hiện tại thành bộ lọc có tên để dùng lại bằng một lần bấm.
#### 2. Flow
Người dùng lọc danh sách đơn, bấm Lưu bộ lọc, nhập tên và bấm Lưu.
#### 3. Dữ liệu và quy tắc
Tên dài từ 1 đến 40 ký tự, không trùng tên bộ lọc khác của cùng người dùng, tối đa 20 bộ lọc mỗi người dùng.
#### 4. Acceptance Criteria
| ID | Given | When | Then |
|---|---|---|---|
| AC-01 | Người dùng nhập tên dài từ 1 đến 40 ký tự chưa dùng và đang có dưới 20 bộ lọc | Bấm nút Lưu | Bộ lọc xuất hiện trong danh sách kèm thông báo Đã lưu bộ lọc |
| AC-02 | Tên rỗng, dài hơn 40 ký tự, trùng tên hoặc đã đủ 20 bộ lọc | Nhập tên hoặc bấm nút Lưu | Nút Lưu bị vô hiệu hóa hoặc hộp thoại hiện lý do từ chối |
#### 5. Edge cases
Tên chỉ chứa khoảng trắng bị coi như tên rỗng; tên khác nhau chỉ ở hoa thường bị coi là trùng.
#### 6. UI
Màn hình SCR-001 là hộp thoại lưu bộ lọc, chưa có bản build thực tế.
Build detail: US-01 · REQ-01 · REQ-02

### C-02 — Áp dụng lại và xóa bộ lọc đã lưu
#### 1. User Story
Là nhân viên vận hành đơn hàng, tôi muốn bấm vào bộ lọc đã lưu để áp dụng lại điều kiện và xóa bộ lọc không còn dùng.
#### 2. Flow
Người dùng mở danh sách bộ lọc, bấm tên bộ lọc để áp dụng hoặc bấm Xóa rồi xác nhận.
#### 3. Dữ liệu và quy tắc
Danh sách chỉ chứa bộ lọc của người dùng hiện tại; xóa bộ lọc không đổi danh sách đơn đang hiển thị.
#### 4. Acceptance Criteria
| ID | Given | When | Then |
|---|---|---|---|
| AC-01 | Người dùng có ít nhất một bộ lọc đã lưu | Bấm vào tên bộ lọc | Danh sách đơn áp dụng đúng điều kiện đã lưu |
| AC-02 | Người dùng có ít nhất một bộ lọc đã lưu | Bấm Xóa rồi bấm Xác nhận xóa | Bộ lọc biến mất khỏi danh sách và danh sách đơn không đổi |
#### 5. Edge cases
Hiển thị trạng thái rỗng khi chưa có bộ lọc; bấm Hủy giữ nguyên bộ lọc.
#### 6. UI
Màn hình SCR-002 hiển thị danh sách bộ lọc đã lưu, chưa có bản build thực tế.
Build detail: US-02 · REQ-03

## Không thuộc epic này
Chia sẻ bộ lọc giữa người dùng và đổi tên bộ lọc đã lưu.

## Câu hỏi mở
Không còn câu hỏi mở chưa giải quyết.

## Build detail
- Stories: US-01, US-02
- REQ: REQ-01, REQ-02, REQ-03

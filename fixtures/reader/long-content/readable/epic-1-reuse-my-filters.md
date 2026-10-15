---
id: epic-1
type: epic
title: "Epic 1 — PneumonoultramicroscopicsilicovolcanoconiosisPneumonoultramicroscopicsilicovolcanoconiosisPneumonoultramicroscopicsilicovolcanoconiosis"
status: Planned
updated: 2026-01-10
order: 1
---

## Mục tiêu

Lưu một bộ lọc một lần và mở lại đúng kết quả đó bất cứ lúc nào. Mục tiêu này cố ý viết rất dài để thử cách các bảng của vai trò PO xuống dòng. Mục tiêu này cố ý viết rất dài để thử cách các bảng của vai trò PO xuống dòng. Mục tiêu này cố ý viết rất dài để thử cách các bảng của vai trò PO xuống dòng. Mục tiêu này cố ý viết rất dài để thử cách các bảng của vai trò PO xuống dòng. Mục tiêu này cố ý viết rất dài để thử cách các bảng của vai trò PO xuống dòng. PneumonoultramicroscopicsilicovolcanoconiosisPneumonoultramicroscopicsilicovolcanoconiosisPneumonoultramicroscopicsilicovolcanoconiosis

## Ai dùng

Developer. Trạng thái: **Planned**.

## Thay đổi gì với người dùng

- Filter bar có nút **Save filter**.
- Danh sách **Saved filters** mở lại bộ lọc bằng một lần chọn.

## Phạm vi

| ID | Tên | Mô tả | Trạng thái |
|---|---|---|---|
| C-01 | Lưu và mở lại bộ lọc | Lưu bộ lọc hiện tại với một tên và mở lại đúng kết quả đó. | Planned |
| C-02 | Dọn bộ lọc không dùng | Xoá bộ lọc đã lưu sau khi xác nhận. | Planned |

### C-01 — Lưu và mở lại bộ lọc

#### 1. User Story

Là **developer@example.test**, tôi muốn lưu bộ lọc hiện tại với một tên để mở lại đúng kết quả đó lần sau.

#### 2. Flow

1. Người dùng chỉnh bộ lọc trên Filter bar.
2. Nhấn **Save filter** và nhập tên.
3. Bộ lọc xuất hiện trong danh sách Saved filters; chọn nó để mở lại.

Nhánh: tên trùng → hỏi đổi tên; không có bộ lọc nào → nút Save filter bị ẩn.

#### 3. Dữ liệu và quy tắc

| ID | Quy tắc |
|---|---|
| **BR-01** | Tên bộ lọc dài tối đa 40 ký tự và không trùng trong cùng người dùng. |
| **BR-02** | Mở lại bộ lọc cho đúng kết quả theo điều kiện đã lưu, không theo dữ liệu cũ. |

#### 4. Acceptance Criteria

| ID | Given | When | Then |
|---|---|---|---|
| **AC-01** | Danh sách đang có bộ lọc | Nhấn Save filter và nhập tên | Bộ lọc xuất hiện trong danh sách đã lưu. |
| **AC-02** | Có một bộ lọc đã lưu | Chọn bộ lọc đó | Danh sách hiện đúng các dòng đã lọc lúc lưu. |

#### 5. Edge cases

- Tên trùng: hiện lỗi dưới ô nhập và gợi ý đổi tên.
- Chưa có bộ lọc nào: danh sách Saved filters hiện empty state một hành động.

#### 6. UI

Filter bar → Save filter dialog → Saved filters list. Ảnh chụp build: thêm khi có.

Build detail: US-01, US-02 · REQ-01, REQ-02

### C-02 — Dọn bộ lọc không dùng

#### 1. User Story

Là **developer@example.test**, tôi muốn xoá bộ lọc không còn dùng để danh sách gọn lại.

#### 2. Flow

1. Người dùng chọn **Delete filter** trên một dòng Saved filters.
2. Hộp thoại xác nhận nêu tên bộ lọc sẽ bị xoá.
3. Xác nhận → bộ lọc biến mất khỏi danh sách.

#### 3. Dữ liệu và quy tắc

| ID | Quy tắc |
|---|---|
| **BR-01** | Xoá luôn cần xác nhận và nêu rõ tên bộ lọc bị xoá. |

#### 4. Acceptance Criteria

| ID | Given | When | Then |
|---|---|---|---|
| **AC-01** | Có một bộ lọc đã lưu | Chọn Delete filter và xác nhận | Bộ lọc biến mất khỏi danh sách đã lưu. |

#### 5. Edge cases

- Huỷ hộp thoại: không có gì thay đổi.

#### 6. UI

Saved filters list → Delete filter dialog. Ảnh chụp build: thêm khi có.

Build detail: US-03 · REQ-03

## Không thuộc epic này

- Chia sẻ bộ lọc giữa nhiều người.

## Câu hỏi mở

- Giới hạn số bộ lọc đã lưu mỗi người: chờ PO.

## Build detail

- Stories: US-01, US-02, US-03
- REQ: REQ-01, REQ-02, REQ-03

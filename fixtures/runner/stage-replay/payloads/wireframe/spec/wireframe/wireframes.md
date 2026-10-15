---
id: wireframe-saved-filters
type: note
title: "Orders Console — Bộ lọc đã lưu — Wireframes"
updated: "2026-10-14"
status: draft
---
## Screens
| Screen | Title | US | AC |
|---|---|---|---|
| SCR-001 | Hộp thoại lưu bộ lọc | US-01, US-02 | US-01.AC-01, US-01.AC-02, US-02.AC-01, US-02.AC-02 |
| SCR-002 | Danh sách bộ lọc đã lưu | US-01, US-02 | US-01.AC-01, US-01.AC-02, US-02.AC-01, US-02.AC-02 |
## Flows
| US | Path |
|---|---|
| US-01 | SCR-001 --Nhập tên và bấm Lưu--> SCR-002 |
| US-02 | SCR-002 --Bấm tên bộ lọc hoặc Xóa--> SCR-001 |
## Wireframes
### SCR-001--normal
```text
+------------------------------------------------------------+
| Hộp thoại lưu bộ lọc |
| Điều kiện lọc [Đơn đang giao kênh web] |
| Tên hợp lệ (22/40 ký tự). Bấm Lưu để thêm vào danh sách bộ lọc. |
| [Lưu] [Hủy] [Áp dụng] [Xóa] |
+------------------------------------------------------------+
```
### SCR-001--empty
```text
+------------------------------------------------------------+
| Hộp thoại lưu bộ lọc |
| Điều kiện lọc [] |
| Nhập tên bộ lọc dài từ 1 đến 40 ký tự. Nút Lưu đang bị vô hiệu hóa. |
| [Lưu] [Hủy] [Áp dụng] [Xóa] |
+------------------------------------------------------------+
```
### SCR-001--error
```text
+------------------------------------------------------------+
| Hộp thoại lưu bộ lọc |
| Điều kiện lọc [Đơn đang giao kênh web] |
| Tên bộ lọc đã tồn tại hoặc bạn đã lưu đủ 20 bộ lọc. Bộ lọc chưa được tạo. |
| [Lưu] [Hủy] [Áp dụng] [Xóa] |
+------------------------------------------------------------+
```
### SCR-001--loading
```text
+------------------------------------------------------------+
| Hộp thoại lưu bộ lọc |
| Điều kiện lọc [Đơn đang giao kênh web] |
| Đang lưu bộ lọc, vui lòng chờ. |
| [Lưu] [Hủy] [Áp dụng] [Xóa] |
+------------------------------------------------------------+
```
### SCR-002--normal
```text
+------------------------------------------------------------+
| Danh sách bộ lọc đã lưu |
| Điều kiện lọc [Đơn đang giao kênh web] |
| Bấm tên bộ lọc để áp dụng, hoặc bấm Xóa rồi xác nhận để bỏ bộ lọc. |
| [Lưu] [Hủy] [Áp dụng] [Xóa] |
+------------------------------------------------------------+
```
### SCR-002--empty
```text
+------------------------------------------------------------+
| Danh sách bộ lọc đã lưu |
| Điều kiện lọc [] |
| Bạn chưa lưu bộ lọc nào. Lọc danh sách đơn rồi bấm Lưu bộ lọc. |
| [Lưu] [Hủy] [Áp dụng] [Xóa] |
+------------------------------------------------------------+
```
### SCR-002--error
```text
+------------------------------------------------------------+
| Danh sách bộ lọc đã lưu |
| Điều kiện lọc [Đơn đang giao kênh web] |
| Không tải được danh sách bộ lọc. Bấm Thử lại để tải lại. |
| [Lưu] [Hủy] [Áp dụng] [Xóa] |
+------------------------------------------------------------+
```
### SCR-002--loading
```text
+------------------------------------------------------------+
| Danh sách bộ lọc đã lưu |
| Điều kiện lọc [] |
| Đang tải danh sách bộ lọc đã lưu. |
| [Lưu] [Hủy] [Áp dụng] [Xóa] |
+------------------------------------------------------------+
```

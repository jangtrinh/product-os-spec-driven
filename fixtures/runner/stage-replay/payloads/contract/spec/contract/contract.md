---
id: FC-01
type: contract
title: "Orders Console — Bộ lọc đã lưu — Feature Contract"
updated: "2026-10-14"
status: draft
primary: true
trace:
  decisions: [D1, D2, D3, D4]
---

## Metadata
| Mục | Giá trị |
|---|---|
| Version | 1.0 |
| Owner | po@example.test |
| Product | pending |
| Temporary authority | D1; D2; D3; D4 |

## Vấn đề và kết quả
Nhân viên vận hành đơn hàng trên Orders Console phải chọn lại trạng thái, kênh bán và khoảng ngày mỗi lần mở danh sách đơn. Kết quả của Feature Contract này là chức năng **Bộ lọc đã lưu**: người dùng lưu tổ hợp điều kiện hiện tại với tên dài từ 1 đến 40 ký tự, giữ tối đa 20 bộ lọc, áp dụng lại bằng một lần bấm và xóa bộ lọc không còn dùng.

## Phạm vi và nguồn chuẩn
| ID | Rule | Source |
|---|---|---|
| SC-01 | Phạm vi tính năng gồm lưu bộ lọc hiện tại với tên (US-01) và dùng lại hoặc xóa bộ lọc đã lưu (US-02). | D2 |
| SC-02 | Bộ lọc đã lưu chỉ thuộc về người dùng tạo ra nó; không chia sẻ giữa người dùng. | [input/po-spec.md §3](../intake/intake.md#nguon-va-phan-loai) |
| BR-01 | Tên bộ lọc dài từ 1 đến 40 ký tự và không trùng tên bộ lọc khác của cùng người dùng. | D4 |
| BR-02 | Mỗi người dùng lưu tối đa 20 bộ lọc. | D3 |
| BR-03 | Nút Lưu trong hộp thoại bị vô hiệu hóa khi tên rỗng; mọi lý do từ chối hiển thị ngay tại hộp thoại. | [input/po-spec.md §4](../intake/intake.md#nguon-va-phan-loai) |

Ngoài phạm vi: chia sẻ bộ lọc, đổi tên bộ lọc đã lưu và đồng bộ ngoài tài khoản đăng nhập.

## Nghiệm thu
| ID | Given | When | Then | Source |
|---|---|---|---|---|
| AC-01 | Người dùng đang lọc danh sách đơn, nhập tên dài từ 1 đến 40 ký tự chưa dùng và đang có dưới 20 bộ lọc | Bấm Lưu trong hộp thoại lưu | Bộ lọc xuất hiện trong danh sách bộ lọc kèm thông báo đã lưu | D4 |
| AC-02 | Tên rỗng, dài hơn 40 ký tự, trùng tên bộ lọc khác, hoặc người dùng đã có 20 bộ lọc | Nhập tên hoặc bấm Lưu | Nút Lưu bị vô hiệu hóa hoặc hộp thoại hiển thị lý do từ chối, và không có bộ lọc nào được tạo | D3 |
| AC-03 | Người dùng có ít nhất một bộ lọc đã lưu | Bấm vào tên bộ lọc, hoặc bấm Xóa rồi xác nhận | Danh sách đơn áp dụng đúng điều kiện đã lưu, hoặc bộ lọc biến mất khỏi danh sách | D2 |

Các mục chọn triển khai gồm `PRD-01`, `US-01` (`US-01.AC-01`, `US-01.AC-02`) và `US-02` (`US-02.AC-01`, `US-02.AC-02`).

## Flow, UIUX và dependency
- Giao diện gồm 2 màn hình lo-fi: `SCR-001` (Hộp thoại lưu bộ lọc) và `SCR-002` (Danh sách bộ lọc đã lưu).
- Phụ thuộc dữ liệu: bộ điều kiện lọc hiện tại của danh sách đơn và kho lưu bộ lọc theo người dùng.
- Không yêu cầu bằng chứng chạy code (built evidence) tại gate G2.

## Scenario và bằng chứng
- Phương thức kiểm chứng ở giai đoạn pre-code (`not-built`) là `review` (trạng thái `planned`) cho toàn bộ scenario của `US-01` và `US-02`.
- Chưa thực thi kiểm thử tự động hay nghiệm thu G4 UIUX.

## Bàn giao và giới hạn demo
- Prototype HTML là bản mô phỏng ngoại tuyến chỉ dùng liên kết anchor, không lưu dữ liệu thật.
- Bàn giao G5 chỉ xác nhận bộ đặc tả đã duyệt cho Dev và QC, không cấp quyền tự động merge hay deploy.

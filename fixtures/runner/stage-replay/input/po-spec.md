# Đặc tả ban đầu của PO: Bộ lọc đã lưu trên Orders Console

## 1. Bối cảnh và mục tiêu
Nhân viên vận hành đơn hàng trên Orders Console lọc danh sách đơn theo trạng thái, kênh bán và khoảng ngày nhiều lần mỗi ngày. Mỗi lần mở lại màn hình họ phải chọn lại toàn bộ điều kiện lọc.

Mục tiêu: cho phép người dùng lưu tổ hợp điều kiện lọc hiện tại thành một bộ lọc có tên và dùng lại bộ lọc đó bằng một lần bấm.

## 2. Phạm vi bản đầu
1. Lưu bộ lọc hiện tại (US-01):
   - Người dùng bấm Lưu bộ lọc trên màn hình danh sách đơn và nhập tên cho bộ lọc.
   - Tên bộ lọc dài từ 1 đến 40 ký tự và không trùng tên bộ lọc khác của chính người dùng đó.
   - Mỗi người dùng lưu tối đa 20 bộ lọc.
   - Khi tên không hợp lệ hoặc đã đủ 20 bộ lọc, hệ thống không lưu và hiển thị lý do ngay tại hộp thoại.
2. Dùng lại và xóa bộ lọc đã lưu (US-02):
   - Người dùng mở danh sách bộ lọc đã lưu của mình và bấm vào một bộ lọc để áp dụng lại toàn bộ điều kiện đã lưu.
   - Người dùng xóa một bộ lọc đã lưu sau khi xác nhận; bộ lọc đã xóa không còn trong danh sách.

## 3. Ngoài phạm vi
- Không chia sẻ bộ lọc giữa nhiều người dùng.
- Không đổi tên bộ lọc đã lưu trong bản đầu.
- Không đồng bộ bộ lọc giữa nhiều thiết bị ngoài tài khoản đăng nhập.

## 4. Luật nghiệp vụ
- Nút Lưu trong hộp thoại bị vô hiệu hóa khi ô tên rỗng hoặc chỉ chứa khoảng trắng.
- Tên trùng được so sánh không phân biệt hoa thường trong phạm vi bộ lọc của cùng người dùng.
- Xóa bộ lọc không làm đổi danh sách đơn đang hiển thị.

## 5. Điểm PO cần làm rõ thêm
- Phân loại nature của yêu cầu này và ngày phát hành bản đầu vào.
- Mỗi người dùng được lưu tối đa bao nhiêu bộ lọc.
- Tên bộ lọc dài tối đa bao nhiêu ký tự.

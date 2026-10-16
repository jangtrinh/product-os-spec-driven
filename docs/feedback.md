# Báo lỗi kit

Tài liệu này dành cho AI đang hỗ trợ PO khi kit gặp lỗi hoặc chạm một giới hạn đã biết.

## Khi nào đề nghị

Sau lỗi kit (đặc biệt exit 3 hoặc 4 không do PO nhập sai) hoặc một mục trong [giới hạn đã biết](known-limits.md), đề nghị giúp báo lỗi đúng một lần. Không nhắc lại nếu PO không muốn.

## Soạn bản nháp đã che dữ liệu

Lấy các trường sau vào bản nháp: **kit version** từ `kit.lock.json`; **host and CLI**; **command run**; **exit code**; **what happened**; **what was expected**; và chỉ các **kit error lines** chính xác.

Redaction bắt buộc: không đưa tên dự án hoặc khách hàng (project or customer names), giá (prices), email (emails), nội dung spec (spec text), hoặc nội dung file (file contents) ngoài kit error lines. Đổi home paths thành `~`; đổi đường dẫn project thành `<project>`.

## Xác nhận rồi mới gửi

Hiển thị toàn bộ bản nháp rồi hỏi qua tool hỏi người dùng của host: **Post / Edit / Don't post**. **Never post without an explicit `Post`.**

- Nếu PO chọn **Edit**, sửa bản nháp và hiển thị lại.
- Nếu PO chọn **Don't post**, dừng; không tạo issue.
- Chỉ khi PO chọn **Post**, kiểm tra `gh` đã đăng nhập rồi dùng `gh issue create --repo jangtrinh/product-os-spec-driven --title "..." --body-file <tmp>`.
- Nếu `gh` chưa đăng nhập, đưa nguyên văn bản nháp cho PO cùng [form báo lỗi](https://github.com/jangtrinh/product-os-spec-driven/issues/new?template=kit-feedback.yml). Không đưa nội dung bản nháp vào URL.

## English summary for the PO's AI

Offer once after a kit failure or known-limit hit. Draft only the required fields, redact project data, show the full draft, and ask **Post / Edit / Don't post** through the host ask-user tool. Never post without explicit Post consent.

# Quy tắc dùng chung

## Quy tắc chung
- Đọc quyết định còn hiệu lực trước; không hỏi lại điều đã chốt. PO quyết luật sản phẩm và phạm vi.
- Chưa có câu trả lời thì dùng `OPEN:`; điểm đổi kết quả nghiệm thu giữ `OPEN[blocking]:` inline trong US. Chỉ dừng phần phụ thuộc; ledger lưu nguồn trả lời, US giữ câu hỏi chuẩn.
- Prose bằng tiếng Việt; keys, ids và file names bằng tiếng Anh. Người được ghi bằng email hoặc vai trò có nguồn, không tự đặt danh tính.
- Id giữ nghĩa và không tái dùng id đã retire. Mỗi luật có một nguồn; không viết bản PO/Dev/QA song song với role views do reader sinh.
- Không tự ghi `APPROVED`. Eval, review, human acceptance, freshness, progress và delivery là các kết quả riêng; chưa chạy không ghi `PASS`.
- Tác tử tự động không bao giờ ghi, nhập hoặc ký phê duyệt/quyết định thay người; không dùng danh tính của người. Danh tính khai tại máy cục bộ không là xác thực.
- Khi nguồn hoặc schema mâu thuẫn, dừng phần phụ thuộc và hỏi người có quyền; không tự chọn luật để đi tiếp.
- Giữ lịch sử và quyết định cũ khi sửa. Không đổi expected, threshold hoặc phạm vi để hợp implementation; cần quyết định có nguồn từ người có quyền.
- Kiểm nghĩa từ nguồn thay vì suy đạt từ lint hoặc tên test. Thiếu công cụ/bằng chứng ghi `NOT_RUN` hoặc `BLOCKED`, nêu recovery; ghi NOT verified trước kết luận.
- Sau sửa cần kiểm tra lại nội dung cuối và review độc lập. Nhìn ảnh thật của trang đổi khi áp dụng; không bịa ảnh, kết quả chạy hay câu trả lời PO.

## Self-check commands
Tại project root, thay `<stage>` bằng stage đang xét và giữ kết quả thật sau lần sửa cuối:
```sh
node tools/lint/lint.mjs spec --pipeline config/pipeline.yaml --stage <stage>
node tools/reader/render.mjs spec --out review/render/<stage> --offline --artifact
node tools/reader/verify.mjs review/render/<stage> --proof review/render/<stage>/proof
```
Chạy thêm các kiểm tra đã cấu hình cho artifact; kiểm nghĩa và ảnh thật riêng, thiếu công cụ ghi NOT_RUN/BLOCKED.

## Định dạng kết quả writer
Chỉ trả nội dung cho đúng danh sách `DECLARED OUTPUTS` được cung cấp; danh sách này xác định các đích cụ thể.
Một file: trả plain UTF-8 text. Nhiều file: trả đúng một fenced `files` block chứa JSON path→UTF-8 content.
Keys khớp chính xác danh sách đích, không wildcard, thiếu/thừa, duplicate, absolute hoặc traversal. Text ngoài block không là artifact.
Không kèm lời tự chấm trong artifact. Tuân thủ template và rules được cung cấp, không lấy thêm private chat ngầm.

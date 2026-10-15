# Quy tắc viết — PRODUCT:OS Spec Driven

Phạm vi: readable pages và chữ giải thích trong PO/Dev/QA views. Build metadata, trace tables, source links và Build detail giữ id; build tham chiếu rule tại một nguồn. Template/prompt ví dụ không là nội dung sản phẩm. Source: SPEC.md §7.4, format/SPEC-FORMAT-v2.md §5.

## 1. Chỉ viết điều đã rõ
Chỉ viết hành vi có nguồn/PO decision. Điểm chưa trả lời giữ inline `OPEN:` trong US, ảnh hưởng AC dùng `OPEN[blocking]:`. Giữ owner/dependency và tiếp tục phần độc lập. Không dùng “có thể” để né quyết định. “Có thể” chỉ nói quyền đã xác nhận. Không thêm TBD metadata của baseline vào v2. G5 không còn câu trả lời bắt buộc chưa biết.

## 2. Ai làm gì và kết quả gì
Mỗi câu có tác nhân, hành động, kết quả quan sát. Ví dụ quy trình: “Runner ghi PENDING và dừng mã 2.” Không viết câu lợi ích không nói hành vi. Con số/threshold chỉ lấy nguồn được duyệt.

## 3. Thuật ngữ
Một khái niệm có một tên được định nghĩa inline hoặc glossary/source anchor. Không đặt danh từ ghép để rút gọn. Giữ tên control như danh từ: người dùng bấm tên thao tác. Không dùng động từ tiếng Anh như động từ tiếng Việt. Người dùng là email/vai trò, không tên cá nhân.

## 4. Dấu vết quá trình viết và nguồn luật
Không để author instructions, TODO/GAP hay opaque “theo BR-03” trong prose readable. Viết hành vi bằng lời, reader expand rule từ nguồn, metadata link/id vẫn giữ. Một luật có một nguồn contract/PRD/US; AC/flow mô tả hành vi, không chép rule thành nguồn thứ hai. OPEN có thật vẫn hiện ở mục câu hỏi, không xóa để trang trông sạch. Không tạo AC chỉ lặp hệ quả hiển nhiên của AC khác.

## 5. Câu và nhịp
Tách phủ định khỏi câu dùng dấu chấm phẩy. Hai chữ “hoặc” hoặc điều kiện lồng nhau: tách theo từng điều kiện. Dùng ban-list của glossary cùng replacement. Thay cụm quảng cáo bằng kết quả cụ thể có nguồn, không bịa số đo. Một câu giải thích một điều làm đổi hành vi/cách kiểm.

## 6. AC kiểm được
Given: trạng thái/dữ liệu cụ thể. When: một hành động/sự kiện. Then: tác nhân và kết quả thấy/đo được. Một hàng AC có các ô tương ứng đủ, không bắt dạng I–V hay ba dòng baseline. Mỗi AC có ≥1 SCN nguồn rõ; non-UI có lý do. Không viết “hoạt động đúng” thay expected. Không thay expected để khớp code đang chạy.

## 7. Sơ đồ Mermaid
Dùng flowchart LR, nhãn trong dấu nháy. Bảng flow và sơ đồ cùng bước/nhánh. Decision là câu hỏi, cạnh là câu trả lời loại trừ nhau và đủ nhánh. Kết quả kiểm hệ thống thành decision node; action edges chỉ dùng lựa chọn người dùng. Khoảng 4–10 ô, nhãn khoảng 45 ký tự, không chấm phẩy. Không bỏ rule/permission/error trong bản rút gọn.

## 8. Kiểm bằng gì
| Phần | Phép kiểm | Giới hạn |
|---|---|---|
| Cấu trúc/trace/scenario/link | node tools/lint/lint.mjs spec | Không chứng minh nghĩa/source completeness |
| Ban-list/anchor | D-TERMS, G-TERM-REF | Unicode NFC/casefold/whole phrase; không uppercase-Latin heuristic |
| Mermaid/images/overflow/navigation | reader render + verify và ảnh final revision | Không thay feature UI/interaction acceptance |
| Bám nguồn/rõ nghĩa/AC/nhất quán/văn phong | Independent rubric A–E | Evidence quote/file:line; generator không grade |
| Changed rule propagation | Independent original AC + SCN expected + current receipts | Id/tag/lint-green không chứng minh đúng luật mới |

## Hai lớp, trạng thái và coverage
Readable dẫn xuất từ build + epic-map. Một US xuất hiện đúng một chỗ trong map, hidden/merged vẫn giữ build, tests và Dev/QA coverage. Nội dung count dùng badge do reader sinh, không “(n)” trong prose. Metadata ids/numbers/badges không bị ban. Không viết tay role views. Trạng thái Planned/Built không là verified delivery, recency chip không là approval.

## Locale và UX writing
Dùng format/glossary-grammar.md cho extended headers/JSON cells. Locale theo manifest/profile/copy catalog, một preferred spelling/locale, giữ dấu/NFC, placeholders, đơn vị và business values. Không tự dịch hoặc tạo bilingual rows cho project EN-only. Retained terms là explicit source strings; exceptions có text/reason/source và scope hẹp. Source key trỏ exact locale catalog entry. Label rõ verb + object, hành động nói consequence trước và observable outcome sau theo nguồn. Reader theme không là DS của feature.

## Authority và design source
Đọc identity → principles/current scoped rulings → contract → DS/copy authority → defaults. Current scope/date quyết supersession cùng subject, giữ history. Locator/count sidecar do generator sở hữu, curated source chỉ symbolic; không dùng layer name làm behavioral selector. Missing/retired/unverified/not-created/denied/stale được nêu đúng. Thiếu evidence ghi NOT_RUN/BLOCKED + recovery, không điền lời như PASS.

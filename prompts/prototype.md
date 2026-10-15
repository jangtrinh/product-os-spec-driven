# prototype — PRODUCT:OS Spec Driven

## Vai trò
Tác tử viết của stage `prototype`. Chủ stage: `po`. Reviewer độc lập, chỉ đọc; PO duyệt gate riêng.

## Skill capability
Nạp es-designer và DESIGN:OS; capability design. Chạy ui gate, slop-detect và chụp start page + một state qua anchor. Runtime thiếu skill/công cụ: ghi NOT_RUN kèm lý do/recovery, không giả áp dụng và không fail run chỉ vì thiếu skill.

## Inputs
```yaml
context:
- spec/wireframe/
- spec/us/
- spec/glossary.md
- rules/writing-rules.md
- templates/prototype.md
```
PO có thể thêm path token file có thật vào stages.prototype.context. Chỉ dùng token khi được cấp trong context; mặc định không yêu cầu context/design/ hoặc adapter.

## Output files
- `spec/prototype/index.html`

## Cách viết
- Allowed elements only: html, head, meta (charset=utf-8 or name=viewport only), title, style (exactly one), body, main, header, footer, nav, section, div, span, p, h1-h6, a, button (type=button; no form submission attributes), label, input (effectively readonly or disabled), textarea (readonly), select (disabled; only option children), option, ul, ol, li, table, thead, tbody, tr, th, td, strong, em, small, br, hr, figure, figcaption, pre, code, svg, g, path, rect, circle, ellipse, line, polyline, polygon (basic shapes only inside svg); every other element fails P-ELEMENT with its tag and line.
- Trả plain text HTML đúng một file, không files JSON map, không fence bao file. Self-contained offline; một style inline, không external URL, protocol-relative URL, script, web font, JavaScript hoặc tài nguyên bên ngoài.
- Mỗi section screen×state phải có phần tử class screen: khung window/device có border và kích thước rõ, header/title bar, label + input boxes, anchors styled như buttons cho flow actions, list/table rows và thông báo state đúng vị trí. Chuyển layout ASCII thành HTML lo-fi, không thay bằng prose + links. US/AC trace đặt ngoài khung làm caption.
- Lo-fi system font và neutral greys mặc định; DS tokens có trong context thì dùng đúng tokens. Giữ focus-visible, link ≥44px, màu đủ tương phản.
- Start section id start có anchor bắt đầu cho từng US flow. Mỗi screen×state không N/A có section id `SCR-nnn--normal|empty|error|loading`; mọi section hiển thị US/AC ids của screen. Navigation bằng anchors; mỗi bước nối được đến bước kế và state links từ màn normal. Mọi href trỏ id có thật.
- Copy US/AC ids verbatim, giữ leading zero. Never invent a requirement not in spec/us/. Nội dung và action theo wireframe đã duyệt; unresolved points stay OPEN:.
- Giữ title, lang, viewport và semantic main/section; label cho mọi điều hướng.
- Chỉ mô phỏng hành vi đã khai trong US; không giả backend, không tự đổi expected của AC. Screen/state N/A không có section.

## Ví dụ
Ví dụ chưa tốt: button onclick, link đến CDN hoặc "Đã lưu" tự thêm khi US chưa có kết quả lưu.
Ví dụ tốt: `<a href="#SCR-002--error">Xem lỗi theo US-01.AC-02</a>` nối section có id đó và hiển thị ids nguồn; từ start có đường anchors đi hết flow.

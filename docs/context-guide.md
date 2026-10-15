# Chuẩn bị context cho dự án

PO chuẩn bị tài liệu ở ngoài kit rồi chọn file để nạp. Lệnh chỉ chép nguyên byte; không tóm tắt, đọc Figma, phân tích codebase hay hiểu ảnh. Writer của stage sau đọc những file văn bản đã nạp như nguồn bình thường.

## Chọn đúng nhóm

| Thư mục trong project | Nội dung | Stage đọc |
|---|---|---|
| `context/sources/` | Tài liệu nghiệp vụ, spec trước, glossary, luật đã chốt, trích đoạn code có chú thích | intake, clarify, contract, prd, us |
| `context/ui/` | HTML trang hiện có, token DS, danh sách component, mô tả frame/state/flow | wireframe, prototype, design, uiux |

`/spec:new` hỏi tài liệu dự án sau init và doctor. `/spec:run` hỏi UI context trước lần đầu chạy wireframe. Chọn **Không có / chưa rõ** nếu chưa chuẩn bị; có thể nạp sau bằng CLI. Lựa chọn UI được ghi ở `input/context-intake.json`; file này không đi vào prompt hay gate. Nâng cấp giữ nó nguyên vẹn.

Context là tùy chọn: thư mục trống hoặc chưa có không chặn stage. Nạp, sửa hoặc xóa context sau khi duyệt sẽ làm cũ các gate đọc nhóm đó. Khi output của stage thay đổi, các gate phụ thuộc vẫn được kiểm lại theo luật hiện có.

## Định dạng và dung lượng

Chấp nhận văn bản UTF-8: `.md`, `.txt`, `.html`, `.htm`, `.css`, `.json`, `.yaml`, `.yml`, `.csv`, `.svg`. File ngoài danh sách cho phép bị bỏ qua khi stage đọc context, và `/spec:status` liệt kê chúng. File phải là văn bản, không chứa byte điều khiển nhị phân. Giữ cấu trúc và tên file rõ ràng; không cần đổi nội dung thành JSON hợp lệ chỉ để nạp.

- Mỗi file tối đa **65.536 byte (64 KiB)**.
- Tổng mỗi nhóm tối đa **262.144 byte (256 KiB)**, tính cả file đã nạp. Nạp lại cùng byte không tính thêm.
- Đây là mức giới hạn nạp bảo thủ; không bảo đảm model có đủ cửa sổ context cho mọi project. Prompt còn có spec, templates, rules, outputs và yêu cầu sửa. Nếu model từ chối dung lượng, PO giảm context đã chuẩn bị.

Giữ phần cần cho quyết định, cắt phần lặp. Chia file quá lớn thành trích đoạn có tên nguồn và mục gốc; chia file không làm tăng hạn mức tổng. Không nạp secrets, dữ liệu cá nhân, toàn bộ repo, `.git` hoặc `node_modules`.

## Xuất nguồn phổ biến

| Nguồn | PO chuẩn bị ở ngoài kit |
|---|---|
| Codebase | Trích đoạn chọn lọc trong `.md`: đường dẫn gốc, interface/hành vi liên quan, luật cần giữ |
| Figma | Export tokens `.json`; mô tả frame, screen, state, component và flow trong `.md` |
| Trang app | Lưu `.html`; thêm `.css` và tokens nếu cần; đường dẫn local tương đối |
| Screenshot | Mô tả màn hình trong `.md`; ảnh không vào writer prompt |
| PDF / DOCX | Export phần liên quan thành `.md` hoặc `.txt` UTF-8 |
| Glossary / bảng nghiệp vụ | `.md`, `.csv` hoặc `.json`, kèm nguồn và phạm vi hiệu lực |

Không nạp `.png`, `.jpg`, `.pdf`, `.docx`, `.fig`, `.zip` hoặc file nhị phân. Agent chỉ chỉ cách chuẩn bị; PO tự chuyển đổi bên ngoài.

## Xem kế hoạch rồi nạp

Chạy từ kit; thay `<dir>` bằng project đã init, `<prepared-dir>` bằng folder đã chuẩn bị ở ngoài kit:

```sh
node tools/run/load-context.mjs --project "<dir>" --kind sources --from "<prepared-dir>" --dry-run
node tools/run/load-context.mjs --project "<dir>" --kind sources --from "<prepared-dir>"
node tools/run/load-context.mjs --project "<dir>" --kind ui --from "<page.html>" --from "<tokens.json>" --dry-run --json
node tools/run/load-context.mjs --project "<dir>" --kind ui --from "<page.html>" --from "<tokens.json>"
```

Folder được nạp đệ quy, giữ tên tương đối dưới folder đã chọn; một file riêng dùng tên file đó. Hai root có cùng tên đích và cùng byte được gộp. `.git` và `node_modules` được bỏ qua. Symlink, nguồn trong kit hoặc trong `spec/`, `input/`, `config/` của project bị từ chối. Chọn folder xuất riêng, không chọn cả project. Không dùng symlink; dùng đường dẫn thật.

`--dry-run` in file, byte, xung đột và lý do từ chối; không ghi gì. Trong skill, PO duyệt kế hoạch qua tool hỏi người dùng trước khi nạp thật. Nếu một file bị từ chối hoặc khác byte với file đích đã có, **toàn bộ đợt không ghi** (exit 3). PO sửa nguồn ngoài kit, giảm dung lượng hoặc chọn tên mới rồi xem kế hoạch lại. File cùng byte là no-op. Exit 4 là lỗi môi trường khi chép; lệnh hoàn tác file vừa chép của đợt đó.

## Khai context tùy chọn khác

Trong `config/pipeline.yaml`, `context` là nguồn bắt buộc; `optional_context` là danh sách selector bổ sung cùng cú pháp path/glob, ví dụ:

```yaml
stages:
  prd:
    optional_context:
      - context/research/**
```

Không khai cùng selector ở cả hai danh sách. File được chọn vẫn được hash, snapshot và review; không có file thì selector không đổi approval. Các nguồn DS bắt buộc của design adapter vẫn cần chuẩn bị riêng theo adapter.

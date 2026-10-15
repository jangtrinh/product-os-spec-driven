---
id: saved-filters-glossary
type: glossary
title: "Saved filters — Thuật ngữ"
updated: "2026-10-14"
status: draft
---

## Terms

| Term | Anchor | Definition | Source |
|---|---|---|---|
| PO | po | Người quyết scope và luật sản phẩm | D1 |
| QC | qc | Người kiểm thử, mặc định chủ tdd | D1 |
| Dev | dev | Người phát triển, mặc định chủ design | D1 |
| contract | contract | Cam kết Product/Feature scope và luật có nguồn | D1 |
| template | template | Khung cú pháp tài liệu, không chứa yêu cầu sản phẩm | D1 |
| eval | eval | Lệnh kiểm tất định được khai báo cho stage | D1 |
| review | review | Lượt reviewer độc lập chấm nguồn và artifact theo rubric | D1 |
| gate | gate | Quyết định theo phạm vi/phiên bản sau required checks | D1 |
| scenario | scenario | Ca kiểm liên kết AC với method và trạng thái | D1 |
| receipt | receipt | Bản ghi thực thi/bằng chứng có pins và freshness | D1 |
| Saved filter | saved-filter | Tổ hợp điều kiện lọc của một danh sách được người dùng đặt tên và lưu để mở lại | [input/po-spec.md §1](intake/intake.md#nguon-va-phan-loai) |
| Thẻ đếm kết quả | result-count-badge | Thành phần hiển thị số bản ghi khớp với bộ lọc đang áp dụng, vẽ dạng badge | [input/po-spec.md §2](intake/intake.md#nguon-va-phan-loai) |
| Nhật ký thay đổi | change-log | Bản ghi hệ thống bất biến lưu filter_id, user_id, list_id, action và changed_at cho mỗi lượt lưu, đổi tên hoặc xóa bộ lọc | [input/po-spec.md §4](intake/intake.md#nguon-va-phan-loai) |

## Ban list

| Banned | Replacement | Reason |
|---|---|---|
| đảm bảo | Nêu tác nhân và hành động | Không nói ai làm gì để đạt kết quả |
| bảo đảm | Nêu tác nhân và hành động | Không nói ai làm gì để đạt kết quả |
| hiệu quả | Nêu kết quả đo được, hoặc bỏ | Không đo được |
| tối ưu | Nêu kết quả đo được, hoặc bỏ | Không đo được |
| linh hoạt | Nêu cái gì đổi được và đổi ở đâu | Không nói đổi được cái gì |
| liền mạch | Bỏ | Từ quảng cáo |
| mạnh mẽ | Bỏ | Từ quảng cáo |
| toàn diện | Liệt kê phạm vi | Không có phạm vi |
| dễ dàng | Nêu số bước, hoặc bỏ | Không đo được |
| nhanh chóng | Nêu thời gian, hoặc bỏ | Không đo được |
| thân thiện | Bỏ | Không đo được |
| nâng cao | Nêu kết quả cụ thể | Không có mức so sánh |
| một cách | Bỏ cả cụm | Thường đi kèm tính từ chung chung |
| phù hợp | Nêu tiêu chí | Không nêu tiêu chí |
| các thông tin liên quan | Liệt kê từng thông tin | Không nói thông tin nào |
| đa dạng | Liệt kê | Không có phạm vi |
| hiện đại | Bỏ | Từ quảng cáo |
| chuyên nghiệp | Bỏ | Từ quảng cáo |
| thông minh | Bỏ | Từ quảng cáo |
| v.v. | Liệt kê đủ | Danh sách bỏ lửng |
| vân vân | Liệt kê đủ | Danh sách bỏ lửng |
| khi cần thiết | Nêu điều kiện | Không nói khi nào |
| nếu cần thiết | Nêu điều kiện | Không nói khi nào |
| ; không | Tách thành hai câu, hoặc nối bằng "và" | Nhịp câu máy: nối hai vế bằng chấm phẩy để phủ định |
| ; chưa | Tách thành hai câu | Chấm phẩy nối phủ định che điều kiện |
| cần chốt | Ghi câu hỏi vào sổ quyết định | Ghi chú quy trình lọt vào tài liệu |
| GAP- | Ghi câu hỏi vào sổ quyết định | Mã quy trình lọt vào tài liệu |
| TODO | Viết đủ, hoặc ghi câu hỏi vào sổ quyết định | Chỗ trống trong tài liệu |

## Locale/copy extensions
Dùng exact headers của format/glossary-grammar.md:

```text
Term | Anchor | Definition | Source | Locale | Source key | Retained terms | Exceptions
Banned | Replacement | Reason | Locale | Source key | Retained terms | Exceptions
```

Locale là BCP47 hoặc — kế thừa manifest; source key exact catalog key hoặc — omit; retained terms/exceptions là strict JSON arrays, rỗng dùng [], không —. Exception mỗi row gồm text/reason/source có authority, không blanket suppression. Escape Markdown pipe trong JSON thành \| và giữ JSON escaping backslash. Source key resolve exact locale catalog entry/profile revision. Một preferred spelling/locale, unique NFC/casefold+locale+anchor. Không strip dấu, giữ placeholders/units/business strings. EN-only không tạo VI rows thiếu nguồn. Readable/role prose ban-match Unicode whole phrase; metadata/code/URLs/source/ban tables excluded. Thuật ngữ chưa neo do reviewer xét, không uppercase-Latin regex.

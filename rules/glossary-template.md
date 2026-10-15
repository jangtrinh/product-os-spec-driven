# Glossary mặc định — hướng dẫn tạo project
Dùng templates/glossary.md để tạo spec/glossary.md có front matter, manifest trỏ đúng path. Các terms dưới đây là quy trình kit có nguồn, không phải thuật ngữ nghiệp vụ. PO bổ sung term có source hoặc giữ OPEN. New project giữ baseline ban-list đầy đủ; migration chỉ giữ ban-list có trong nguồn.

## Terms
| Term | Anchor | Definition | Source |
|---|---|---|---|
| PO | po | Người quyết scope và luật sản phẩm | SPEC.md §2 |
| QC | qc | Người kiểm thử, mặc định chủ tdd | SPEC.md §2 |
| Dev | dev | Người phát triển, mặc định chủ design | SPEC.md §2 |
| contract | contract | Cam kết Product/Feature scope và luật có nguồn | SPEC.md §7.3 |
| template | template | Khung cú pháp tài liệu, không chứa yêu cầu sản phẩm | SPEC.md §7.6 |
| eval | eval | Lệnh kiểm tất định được khai báo cho stage | SPEC.md §8.1 |
| review | review | Lượt reviewer độc lập chấm nguồn và artifact theo rubric | SPEC.md §8.2 |
| gate | gate | Quyết định theo phạm vi/phiên bản sau required checks | SPEC.md §4.4 |
| scenario | scenario | Ca kiểm liên kết AC với method và trạng thái | SPEC.md §9 |
| receipt | receipt | Bản ghi thực thi/bằng chứng có pins và freshness | format/gate-model.md §5 |

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

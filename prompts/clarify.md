# clarify — PRODUCT:OS Spec Driven

## Vai trò
Tác tử viết của stage `clarify`. Chủ stage: `po`. Reviewer chạy riêng, chỉ đọc.

## Skill capability (D19, D20)
Việc: Làm rõ yêu cầu với người có quyền. Nạp trước khi viết:
- brainstorm — hỏi theo vòng (tối đa 4 câu/vòng, đáp án khuyến nghị đứng đầu, ảnh/mock cho thứ nhìn thấy), không đoán rồi làm.
- Chưa chạy gate nào thì không viết "xong/đạt": mọi claim done/verified đi qua gates. Phân tích hoặc giao việc không tầm thường dùng think.
- Core không phụ thuộc model: prompt chỉ gọi tên capability và skill, không gọi tên model. Runtime không nạp được skill thì ghi NOT_RUN kèm recovery, không giả vờ đã áp dụng; quy tắc trong prompt này vẫn là sàn.

## Inputs
Đọc các nguồn được cung cấp dưới đây; không dùng private chat hoặc nguồn chưa khai báo.

```yaml
context:
- input/po-spec.md
- spec/decisions/decisions.md
- input/answers.md
- spec/glossary.md
- rules/writing-rules.md
- templates/decisions.md
- templates/clarify-record.md
```

## Output files
- `spec/decisions/decisions.md`
- `spec/intake/intake.md (chỉ cập nhật nguồn/phân loại đã trả lời)`

## PO answer source
- `input/answers.md` is PO-owned source input. Copy each answered row verbatim into the decisions ledger and its clarify record: answer, decided_by, decided_at (Date as UTC midnight, canonical `YYYY-MM-DDT00:00:00Z`), decision_ref = `input/answers.md#Q-nnn`.
- Preserve the Q id and options. Never invent an answer, email, date, reason or ruling. Rows absent from that source remain open; do not answer from a recommendation.
- `<br>` in a table cell encodes a PO-supplied newline; `\|` encodes a literal pipe. Decode `<br>` newlines and HTML entities (`&lt;`, `&amp;`, `&#92;`) when recording the verbatim answer.

## Cách viết
- Soát đủ năm nhóm: mâu thuẫn, hai cách hiểu, ràng buộc xung đột, giả định chưa nói, edge case thiếu.
- Đọc prior answers/rulings; deduplicate subject/scope trước khi hỏi lại.
- Mỗi câu hỏi chỉ chứa một quyết định PO phải chốt; options loại trừ nhau, recommendation có reason.
- Mọi câu hỏi ảnh hưởng phạm vi luôn có đúng ba lựa chọn: **Trong phạm vi**; **Hoãn** (ghi `status: deferred`, `reason`, và điều kiện xem lại); **Ngoài phạm vi** (ghi reason). Hoãn chỉ đổi trạng thái câu hỏi, không tự chốt scope.
- Lưu id/question/options/recommendation/dependencies/asked round/answer+source/disposition open|answered|superseded|deferred.
- Deferred có ảnh hưởng AC vẫn blocking; tái dùng accepted decisions, không tự chốt unknown answer.
- Record Q-<nnn> theo clarify-record schema: group đúng năm nhóm, recommended là vị trí zero-based hợp lệ; duplicate_of là Q-id có nguồn.
- Lưu bản ghi câu hỏi tại `review/clarify/Q-<nnn>.json`; xuất sang `records/clarify/`.
- Answered cần answer/decided_by/decided_at/decision_ref; superseded cần superseded_by/reason; deferred cần reason. Inline US OPEN vẫn là nguồn chuẩn.

## Ví dụ
Ví dụ chưa tốt: "Có cần thông báo, phân quyền và xuất báo cáo không?"
Ví dụ tốt: "Vai trò nào được xuất báo cáo?"; đề xuất chỉ quản lý vì dữ liệu nhạy cảm, dẫn câu nguồn và để PO chọn.

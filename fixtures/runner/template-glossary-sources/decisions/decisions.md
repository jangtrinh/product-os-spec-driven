---
id: saved-filters-decisions
type: decisions
title: "Saved filters — Sổ quyết định và câu hỏi"
updated: "2026-10-14"
status: draft
ledger: true
---

## Decisions

| Id | Decision | Detail |
|---|---|---|
| D1 | New project giữ baseline ban-list đầy đủ; migration chỉ giữ ban-list có trong nguồn. | Quy tắc kit từ rules/glossary-template.md. Áp dụng cho spec/glossary.md. |
| D2 | Xác nhận phân loại nature là roadmap và ngày phát hành đặc tả đầu vào là 2026-10-14. | Trả lời cho Q-001 bởi owner@example.test ngày 2026-10-14T00:00:00Z. Nguồn: input/answers.md#Q-001. Áp dụng cho spec/intake/intake.md. |
| D3 | Giữ tối đa 20 bộ lọc đã lưu cho mỗi người dùng trên mỗi danh sách. | Trả lời cho Q-002 bởi owner@example.test ngày 2026-10-14T00:00:00Z. Nguồn: input/answers.md#Q-002. Áp dụng cho US-02. |
| D4 | Giới hạn tối đa 5 lượt lưu bộ lọc mỗi phút cho mỗi người dùng. | Trả lời cho Q-003 bởi owner@example.test ngày 2026-10-14T00:00:00Z. Nguồn: input/answers.md#Q-003. Áp dụng cho US-01. |

## Questions

| Id | Question | Dependencies | Asked round | Answer / source | Disposition |
|---|---|---|---|---|---|
| Q-001 | PO xác nhận phân loại nature của đặc tả Saved filters là roadmap và thời điểm phát hành bản đầu vào là ngày 2026-10-14? | Phân loại intake | 1 | Xác nhận phân loại nature là roadmap và ngày phát hành đặc tả đầu vào là 2026-10-14. Decided by: owner@example.test; decided_at: 2026-10-14T00:00:00Z; decision_ref: input/answers.md#Q-001 (D2) | answered |
| Q-002 | Mỗi người dùng được lưu tối đa bao nhiêu bộ lọc trên một danh sách? | US-02; giới hạn số bộ lọc đã lưu | 1 | Giữ tối đa 20 bộ lọc đã lưu cho mỗi người dùng trên mỗi danh sách. Decided by: owner@example.test; decided_at: 2026-10-14T00:00:00Z; decision_ref: input/answers.md#Q-002 (D3) | answered |
| Q-003 | Giới hạn tần suất lưu bộ lọc (rate limit) cho mỗi người dùng là bao nhiêu lượt mỗi phút trước khi chặn tạm thời? | US-01; chống lưu bộ lọc hàng loạt | 1 | Giới hạn tối đa 5 lượt lưu bộ lọc mỗi phút cho mỗi người dùng. Decided by: owner@example.test; decided_at: 2026-10-14T00:00:00Z; decision_ref: input/answers.md#Q-003 (D4) | answered |

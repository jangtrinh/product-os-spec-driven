---
id: saved-filters-decisions
type: decisions
title: "Orders Console — Bộ lọc đã lưu — Sổ quyết định và câu hỏi"
updated: "2026-10-14"
status: draft
ledger: true
---

## Decisions

| Id | Decision | Detail |
|---|---|---|
| D1 | New project giữ baseline ban-list đầy đủ; migration chỉ giữ ban-list có trong nguồn. | Quy tắc kit từ rules/glossary-template.md. Áp dụng cho spec/glossary.md. |
| D2 | Xác nhận phân loại nature là roadmap và ngày phát hành đặc tả đầu vào là 2026-10-14. | Trả lời cho Q-001 bởi po@example.test ngày 2026-10-14T00:00:00Z. Nguồn: input/answers.md#Q-001. Áp dụng cho spec/intake/intake.md. |
| D3 | Mỗi người dùng lưu tối đa 20 bộ lọc. | Trả lời cho Q-002 bởi po@example.test ngày 2026-10-14T00:00:00Z. Nguồn: input/answers.md#Q-002. Áp dụng cho US-01. |
| D4 | Tên bộ lọc dài từ 1 đến 40 ký tự và không trùng tên bộ lọc khác của cùng người dùng. | Trả lời cho Q-003 bởi po@example.test ngày 2026-10-14T00:00:00Z. Nguồn: input/answers.md#Q-003. Áp dụng cho US-01. |
| D5 | Bộ lọc đã lưu dùng chung một danh sách cho mọi vai trò và không có ngoại lệ theo vai trò. | Trả lời cho Q-004 bởi po@example.test ngày 2026-10-14T00:00:00Z. Nguồn: input/answers.md#Q-004. Áp dụng cho US-02. |

## Questions

| Id | Question | Dependencies | Asked round | Answer / source | Disposition |
|---|---|---|---|---|---|
| Q-001 | PO xác nhận phân loại nature của đặc tả Bộ lọc đã lưu là roadmap và thời điểm phát hành bản đầu vào là ngày 2026-10-14? | Phân loại intake | 1 | Xác nhận phân loại nature là roadmap và ngày phát hành đặc tả đầu vào là 2026-10-14. Decided by: po@example.test; decided_at: 2026-10-14T00:00:00Z; decision_ref: input/answers.md#Q-001 (D2) | answered |
| Q-002 | Mỗi người dùng được lưu tối đa bao nhiêu bộ lọc? | US-01; giới hạn số bộ lọc | 1 | Mỗi người dùng lưu tối đa 20 bộ lọc. Decided by: po@example.test; decided_at: 2026-10-14T00:00:00Z; decision_ref: input/answers.md#Q-002 (D3) | answered |
| Q-003 | Tên bộ lọc dài tối đa bao nhiêu ký tự và có được trùng tên không? | US-01; quy tắc đặt tên | 1 | Tên bộ lọc dài từ 1 đến 40 ký tự và không trùng tên bộ lọc khác của cùng người dùng. Decided by: po@example.test; decided_at: 2026-10-14T00:00:00Z; decision_ref: input/answers.md#Q-003 (D4) | answered |
| Q-004 | Danh sách bộ lọc đã lưu có khác nhau theo vai trò người dùng không? | US-02; phạm vi danh sách | 2 | Bộ lọc đã lưu dùng chung một danh sách cho mọi vai trò và không có ngoại lệ theo vai trò. Decided by: po@example.test; decided_at: 2026-10-14T00:00:00Z; decision_ref: input/answers.md#Q-004 (D5) | answered |

---
id: handoff-saved-filters
type: build
title: "Orders Console — Bộ lọc đã lưu — Gói bàn giao G5"
updated: "2026-10-14"
status: draft
trace:
  req: [REQ-01, REQ-02, REQ-03]
  us: [US-01, US-02]
  ac: [US-01.AC-01, US-01.AC-02, US-02.AC-01, US-02.AC-02]
  decisions: [D1, D2, D3, D4]
---

## Candidate và baseline
- Candidate head: `saved-filters-v1`, base: `not-published`, build: `not-built`.
- Versions: workflow `2`, templates `2`, ruleset `2`.
- Các tài liệu đã khóa trong gói bàn giao: [Feature Contract](../contract/contract.md), [PRD](../prd/prd.md), [Danh sách US](../us/INDEX.md), [US-01](../us/US-01.md), [US-02](../us/US-02.md), [Wireframes](../wireframe/wireframes.md), [Release](../readable/release.md), [Epic E1](../readable/epic-1.md).

## Phạm vi
- Bàn giao đầy đủ `US-01` (`US-01.AC-01`, `US-01.AC-02`) và `US-02` (`US-02.AC-01`, `US-02.AC-02`) nối với `REQ-01`, `REQ-02`, `REQ-03` và các quyết định `D1`, `D2`, `D3`, `D4`.
- Ngoài phạm vi đã loại trừ theo quyết định PO tại [FC-01](../contract/contract.md): không chia sẻ bộ lọc giữa người dùng, không đổi tên bộ lọc đã lưu.

## Gates và bằng chứng
- Cổng G1 (`intake`), `clarify`, G2 (`contract`), `prd`, G3 (`us`), `wireframe`, `prototype` đã được PO `po@example.test` phê duyệt (`APPROVED`).
- Cổng `tdd` đã hoàn tất phân công scenario (`SCN-01-01`, `SCN-01-02`, `SCN-02-01`) với phương thức `review`, trạng thái `planned` cho giai đoạn pre-code (`not-built`).
- Giới hạn demo: prototype HTML tại `spec/prototype/index.html` là bản mô phỏng tĩnh ngoại tuyến bằng liên kết neo, chưa có bản build thực thi hoặc nghiệm thu G4 UIUX.

## Receiver và delivery
- Trạng thái phát hành: chuẩn bị Publication tại cổng G5; người nhận Dev và QC chưa Acknowledged và chưa Switched sang baseline mới.
- Tài liệu bàn giao này không cấp quyền tự động merge hoặc deploy và không thay thế nghiệm thu Delivery Done.

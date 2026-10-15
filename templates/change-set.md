---
id: <document-id>
type: change-set
title: "<title>"
updated: "2026-10-07"
status: draft
data: delivery/<change-set>.json
---

## Change and impact
<Link payload, immutable baseline.>

## Propagation and re-gates
<Semantic rows, closure/fallback and current receipts.>

## Approval and receivers
<PO scope/migration/backlog decision; publication/ack/switch distinct.>

<!-- example: delivery/change-set.md
---
id: CS-example
type: change-set
title: "Change Set đề xuất"
updated: "2026-10-07"
status: draft
data: delivery/change-set.json
---

## Change and impact
[Payload](change-set.json) ghi đề xuất làm rõ trạng thái chờ. Baseline cũ vẫn giữ nguyên.
## Propagation and re-gates
Chưa chứng minh closure và propagation. Mở lại từ intake theo BR-14 tới khi có census/independence proof.
## Approval and receivers
Chưa có PO decision, packet hoặc receiver switch. Published, Acknowledged và Switched là ba sự kiện riêng.
-->

Payload companion: templates/change-set.json, xuất delivery/change-set.json. Mỗi changed rule giữ exact before/after ở source/history và propagation. Proposed không cấp quyền sửa. Closure chưa đầy đủ dùng intake fallback; baseline/receiver vẫn bản cũ.

---
id: <document-id>
type: screen-inventory
title: "<title>"
updated: "2026-10-07"
status: draft
data: ux/<inventory>.json
---

> Skill (D19, D20): thiết kế UI/UX dùng es-designer (mặc định, nạp trước khi viết); design khi project design-system adapter bật. Bằng chứng design = output gate của es-designer (ui gate + slop-detect, checklist) và ảnh chụp 375/768/1440 và 874×827, dán exit code và đường dẫn ảnh thật; thiếu browser/DS/plugin ghi NOT_RUN/BLOCKED.

## Screens and states
<Link data JSON, không chép bảng riêng.>

## Flow and disclosure
<Flow/data/IA source.>

## Gaps and departures
<State NA reason/confirmer, missing consumers/source/evidence.>

<!-- example: ux/screens.md
---
id: screens-example
type: screen-inventory
title: "Danh sách màn hình"
updated: "2026-10-07"
status: draft
data: ux/screens.json
---

## Screens and states
[JSON](screens.json) sở hữu các hàng S01/normal. Ví dụ cú pháp không cấp quyền thiết kế.
## Flow and disclosure
Đọc US-01 và [design](design.md).
## Gaps and departures
Chưa có board, component/pattern, evidence hoặc nguồn ngoài. Chưa chọn DS. G4 bị chặn tới khi coverage/state/authority có nguồn và kiểm được.
-->

Payload companion: templates/screen-inventory.json, xuất ux/screens.json. Chỉ JSON owns rows; không tạo bảng duplicative. Ví dụ thiếu DS/source/board/evidence vẫn công bố gap và không đủ design/G4 acceptance.

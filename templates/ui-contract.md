---
id: <document-id>
type: ui-contract
title: "<title>"
updated: "2026-10-07"
status: draft
---

> Skill (D19, D20): thiết kế UI/UX dùng es-designer (mặc định, nạp trước khi viết); design khi project design-system adapter bật. Bằng chứng design = output gate của es-designer (ui gate + slop-detect, checklist) và ảnh chụp 375/768/1440 và 874×827, dán exit code và đường dẫn ảnh thật; thiếu browser/DS/plugin ghi NOT_RUN/BLOCKED.

## Elements
| Screen | State | Route | Roles | Scope | US | Element | Kind | Components | Patterns | Target | SCN |
|---|---|---|---|---|---|---|---|---|---|---|---|
| <S-id> | <state> | <route> | <roles> | <scope> | <US> | <role=...; name=... OR testid=...> | <kind> | <adapter/handle or —> | <adapter/handle or —> | <observable AC target> | <SCN or —> |

## Giới hạn
<Không đoán selector. Mỗi inventory state có target, uniqueness role×scope.>

<!-- example: ux/ui-contract.md
---
id: selector-contract
type: ui-contract
title: "Hợp đồng giao diện ví dụ"
updated: "2026-10-07"
status: draft
---

## Elements
| Screen | State | Route | Roles | Scope | US | Element | Kind | Components | Patterns | Target | SCN |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S01 | normal | /review | po | batch-example | US-01 | role=button; name=Hoãn quyết định | button | — | — | Phạm vi tiếp tục chờ theo US-01.AC-01 | SCN-01-01 |
## Giới hạn
Tên phần tử là ví dụ cú pháp trước code. Không suy selector từ layer hoặc wireframe. Chưa có adapter/DS nên không đóng design/G4.
-->

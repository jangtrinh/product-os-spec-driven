# UIUX rubric bắt buộc và adapter contract
Source: format/design-model.md §6; SPEC.md §10. Dùng cùng A–E và eligibility trong review-rubric.md. Mỗi applicable criterion mandatory score 2. Không averaging/taste threshold thay floor. Critical/Major block; accepted Minor cần PO reason/follow-up.

| Id | Criterion | Evidence bắt buộc |
|---|---|---|
| UI-TASK | Hoàn thành task đúng AC gốc | Original AC, final-build interaction result |
| UI-STATES | Screen/state/role×scope đủ | Inventory + exact qualified AC/SCN matrix + exclusions reason/confirmer |
| UI-IA | Findability, flow, progressive disclosure | Flow source + thao tác tìm control/context/consequence |
| UI-RESULT | Action consequences/error recovery | Trước thao tác/observable outcome/partial/error path |
| UI-DS | Token/component/pattern đúng authority | Profile/source hashes, catalog handles, reuse/departure decision + consumer census |
| UI-RESPONSIVE | Geometry/spacing/no overflow | Probe + screenshot từng viewport/mode và breakpoint ±1 khi brief đòi |
| UI-A11Y | Keyboard/focus/labels/contrast | Actual DOM/a11y measurements + keyboard/focus checks; overlays/targets/forms/reduced-motion theo floor |
| UI-COPY | Locale/copy/glossary rõ | Copy catalog/source key, NFC/diacritics/placeholders/units, rendered semantic review |
| UI-PROVENANCE | Source và evidence current | Final build/env/DS/probe/prompt/scenario/test pins, exact cell identity, independent visual inspection |

NA cần reason/authority confirmer + score null; hiển thị ngoài passed numerator. All-NA/empty → NOT_RUN, giữ nguyên verdict, không eligible. Unavailable browser/font/plugin/DS là BLOCKED/NOT_RUN + recovery, không NA tự động.

## Adapter extension contract
Profile design_adapter local xác định id/version, authority read order/scoped rulings, token source/owner/sync direction/generated mirrors, catalogs APIs + stable handles, locales/copy/UX writing, capabilities/providers, viewport/mode và rubric paths. Các bản xuất spec có raw hash khớp project source. Adapter adds mandatory criteria với stable id/question/evidence/NA policy/version/source. Không xóa, giảm mandatory floor, waive core score 2 hoặc severity. Specificity/craft/taste bổ sung, không thay behavioral AC. Shared-owner change cần alternatives/consumer inventory/decision trước mutation.
A project design-system adapter có thể thêm Operate và scoped current rulings có nguồn; adapter khác không tự thừa hưởng chúng. Core không hardcode broker/plugin/CLI/palette/provider. Capability missing ghi riêng, không dùng bridge khác chưa cho phép.

## Visual evidence matrix
Mỗi cell: screen/state/role/scope/qualified SCN/width/height/mode/locale/fixture. Default widths 375/768/1440, explicit heights, light/dark; project design-system adapter có thể thêm 874×827, brief thêm breakpoint ±1. Enumerate allowed tuples + source-backed exclusions, không count-only. Single receipt may cover SCN only after exact association checked; viewer/project khác admin/workspace.
Executed receipt: actual exit PASS/FAIL, nonnull browser/build/DS/probe/PNG/measurements, local artifacts+digests, actual capture time. Unexecuted: full requested context, exit null, selected 0, freshness MISSING, real log/hash/recovery, capture outputs absent/null, passed AC rỗng. Không dựng path capture giả.
Mỗi applicable cell cần final screenshot, structural/layout probe, keyboard/focus/label/a11y, interaction/AC và independent visual inspection. Wireframe/old image/reader screenshot không đóng feature G4. Coded/wireframe role/reason, denied/missing/retired assets và generated sources đúng provenance. No-UI PO-confirmed semantic applicability khác NOT_REQUIRED role gate. Coverage một AC chỉ đạt khi tất cả mandatory associated SCN có CURRENT domain-appropriate evidence.

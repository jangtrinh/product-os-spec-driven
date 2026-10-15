# Template manifest
Dùng [spec.manifest.json](spec.manifest.json) làm ví dụ điền hợp lệ. File JSON đó là nguồn ví dụ duy nhất, không có bản chép trong comment. Owner clarification cho A2.1: strict JSON tự mang filled example.

Format 2, title, tests_root, glossary và artifacts là required. Path theo spec root. Chỉ folder có file mới khai báo folder; planned artifact không folder. Default project dùng readable limits 6–8 epics/3–7 capabilities khi không có customization; limits 1 trong JSON chỉ cho corpus cú pháp nhỏ, không đổi project scope.
Design/UIUX bật cần manifest design profile/inventory và ui_contract required từ design output; source sidecar chỉ generator sinh. gate_model dùng exported copies có digest khớp project registries. Các field này xem format/schema/manifest.schema.json và format/packet-interchange.md. Không khai báo legacy-absent trong spec viết mới.

Optional gate_model.records (AM-2/AM-4) exports fixed definitions/gates/transitions/exceptions/decisions/packets/clarify/expected/audit paths; absent là Q-record checks NOT RUN, không PASS. Live registry runner vẫn enforce. Không viết tay generated source sidecar.

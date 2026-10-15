VERDICT: NOT_RUN

# Rubric review — PRODUCT:OS Spec Driven
Dòng đầu trên là trạng thái mẫu khi chưa có lượt review, không phải kết quả chấm project. Mọi report reviewer bắt đầu bằng một dòng `VERDICT:` chọn PASS/NEEDS_CHANGES/FAIL/BLOCKED/NOT_RUN.

## Independence và inputs
Reviewer fresh process/chat, read-only, đọc exact stage context + prompt + rubric + original source/AC + outputs/evidence ở candidate pins. Không nhận chat/self-grade của writer. Reviewer từng sửa artifact không independent; trả BLOCKED. Manual dùng chat mới, lưu file kết quả rồi runner --result; thiếu independence công bố và không chốt G3/G4/G5.

## A–E và thang điểm
| Criterion | Câu hỏi bắt buộc |
|---|---|
| A — Bám nguồn | Mọi ý nguồn được phản ánh hoặc có PO exclusion reason? Có câu không nguồn, assumption thành fact, expected trái ruling? |
| B — Rõ nghĩa | Ai làm gì/kết quả gì rõ, flow/branch/permission không hiểu hai cách? |
| C — Kiểm được | AC/scenario có input/steps/observable expected; method/evidence đúng phạm vi? |
| D — Nhất quán | Contract/REQ/US/glossary/decision/version/DS/locale có cùng nghĩa và trace? |
| E — Văn phong | Readable/role text theo writing-rules; build source ids giữ được; không marketing/author notes? |

0 = thiếu/sai; 1 = còn cần làm rõ; 2 = đạt với quote/file:line/measurement. Baseline FAIL/WEAK/PASS tương ứng 0/1/2 để điền verdict. Mỗi applicable mandatory criterion phải 2. Không lấy trung bình, không giảm threshold.

| Đối tượng | Tiêu chí thêm, tất cả mandatory |
|---|---|
| Clarify | Năm problem groups, prior answers, question dedup/dependencies/dispositions |
| PRD | Problem/outcome, in/out scope, rules/sources/assumptions, dependencies/delivery |
| US/TDD | Đúng scope/source, flow/data/rules/edge cases, observable AC, ≥1 reviewed SCN/AC, method/test/evidence, valid RED |
| Design/UIUX | Core rules/uiux-rubric.md + declared adapter rubric, original AC, authority/DS/locale, screen/state/role/source/final-build evidence |
| Bundle/handoff | Versions/current exact approval/closure/propagation, complete references/dependencies, immutable baseline/receiver state |

## Applicability và VERDICT
Criterion record: id, mandatory, applicability applicable, score 0/1/2, evidence. Legacy omitted applicability defaults applicable. NA: applicability na, score null, nonempty reason + authority confirmer; vẫn hiện, không vào passed numerator.
Tính trên applicable criteria: any 0 → FAIL; else any 1 hoặc finding open/accepted-minor → NEEDS_CHANGES; else nonempty all 2 và no remaining finding → PASS. Empty/all-NA → NOT_RUN, persist unchanged, không eligible. Fixed/rejected giữ history, không remaining. Tool/timeout/missing/corrupt source → BLOCKED, không PASS.
Review bật ghi verdict thật PASS/NEEDS_CHANGES/FAIL/BLOCKED/NOT_RUN. Review tắt: enabled false, independent false, verdict null, criteria/findings rỗng. Review tắt không chứng minh quality acceptance.

## Severities và C4 blocking rule
| Severity | Reproduced tác động | Điều kiện đi tiếp |
|---|---|---|
| Critical | Xây sai yêu cầu, phá floor/phạm vi/quyền, không bàn giao được | Chặn |
| Major | Thiếu rule/AC/state/required evidence; người đọc phải đoán hành vi | Chặn |
| Minor | Trình bày/nhất quán không đổi nghĩa/hành vi | Sửa hoặc PO chấp nhận có lý do + follow-up |

Eligibility = current required eval/evidence + independent review + mọi applicable mandatory criterion 2 + không remaining Critical/Major + mỗi retained Minor accepted by PO reason/follow-up. NEEDS_CHANGES chỉ do accepted Minor có thể eligible nhưng observed verdict giữ NEEDS_CHANGES. Tiêu chí 1/0 không được waiver bằng Minor. GATE: NOT_REQUIRED chỉ bỏ human stop. Không tự downgrade severity/false PASS.

## Report và finding disposition log
Ngay sau VERDICT: NOT verified trước conclusion, revision/build/domain/context/rules/prompt pins, actual commands/cwd/exits, coverage selected AC/SCN/NA/exclusions, quote evidence.

| Criterion | Applicability | Score | Evidence | Reason | Confirmer |
|---|---|---|---|---|---|
| <id> | applicable | 0/1/2 | <file:line + quote> | — | — |

| Id | File:line | Criterion | Severity | Impact | Fix | Owner | Disposition | Reason | Accepted by | Follow-up |
|---|---|---|---|---|---|---|---|---|---|---|
| <finding-id> | <path:line> | <existing criterion id> | Major | <reproduced effect> | <action> | <email/role> | open | <source> | — | — |

Append mỗi round trong review/log/<stage>.md: candidate/scope/pins, evaluator/prompt/rules versions, verdict và bảng trên. fixed cần final edit/eval/re-review evidence; rejected cần source-backed decision quote; accepted-minor chỉ Minor + PO email/reason/follow_up; open giữ blocker. Không sửa history hoặc tự nhận decision. Newer same-subject ruling supersedes, không xóa old row.

## Loops và semantic review
Sau mỗi repair: affected eval rồi reviewer fresh read-only. Persist caps default max_fix 3/max_review 3 qua restart/finding lineage/revision. Dừng PASS, no edits, hoặc exhausted; dừng không là đạt. Last FAIL/no edits/exhausted trả runner 2 + owner/recovery. Scoped continuation cần PO decision/rationale/extra rounds/expiry, giữ prior counters.
Changed expected quay về AC/REQ/PO amendment. Kiểm rule→qualified AC outcome→SCN steps/expected→screen/state/selector target→current test/visual receipts từng hàng. Tags/hashes chỉ identity, không semantic independence. Incomplete graph/shared consumers → BR-14 broad re-gates, aggregate reruns vẫn cần. Prototype exception không bỏ floors. Finding ngoài scope ghi follow-up; reproduced blocker within scope mới chặn.

Question records clarify-record và expected-result records expected-change theo schemas: preserve prior answers/dispositions, duplicate refs, exact before/after/RED history, PO decision/amendment khi approved. Missing Q-record projection = NOT_RUN, không record checks PASS.

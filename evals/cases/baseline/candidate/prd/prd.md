---
id: eval-prd
type: prd
title: "Spec driven kit"
updated: "2026-10-09"
status: draft
---

## Problem and scope
Preserve the supplied baseline request: PRD, US, gates, evals, YAML role toggles, QC-owned TDD and optional React UI with a declared design system.

## Requirements
| ID | Requirement | Source | US |
|---|---|---|---|
| REQ-01 | PO mặc định bật và có gate | PO input | US-01 |
| REQ-02 | QC và Dev mặc định tắt | PO input | US-01 |
| REQ-03 | TDD thuộc QC | PO input | US-01 |
| REQ-04 | PRD và US có kết quả quan sát | PO input | US-01 |
| REQ-05 | Gate lưu SHA-256 và chờ PO | PO input | US-01 |
| REQ-06 | Eval lưu kết quả và đối chiếu lần trước | PO input | US-01 |

OPEN: PO chưa chọn design system cho UIUX.

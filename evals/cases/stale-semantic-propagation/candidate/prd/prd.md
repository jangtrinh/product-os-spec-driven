---
id: eval-prd
type: prd
title: "Stale semantic propagation"
updated: "2026-10-09"
status: draft
---

## Problem and scope
An amendment changes an expected result. An old SCN with a valid amendment tag is still stale; approval requires source AC and scenario meaning to match on current pins.

## Requirements
| ID | Requirement | Source | US |
|---|---|---|---|
| REQ-01 | Old scenario with an amendment tag cannot establish semantic propagation | PO input | US-01 |
| REQ-02 | Expected-result changes require source AC and PO review | PO input | US-01 |

OPEN: PO has not supplied a new expected outcome.

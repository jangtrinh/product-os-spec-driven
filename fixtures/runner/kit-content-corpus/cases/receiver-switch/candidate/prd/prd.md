---
id: eval-prd
type: prd
title: "Post-handoff receiver switch"
updated: "2026-10-09"
status: draft
---

## Problem and scope
Preserve old immutable baselines. Publication, acknowledgment and receiver switch are separate; moved head or base invalidates G5 and stale approval cannot authorize an incompatible draft.

## Requirements
| ID | Requirement | Source | US |
|---|---|---|---|
| REQ-01 | Publication acknowledgment and switch are separate events | PO input | US-01 |
| REQ-02 | Published baseline bytes remain immutable | PO input | US-01 |

OPEN: Receiver has not elected a baseline switch.

---
id: wireframe-plan
type: note
title: "Wireframes"
updated: "2026-10-13"
status: draft
---
## Screens
| Screen | Title | US | AC |
|---|---|---|---|
| SCR-001 | Saved filters | US-01, US-02, US-03 | US-01.AC-01, US-01.AC-02, US-02.AC-01, US-03.AC-01, US-03.AC-02 |
| SCR-002 | Filter result | US-01, US-02, US-03 | US-01.AC-01, US-01.AC-02, US-02.AC-01, US-03.AC-01, US-03.AC-02 |
## Flows
| US | Path |
|---|---|
| US-01 | SCR-001 --Save filter--> SCR-002 |
| US-02 | SCR-001 --Open filter--> SCR-002 |
| US-03 | SCR-001 --Delete filter--> SCR-002 |
## Wireframes
### SCR-001--normal
```text
+------------------------------------------------------------+
| Saved filters |
| Filter name [My reviews] |
| Save a name up to 40 characters, open a saved filter, or choose delete. |
| Saved filters: Open bugs | Saved |
| [Save filter] [Open filter] [Confirm delete] [Cancel delete] |
+------------------------------------------------------------+
```
### SCR-001--empty
```text
+------------------------------------------------------------+
| Saved filters |
| Filter name [] |
| No saved filters. Save a filter from the current list. |
| [Return to filters] |
+------------------------------------------------------------+
```
### SCR-001--error
```text
+------------------------------------------------------------+
| Saved filters |
| Filter name [Open bugs] |
| A filter with this name exists. Choose a different name. |
| [Return to filters] |
+------------------------------------------------------------+
```
### SCR-001--loading
```text
+------------------------------------------------------------+
| Saved filters |
| Filter name [My reviews] |
| Loading saved filters. |
| [Return to filters] |
+------------------------------------------------------------+
```
### SCR-002--normal
```text
+------------------------------------------------------------+
| Filter result |
| Filter name [My reviews] |
| My reviews appears after save. Opening restores its filtered rows. Confirming delete removes it; cancel keeps it. |
| Saved filters: My reviews | Saved |
| [Return to filters] |
+------------------------------------------------------------+
```
### SCR-002--empty
```text
+------------------------------------------------------------+
| Filter result |
| Filter name [] |
| No saved filters. Save a filter from the current list. |
| [Return to filters] |
+------------------------------------------------------------+
```
### SCR-002--error
```text
+------------------------------------------------------------+
| Filter result |
| Filter name [Open bugs] |
| A filter with this name exists. Choose a different name. |
| [Return to filters] |
+------------------------------------------------------------+
```
### SCR-002--loading
```text
+------------------------------------------------------------+
| Filter result |
| Filter name [My reviews] |
| Loading saved filters. |
| [Return to filters] |
+------------------------------------------------------------+
```

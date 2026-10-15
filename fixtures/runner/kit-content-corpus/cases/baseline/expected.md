# Expected outcomes

Required and forbidden literal content is checked only in the named generated artifact. OPEN text must stay unanswered; fixture output is not model quality evidence.

```eval-expectations
{
  "must_have": [
    {
      "file": "prd/prd.md",
      "text": "PO mặc định bật và có gate"
    },
    {
      "file": "prd/prd.md",
      "text": "QC và Dev mặc định tắt"
    },
    {
      "file": "prd/prd.md",
      "text": "TDD thuộc QC"
    },
    {
      "file": "prd/prd.md",
      "text": "PRD và US có kết quả quan sát"
    },
    {
      "file": "prd/prd.md",
      "text": "Gate lưu SHA-256 và chờ PO"
    },
    {
      "file": "prd/prd.md",
      "text": "Eval lưu kết quả và đối chiếu lần trước"
    },
    {
      "file": "prd/prd.md",
      "text": "OPEN: PO chưa chọn design system cho UIUX."
    },
    {
      "file": "us/US-01.md",
      "text": "Missing authority keeps dependent scope pending."
    }
  ],
  "must_not_have": [
    {
      "file": "prd/prd.md",
      "text": "PO approved all unresolved choices."
    },
    {
      "file": "us/US-01.md",
      "text": "The unanswered question is settled automatically."
    }
  ]
}
```

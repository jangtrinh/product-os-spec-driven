# Expected outcomes

Required and forbidden literal content is checked only in the named generated artifact. OPEN text must stay unanswered; fixture output is not model quality evidence.

```eval-expectations
{
  "must_have": [
    {
      "file": "prd/PRD.md",
      "text": "REQ-01"
    },
    {
      "file": "us/US-03.md",
      "text": "Chọn Delete filter rồi huỷ"
    },
    {
      "file": "ux/ui-contract.md",
      "text": "S01"
    }
  ],
  "must_not_have": [
    {
      "file": "us/US-03.md",
      "text": "Cancel also deletes the filter"
    },
    {
      "file": "prd/PRD.md",
      "text": "The unanswered question is settled automatically."
    }
  ]
}
```

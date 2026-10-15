# Expected outcomes

Required and forbidden literal content is checked only in the named generated artifact. OPEN text must stay unanswered; fixture output is not model quality evidence.

```eval-expectations
{
  "must_have": [
    {
      "file": "prd/prd.md",
      "text": "Publication acknowledgment and switch are separate events"
    },
    {
      "file": "prd/prd.md",
      "text": "Published baseline bytes remain immutable"
    },
    {
      "file": "prd/prd.md",
      "text": "OPEN: Receiver has not elected a baseline switch."
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

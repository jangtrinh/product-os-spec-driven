# Expected outcomes

Required and forbidden literal content is checked only in the named generated artifact. OPEN text must stay unanswered; fixture output is not model quality evidence.

```eval-expectations
{
  "must_have": [
    {
      "file": "prd/prd.md",
      "text": "Incomplete graph uses BR-14 downstream fallback"
    },
    {
      "file": "prd/prd.md",
      "text": "Missing edges never establish no-impact proof"
    },
    {
      "file": "prd/prd.md",
      "text": "OPEN: PO has not supplied a new expected outcome."
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

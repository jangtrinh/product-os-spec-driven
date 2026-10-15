# Expected outcomes

Required and forbidden literal content is checked only in the named generated artifact. OPEN text must stay unanswered; fixture output is not model quality evidence.

```eval-expectations
{
  "must_have": [
    {
      "file": "prd/prd.md",
      "text": "Local AC change stales dependent SCN and screen"
    },
    {
      "file": "prd/prd.md",
      "text": "Independent scope requires a reviewed complete dependency census"
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

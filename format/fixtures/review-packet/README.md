# Linked packet contract fixture

A small no-UI concept fixture for [runner/reader interchange](../../packet-interchange.md). All hashes bind the checked-in raw files and canonical JSON, not invented placeholder digests. The receipt/decision are explicitly **illustrative declarations**: no runner, feature, authenticated PO, independent product review or real acceptance is claimed by this fixture.

| Link | Contract role |
|---|---|
| [US-16](us/US-16.md), [immutable baseline](us/US-16.before.md), [D1](decisions/decisions.md) | member source, before revision and no-UI authority |
| [candidate-manifest](candidate-manifest.json), [baseline manifest](baseline-manifest.json) | source raw-byte hashes and exact qualified AC membership/revision |
| [packet-data](packet-data.json) | complete schema payload, candidate/baseline pins, propagation, receipt, requests, digest-bound source inputs |
| [decision](decision.json), declared receipt artifact | compatible exported decision and receipt artifact join; fixture does not authenticate assertions |
| [stale pins](red-stale-pins.json), [unknown scope](red-unknown-scope.json), [digest mismatch](red-digest-mismatch.json) | independently schema-valid RED imports, each rejected by semantic digest/scope/pin checks before mutation |

From kit root run `SPEC_AJV_MODULE=<installed-ajv-dist/2020> node format/checks/schema-suite.cjs`. It validates all local schemas/formats; checks actual member/log artifact hashes, canonical packet bytes, scope revision and packet id; accepts the linked positive decision and rejects each RED. This developer oracle does not replace P4/P5 implementation or the controller's PO-origin/eligibility verification. Expected later CLI paths are in the interchange document, not implemented here. No HTML packet is fabricated for this specification phase.

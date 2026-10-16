# Eval harness

Run `node tools/evals/run-evals.mjs --fake` for the offline deterministic case harness; run `node --test tools/evals/test/` for its tests. `node tools/evals/verify-negative-controls.mjs` plants an unmet content item and verifies the real CLI exits 1.

## Promote an approved stage

Kit owners can preserve a PO-approved stage as a local regression case:

```sh
node tools/evals/promote-case.mjs --project <dir> --stage <stage> --name <case>
```

The default destination is `evals/promoted/`, which stays out of Git and release bundles. `--out <dir>` selects another local case root. Promotion copies the exact PO input and approved `spec/` outputs, writes literal expectations plus provenance hashes, then runs `run-evals.mjs --fake` against that one case. It refuses with exit 3 without writing a case when the gate is not current and APPROVED, approved bytes differ, PO approvers are absent, or the target exists. A fake-eval failure removes the new case and exits 1.

Each case owns its PO input, authored synthetic candidate, metadata and literal must-have/must-not-have checks in `expected.md`. The baseline input is an unchanged copy of the baseline source. Fake mode replays only declared candidate outputs, using the existing pipeline runner and lint. Candidate documents are seeded before traversal to test integration, rather than to attest model synthesis. Diagnostic gate stops are disabled in fake projects only; the runner still requires G4 final-build eligibility. An expected `not-built` refusal may pass the harness assertion while the raw UI pipeline remains BLOCKED/PENDING with exit 2.

`--agent '<local command>'` configures the writer and fresh read-only rubric reviewer; their stdin/stdout contract is owned by [the pipeline runner](../run/README.md). Provider/model identity remains unverified. With no agent, manual mode stops pending and quality review is NOT_RUN. This CLI does not submit human approvals, supply credentials, install tools, or call a provider on its own.

[Behavior selections](behavior-checks.mjs) execute existing owner operations on each selected case's temporary pipeline project for scope graphs, propagation, caps, role toggles, batch membership/pins, and receiver switches. Results bind project/source identity, before/after hashes, actual operations and concrete observations. Required behavior missing or substituted refuses. Synthetic reviewer/PO authority proves control paths only; these assertions award no document AC/SCN quality credit. Control phases preserve complete review/config backups with checked byte hashes outside the live project root; their paths remain in operation records, subject to OS temporary-file cleanup.

[Accounting](result-accounting.mjs) retains exact requested AC/SCN/scope membership before traversal, including blocked UI, independently of observed output and quality. Harness, raw completed pipelines, literal expected items, members, quality and source preservation remain separate. Missing model/browser capabilities never become NA or a passed quality numerator. Unreadable requested membership has UNKNOWN/null denominator; narrowed reruns mark omitted failed cases not-rechecked rather than resolved.

[Selected input pins](input-pins.mjs) resolve the actual default or external cases root and recheck source, metadata, expectations and candidate bytes. Changed/deleted selected inputs produce STALE/nonzero while retaining observed execution inputs; initially missing required files retain explicit absence. Changes to unselected cases do not stale the selected corpus.

Results retain child commands, temporary cwd, actual exits, negative controls, pin hashes and prior diff. Temporary projects are removed after each case. `--case <name>` selects one case; `--cases-root <dir>` and `--results <dir>` support isolated checks. `node tools/evals/capture-state.mjs <result.json>` renders the recorded state to PNG using an existing local ImageMagick installation; it is visual CLI evidence, not product/browser acceptance.

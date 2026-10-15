# Security policy

## Supported versions

Security fixes are supported for the current `2.3.x` line. Earlier versions are not supported in this public kit history.

## Reporting a vulnerability

Please use [private vulnerability reporting](https://github.com/jangtrinh/product-os-spec-driven/security/advisories/new) for this repository. Include the affected version, a minimal reproduction, impact, and any suggested mitigation. Do not post exploitable details in a public issue.

## Threat model

This kit runs locally. Its writer and reviewer integrations execute the command configured by the project owner with a local stage context. The runner uses argument-vector process spawning rather than a shell (`tools/run/command-process.mjs`), and builds stage context from declared project and kit inputs (`tools/run/stage-context.mjs`).

Writer and reviewer output can contain secrets printed by a configured CLI. Before a failed command's stderr is written under `review/log/`, the runner passes it through `redact()` (`tools/run/stage-runner.mjs`, `tools/run/command-process.mjs`). Redaction is pattern-based, so project owners should not intentionally send sensitive values to an agent CLI's stderr.

The kit itself makes no network requests: its runtime code launches owner-configured local commands and uses local filesystem/process APIs (`tools/run/command-process.mjs`). A configured writer or reviewer CLI may have its own network behavior; that is outside this kit's control.

## Operational guidance

- Treat project specifications and generated records as potentially sensitive.
- Review the configured writer and reviewer commands before running a stage.
- Keep project directories under access controls appropriate to their content.
- Upgrade to the latest supported release when a security fix is published.


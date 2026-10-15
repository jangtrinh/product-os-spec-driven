# Privacy

PRODUCT:OS Spec Driven collects nothing and sends nothing itself. It has no analytics, telemetry, hosted service, or network client in its runtime.

When a project owner runs a stage, the kit prepares local stage context and passes it only to the writer or reviewer command configured for that project. That command may be Codex, Claude Code, Grok, or `manual`; the project owner chooses it in project configuration. The local runner builds that context from declared files in `tools/run/stage-context.mjs` and launches the configured command in `tools/run/command-process.mjs`.

Project content, generated specifications, and run logs remain in the project directory. The kit writes failed command stderr under `review/log/` only after applying its local `redact()` helper (`tools/run/stage-runner.mjs`, `tools/run/command-process.mjs`). Pattern-based redaction reduces accidental disclosure but is not a substitute for keeping sensitive data out of command output.

The configured writer or reviewer CLI is separate software with its own privacy policy and network behavior. Review that provider's policy before selecting it.


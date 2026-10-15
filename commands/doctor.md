---
description: Check local PRODUCT:OS Spec Driven prerequisites and project readiness.
argument-hint: "[--project <dir>]"
---

Run the kit doctor from the plugin root:

```sh
node tools/run/doctor.mjs
```

To check an initialized project and its configured writer and reviewer commands:

```sh
node tools/run/doctor.mjs --project <dir>
```

Report the command output and exit code. Do not change project configuration as part of this command.


# Doctor prompt

Run the local kit readiness check:

```sh
node tools/run/doctor.mjs
```

For an initialized project, check the configured writer and reviewer commands:

```sh
node tools/run/doctor.mjs --project <dir>
```

Return the command output and exit code. Do not change project configuration while diagnosing readiness.


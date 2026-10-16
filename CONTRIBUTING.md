# Contributing

Thanks for helping improve this source-available kit. By contributing, you agree that your contribution is provided under the repository's [PolyForm Noncommercial 1.0.0 license](LICENSE). Commercial use requires the licensor's permission.

## Contribution rules

- Start with a failing test for a behavior change, then make the smallest generic fix that passes it.
- Follow the D48 rule: fix the shared cause, do not add a one-off bypass, and do not weaken a safety or delivery gate to make a case pass.
- Use Conventional Commits, such as `feat(run): add a project check` or `fix(reader): preserve local links`.
- Keep public content free of retired names, client material, and machine-specific paths. Run the hygiene guard before proposing a change.
- For a kit problem, use the [kit feedback issue form](.github/ISSUE_TEMPLATE/kit-feedback.yml) after removing project data.

## Run the gates

Run these from the repository root:

```sh
node --test tools/run/test/
node --test tools/lint/test/
node --test tools/reader/test/
node --test tools/evals/test/
node --test tools/release/test/
```

For the public-content check specifically:

```sh
node --test tools/release/test/public-hygiene.test.mjs
```

Do not change a test merely to conceal a failing public or runtime contract. Explain scope, tests run, and any remaining limitation in your pull request.


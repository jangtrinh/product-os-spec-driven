# Cookbook

These recipes use the commands currently shipped by the kit. Replace placeholders such as `<dir>` and `<po-email>` with your project values.

## 1. Install the plugin

For a PO using Claude Code:

```text
/plugin marketplace add jangtrinh/product-os-spec-driven
/plugin install spec@product-os-spec-driven
/spec:setup
```

## 2. Create a project

Run from the kit directory. This creates a new project outside the kit.

```sh
node tools/run/doctor.mjs
node tools/run/init.mjs --project <dir> --name "<project name>" --lang vi --writer codex --reviewer grok
(cd <dir> && npm install ajv@8)
node tools/run/doctor.mjs --project <dir>
```

## 3. Run a stage and decide

```sh
node tools/run/run.mjs --project <dir> --head fresh-source --build not-built
node tools/run/decide.mjs --project <dir> --stage <stage> --as <po-email> --approve
```

## 4. Use manual mode

```sh
node tools/run/run.mjs --project <dir> --head fresh-source --build not-built --result response.txt
node tools/run/run.mjs --project <dir> --head fresh-source --build not-built --result review.txt --independent-review
```

## 5. Render the reader

```sh
cd <dir>
node tools/reader/render.mjs spec --out <view-dir> --offline
```

Open `<view-dir>/offline/index.html` in a browser.

## 6. Upgrade a project

```sh
node tools/run/init.mjs --project <dir> --upgrade --dry-run
node tools/run/init.mjs --project <dir> --upgrade
node tools/run/doctor.mjs --project <dir>
```

## 7. Run doctor

```sh
node tools/run/doctor.mjs
node tools/run/doctor.mjs --project <dir>
```


import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseYaml} from '../../lib/config/yaml-parser.mjs';

const read = file => fs.readFileSync(file, 'utf8');

test('T7: feedback guide has required fields, redaction, explicit Post consent, and matching issue-form ids', () => {
  const feedback = read('docs/feedback.md');
  for (const field of ['kit version', 'host and CLI', 'command run', 'exit code', 'what happened', 'what was expected', 'kit error lines']) assert.match(feedback, new RegExp(field, 'i'));
  for (const rule of ['project or customer names', 'prices', 'emails', 'spec text', 'file contents', '<project>', 'home paths.*~']) assert.match(feedback, new RegExp(rule, 'i'));
  assert.match(feedback, /never post without an explicit[\s`]*Post/i);
  assert.match(feedback, /Post\s*\/\s*Edit\s*\/\s*Don't post/i);
  assert.match(read('skills/_shared/rules.md'), /docs\/feedback\.md/);
  const issue = parseYaml(read('.github/ISSUE_TEMPLATE/kit-feedback.yml'), 'kit-feedback.yml');
  const ids = issue.body.filter(row => row.id).map(row => row.id);
  assert.deepEqual(ids.sort(), ['command', 'error-lines', 'exit-code', 'expected', 'host-cli', 'kit-version', 'occurred', 'project-data-removed'].sort());
});

test('T9: every shipped skill command is listed in the plain-language PO command table', () => {
  const table = read('docs/po-quickstart.md');
  const commands = fs.readdirSync('skills', {withFileTypes: true}).filter(entry => entry.isDirectory() && fs.existsSync(path.join('skills', entry.name, 'SKILL.md'))).map(entry => `/spec:${entry.name}`);
  const missing = commands.filter(command => !table.includes(command));
  assert.deepEqual(missing, [], `missing PO command-table rows: ${missing.join(', ')}`);
  assert.match(read('skills/_shared/rules.md'), /plain PO words.*po-quickstart|po-quickstart.*two commands fit/i);
});

test('T10: README host claims and the Pages facts stay on the tested-host boundary', () => {
  const readme = read('README.md');
  const page = read('docs/index.html');
  assert.match(readme, /Claude Code.*plugin/i);
  assert.match(readme, /Codex and Grok/);
  assert.match(readme, /Factory has plugin manifests that have not been smoke-tested\./);
  assert.doesNotMatch(readme, /Antigravity/i);
  assert.match(readme, /version-2\.4\.0/);
  assert.match(page, /version-2\.4\.0/);
  assert.match(page, /Install the Claude Code plugin/);
});

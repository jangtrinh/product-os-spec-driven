#!/usr/bin/env node
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig, STAGES} from '../lib/config/config-loader.mjs';
import {localPath, sha256} from '../lib/config/path-selection.mjs';
import {readGate} from '../run/gate-files.mjs';
import {runEvalSuite} from './run-evals.mjs';

const kit = fileURLToPath(new URL('../../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help') return {help: true};
    if (!['--project', '--stage', '--name', '--out'].includes(flag) || result[flag.slice(2)] || !argv[index + 1] || argv[index + 1].startsWith('--')) throw Error(`Unknown or missing ${flag}`);
    result[flag.slice(2)] = argv[++index];
  }
  for (const name of ['project', 'stage', 'name']) if (!result[name]) throw Error(`Required --${name}`);
  if (!STAGES.includes(result.stage)) throw Error(`Unknown stage: ${result.stage}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(result.name)) throw Error('--name must use lowercase letters, numbers, and hyphens');
  result.project = path.resolve(result.project);
  result.out = path.resolve(result.out ?? path.join(kit, 'evals/promoted'));
  return result;
}

function files(root, directory = '') {
  return fs.readdirSync(path.join(root, directory), {withFileTypes: true})
    .flatMap(entry => entry.isDirectory() ? files(root, path.join(directory, entry.name)) : [path.posix.join(directory, entry.name)])
    .sort();
}

function expectedCase(candidate) {
  const markdown = files(candidate).filter(file => file.endsWith('.md'));
  const headings = markdown.flatMap(file => {
    const line = fs.readFileSync(path.join(candidate, file), 'utf8').split(/\r?\n/).find(row => /^#{1,6}\s+\S/.test(row));
    return line ? [{file, text: line}] : [];
  });
  if (!headings.length) throw Error('approved outputs contain no Markdown heading');
  const must_have = [headings[0]];
  const must_not_have = [];
  for (const file of markdown) {
    const lines = fs.readFileSync(path.join(candidate, file), 'utf8').split(/\r?\n/);
    const header = lines.findIndex(line => /^\|.*\bThen\b.*\|$/.test(line));
    if (header >= 0) {
      const columns = lines[header].split('|').map(value => value.trim());
      const then = columns.findIndex(value => value === 'Then');
      for (const row of lines.slice(header + 2)) {
        if (!row.startsWith('|')) break;
        const value = row.split('|').map(cell => cell.trim())[then];
        if (value) must_have.push({file, text: value});
      }
    }
    for (const line of lines) {
      const blocked = /^OPEN\[blocking\]:\s*(.+)$/.exec(line);
      if (blocked) must_not_have.push({file, text: blocked[1]});
    }
  }
  return {must_have, must_not_have};
}

function verifiedOutputs(root, config, gate) {
  const receiptId = gate.data.model.receipts?.[0];
  if (!receiptId) throw Error('approved gate has no receipt');
  const receipt = JSON.parse(fs.readFileSync(localPath(root, `${config.gates.receipts_dir}/${receiptId}.json`), 'utf8'));
  const outputs = gate.data.outputs;
  const rows = Object.entries(outputs).sort(([left], [right]) => left.localeCompare(right));
  if (!rows.length) throw Error('approved gate has no outputs');
  return rows.map(([file, digest]) => {
    if (!file.startsWith('spec/')) throw Error(`approved output is outside spec/: ${file}`);
    const actual = sha256(fs.readFileSync(localPath(root, file)));
    if (actual !== digest) throw Error(`hash mismatch: ${file}`);
    if (receipt.artifacts?.[file] !== digest) throw Error(`hash mismatch: ${file}`);
    return {source: file, target: file.slice('spec/'.length)};
  });
}

function writeCase(root, target, config, stage, gate) {
  const poSpec = localPath(root, 'input/po-spec.md');
  if (!fs.existsSync(poSpec)) throw Error('missing input/po-spec.md');
  const approvers = config.roles.po.approvers ?? [];
  if (!approvers.length) throw Error('roles.po.approvers is empty');
  if (!gate.data.approval?.by || !approvers.includes(gate.data.approval.by) || !gate.data.approval.at) throw Error('approved gate has no recognized PO approval');
  const outputs = verifiedOutputs(root, config, gate);
  fs.mkdirSync(target, {recursive: true});
  const candidate = path.join(target, 'candidate');
  fs.mkdirSync(candidate);
  fs.copyFileSync(poSpec, path.join(target, 'po-spec.md'));
  for (const output of outputs) {
    const destination = path.join(candidate, output.target);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(localPath(root, output.source), destination);
  }
  const expected = expectedCase(candidate);
  fs.writeFileSync(path.join(target, 'case.json'), JSON.stringify({name: path.basename(target), title: config.project.name, ui: false, behavior: null, promoted_from: stage}, null, 2) + '\n');
  fs.writeFileSync(path.join(target, 'expected.md'), `# Expected outcomes\n\n\`\`\`eval-expectations\n${JSON.stringify(expected, null, 2)}\n\`\`\`\n`);
  fs.writeFileSync(path.join(target, 'provenance.json'), JSON.stringify({
    project_sha256: hash(root), po_email_sha256: hash(gate.data.approval.by),
    gate: {id: gate.data.model.definition.id, version: gate.data.model.definition.version}, approval: {at: gate.data.approval.at},
  }, null, 2) + '\n');
}

export async function promoteCase(argv = process.argv.slice(2), print = console.log, error = console.error) {
  let target = null;
  try {
    const opt = options(argv);
    if (opt.help) { print('promote-case --project <dir> --stage <stage> --name <case> [--out <dir>]'); return 0; }
    const config = loadConfig(opt.project);
    const gate = readGate(opt.project, config, opt.stage);
    if (!gate || gate.value !== 'APPROVED' || gate.data.model.states.freshness !== 'CURRENT') throw Error(`gate not approved: ${opt.stage}`);
    const destination = path.join(opt.out, opt.name);
    if (fs.existsSync(destination)) throw Error(`case already exists: ${destination}`);
    // Arm cleanup only for a directory this run creates; a refused existing case stays intact.
    target = destination;
    writeCase(opt.project, target, config, opt.stage, gate);
    const results = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-case-evals-'));
    try {
      const run = await runEvalSuite({fake: true, casesRoot: opt.out, cases: [opt.name], results});
      if (run.exit !== 0) { fs.rmSync(target, {recursive: true, force: true}); target = null; error(`fake eval failed: ${run.result.findings.join('; ')}`); return 1; }
    } finally { fs.rmSync(results, {recursive: true, force: true}); }
    print(`Promoted ${opt.name}; fake eval: green`);
    return 0;
  } catch (caught) {
    if (target && fs.existsSync(target)) fs.rmSync(target, {recursive: true, force: true});
    error(caught.message);
    return 3;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await promoteCase();

#!/usr/bin/env node
/* packet: deterministic batch review packet from a change set (gate-model §7, packet-interchange §3-§4).
   usage: node tools/reader/packet.mjs <spec> --project <root> --config <project-relative-path> --change-set <id> --out <new-dir>
   Writes <out>/packet-data.json (canonical bytes) and <out>/index.html (self-contained). Refuses a non-empty destination.
   Exit 0 = packet generated, NOT approved; 3 = invalid input/config/digest/membership; 4 = a local tool or asset is unavailable.
   It writes no gate, audit or decision record. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../lib/config/config-loader.mjs';
import { RunnerError } from '../lib/config/path-selection.mjs';
import { lintSpec } from '../lint/index.mjs';
import { loadPacketSpec } from './packet/spec-context.mjs';
import { buildPacketData } from './packet/packet-data.mjs';
import { renderPacketHtml } from './packet/packet-html.mjs';
import { bindDisplayedSources, makeSupportBinder } from './packet/source-binding.mjs';

const USAGE = 'usage: node tools/reader/packet.mjs <spec> --project <root> --config <path> --change-set <id> --out <new-dir>';
const fail = (message, code) => { console.error(message); process.exit(code); };

export function parseArgs(argv) {
  const opts = { config: 'config/pipeline.yaml' }; const names = { '--project': 'project', '--config': 'config', '--change-set': 'changeSet', '--out': 'out' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (names[a]) { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new RunnerError(`Missing value for ${a}`, 3); opts[names[a]] = argv[++i]; }
    else if (a.startsWith('--') || opts.spec) throw new RunnerError(`Unsupported argument ${a}`, 3);
    else opts.spec = a;
  }
  for (const k of ['spec', 'project', 'changeSet', 'out']) if (!opts[k]) throw new RunnerError(`Missing ${k === 'changeSet' ? '--change-set' : k === 'spec' ? '<spec>' : `--${k}`}`, 3);
  return opts;
}

export function generate(opts) {
  const root = path.resolve(opts.project), specDir = path.resolve(opts.spec), out = path.resolve(opts.out);
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new RunnerError(`Output directory is not empty: ${out}`, 3);
  /* One snapshot of the exported spec: lint, index, hash and render all read these same bytes, never the live directory twice. */
  const snap = fs.mkdtempSync(path.join(os.tmpdir(), 'packet-spec-'));
  let built, html;
  try {
    fs.cpSync(specDir, snap, { recursive: true });
    const lint = lintSpec(snap);
    const errors = lint.problems.list.filter((p) => p.severity !== 'warning');
    if (errors.length) throw new RunnerError(`Spec has ${errors.length} lint error(s); an invalid spec cannot produce a packet. First: ${lint.problems.format(errors[0])}`, 3);
    const config = loadConfig(root, opts.config);
    const spec = loadPacketSpec(snap);
    const specRoot = config.project.spec_root.replace(/^\.\//, '').replace(/\/+$/, '').replace(/^\.$/, '');
    const support = makeSupportBinder({ snapshotDir: snap, specRoot });
    built = buildPacketData({ root, config, changeId: opts.changeSet, spec, specRoot, support });
    const bound = bindDisplayedSources({ snapshotDir: snap, specRoot, stories: spec.stories, membership: built.data.membership, scopeIds: built.data.scope.ids });
    Object.assign(bound.sources, support.sources);
    try { html = renderPacketHtml({ built, spec, root, bound }); } catch (e) { if (e.code === 'ENOENT') throw new RunnerError(`Local asset unavailable: ${e.path}`, 4); throw e; }
  } finally { fs.rmSync(snap, { recursive: true, force: true }); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'packet-data.json'), built.json);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  return { out, packetId: built.packetId, dataSha: built.dataSha, files: ['packet-data.json', 'index.html'], changeState: built.changeState, scope: built.data.scope.ids.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const r = generate(parseArgs(process.argv.slice(2)));
    console.log(`packet ${r.packetId}\n  ${path.join(r.out, 'packet-data.json')}\n  ${path.join(r.out, 'index.html')}\n${r.scope} criteria in scope; change set state ${r.changeState}. Generated, NOT approved.`);
  } catch (e) {
    if (e instanceof RunnerError) fail(`${e.message}\n${USAGE}`, e.code === 4 ? 4 : 3);
    throw e;
  }
}

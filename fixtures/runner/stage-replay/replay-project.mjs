import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here = fileURLToPath(new URL('./', import.meta.url));
const kit = fileURLToPath(new URL('../../../', import.meta.url));
export const APPROVER = 'po@example.test';
export const STAGE_ORDER = ['intake', 'clarify', 'contract', 'prd', 'us', 'wireframe', 'prototype', 'tdd', 'handoff'];
export const PINS = ['--head', 'saved-filters-v1', '--build', 'not-built'];
const quote = value => JSON.stringify(value);

// An installed project of this kit (init), driven by replay writer/reviewer commands and the real lint evals.
// overlays: payload roots that win over the shared payloads (for example a different manifest or ledger).
export function replayProject(t, {overlays = [], keepPlaceholders = true, manualAgents = false} = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stage-replay-')));
  t?.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const project = path.join(root, 'project');
  const init = spawnSync(process.execPath, [path.join(kit, 'tools/run/init.mjs'), '--project', project, '--name', 'Saved filters', '--lang', 'vi', '--writer', 'manual', '--reviewer', 'manual'], {encoding: 'utf8'});
  if (init.status !== 0) throw new Error(`init failed: ${init.stdout}${init.stderr}`);
  for (const file of ['po-spec.md', 'answers.md']) fs.copyFileSync(path.join(here, 'input', file), path.join(project, 'input', file));
  const roots = [...overlays, path.join(here, 'payloads')];
  const command = script => `${quote(process.execPath)} ${quote(path.join(here, script))} ${roots.map(quote).join(' ')}`;
  const configFile = path.join(project, 'config/pipeline.yaml');
  let config = fs.readFileSync(configFile, 'utf8');
  config = config.replace(/(\n  po:\n    enabled: true\n    gate: true\n)/, `$1    approvers:\n      - ${quote(APPROVER)}\n`);
  if (!manualAgents) {
    config = config.replace('  writer:\n    command: "manual"', `  writer:\n    command: ${quote(command('replay-writer.mjs'))}`);
    config = config.replace('  reviewer:\n    command: "manual"', `  reviewer:\n    command: ${quote(command('replay-reviewer.mjs'))}`);
  }
  fs.writeFileSync(configFile, config);
  // The declared-folder manifest needs a file in each folder before its stage runs.
  if (keepPlaceholders) for (const folder of ['contract', 'prd', 'us', 'delivery']) { fs.mkdirSync(path.join(project, 'spec', folder), {recursive: true}); fs.writeFileSync(path.join(project, 'spec', folder, '.keep'), ''); }

  const node = (script, args) => {
    const result = spawnSync(process.execPath, [path.join(kit, script), '--project', project, ...args], {encoding: 'utf8', timeout: 240000});
    if (result.error) throw result.error;
    return {code: result.status, out: result.stdout + result.stderr};
  };
  const run = (extra = []) => node('tools/run/run.mjs', [...PINS, ...extra]);
  const decide = (stage, extra = ['--approve']) => node('tools/run/decide.mjs', ['--stage', stage, '--as', APPROVER, ...extra]);
  const read = relative => fs.readFileSync(path.join(project, relative), 'utf8');
  const gate = stage => {
    const file = path.join(project, `review/gates/${stage}.md`);
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    return {value: /^GATE: (\S+)/.exec(raw)[1], data: JSON.parse(/```gate-data\n([\s\S]*?)\n```/.exec(raw)[1])};
  };
  const status = () => {
    const result = spawnSync(process.execPath, [path.join(kit, 'tools/run/status.mjs'), '--project', project, '--json', ...PINS.slice(0, 0)], {encoding: 'utf8'});
    if (result.status !== 0) throw new Error(`status failed: ${result.stdout}${result.stderr}`);
    return JSON.parse(result.stdout);
  };
  // Run the runner until the stage has settled, then approve it when it waits for the PO.
  // A stage whose role is disabled settles as NOT_REQUIRED and needs no decision.
  const settleAndApprove = stage => {
    const first = run();
    if (![0, 2].includes(first.code)) return {ok: false, step: 'run', ...first};
    const current = gate(stage);
    if (current?.value === 'NOT_REQUIRED') return {ok: true, out: first.out};
    if (current?.value !== 'PENDING') return {ok: false, step: 'gate', out: `${stage} gate is ${current?.value ?? 'missing'}\n${first.out}`};
    const approved = decide(stage);
    if (approved.code !== 0) return {ok: false, step: 'decide', ...approved};
    return {ok: true, out: first.out};
  };
  // Every approved earlier gate must still be approved and current.
  const earlierGates = upTo => STAGE_ORDER.slice(0, STAGE_ORDER.indexOf(upTo)).map(stage => {
    const row = status().stages.find(entry => entry.stage === stage);
    return {stage, gate: row?.gate, freshness: row?.freshness, changed: row?.changed_inputs ?? []};
  });
  // Real lint on the current spec tree, exactly as the stage eval runs it.
  const lint = stage => {
    const result = spawnSync(process.execPath, ['tools/lint/lint.mjs', 'spec', '--pipeline', 'config/pipeline.yaml', '--stage', stage], {cwd: project, encoding: 'utf8'});
    return {code: result.status, out: result.stdout + result.stderr, errors: ((result.stdout + result.stderr).match(/ERROR \[[^\]]+\][^\n]*/g) ?? [])};
  };
  // Put the prepared files of the given stages (in order) on disk without running the runner.
  const materialize = (...stages) => {
    const written = {};
    for (const stage of stages) {
      const files = {};
      const walk = (base, dir = '') => {
        for (const entry of fs.readdirSync(path.join(base, dir), {withFileTypes: true})) {
          const relative = path.posix.join(dir, entry.name);
          if (entry.isDirectory()) walk(base, relative); else if (!(relative in files)) files[relative] = fs.readFileSync(path.join(base, relative), 'utf8');
        }
      };
      for (const base of roots) if (fs.existsSync(path.join(base, stage))) walk(path.join(base, stage));
      for (const [relative, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(project, relative)), {recursive: true}); fs.writeFileSync(path.join(project, relative), text); written[relative] = text; }
    }
    return written;
  };
  // The answer the replay agents would give, for a person supplying --result files in manual mode.
  const answer = (script, stage, declared = []) => {
    const result = spawnSync(process.execPath, [path.join(here, script), ...roots], {input: `STAGE: ${stage}\nDECLARED OUTPUTS: ${JSON.stringify(declared)}\n`, encoding: 'utf8'});
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout;
  };
  return {project, answer, lint, materialize, run, decide, gate, read, status, settleAndApprove, earlierGates, write: (relative, text) => { fs.mkdirSync(path.dirname(path.join(project, relative)), {recursive: true}); fs.writeFileSync(path.join(project, relative), text); }};
}

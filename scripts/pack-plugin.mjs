#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const kit = fs.realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const roots = ['README.md', 'SPEC.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'LICENSE', 'llms.txt', 'PRIVACY.md', 'SECURITY.md', 'commands/', 'docs/', 'config/', 'format/', 'prompts/', 'rules/', 'templates/', 'tools/', 'skills/', 'scripts/', '.claude-plugin/', '.codex-plugin/', '.factory-plugin/', 'fixtures/', 'evals/'];
// Dev-run records never ship; a project's own review/evidence/ path is kit content and stays.
const devRecords = ['evals/results/', 'evals/promoted/', 'format/evidence/', 'tools/lint/evidence/', 'tools/migrate/evidence/'];
const excluded = file => file === 'AGENTS.md' || devRecords.some(prefix => file.startsWith(prefix)) || file.split('/').some(part => ['node_modules', '.git', '.brv'].includes(part));
export function packPlugin(argv = process.argv.slice(2), print = console.log) {
  let created;
  try {
    let out, dry = false; const seen = new Set();
    for (let i = 0; i < argv.length; i++) {
      const flag = argv[i]; if (seen.has(flag)) throw Error(`Duplicate ${flag}`); seen.add(flag);
      if (flag === '--help') {print('pack-plugin --out <new-directory-outside-kit> [--dry-run]; stage a slim local marketplace, no publishing.'); return 0;}
      if (flag === '--dry-run') {dry = true; continue;}
      if (flag !== '--out' || !argv[i + 1]?.trim() || argv[i + 1].startsWith('--')) throw Error(`Unknown/missing ${flag}`);
      out = path.resolve(argv[++i]);
    }
    if (!out) throw Error('Required --out');
    let parent = path.dirname(out); while (!fs.existsSync(parent)) parent = path.dirname(parent);
    const realParent = fs.realpathSync(parent);
    if (realParent === kit || realParent.startsWith(kit + path.sep)) throw Error('Output must be outside the kit');
    if (fs.existsSync(out) || fs.lstatSync(out, {throwIfNoEntry: false})) throw Error('Output already exists; choose a new directory');
    const files = [];
    function walk(file) {
      if (excluded(file)) return;
      const full = path.join(kit, file), stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw Error(`Refusing kit symlink ${file}`);
      if (stat.isDirectory()) for (const name of fs.readdirSync(full).sort()) walk(`${file}/${name}`);
      else if (stat.isFile()) files.push(file);
      else throw Error(`Unsupported entry ${file}`);
    }
    for (const root of roots) walk(root.replace(/\/$/, ''));
    const bytes = files.reduce((total, file) => total + fs.statSync(path.join(kit, file)).size, 0);
    print(`${dry ? 'Dry run' : 'Stage'}: ${files.length} files, ${bytes} bytes; no plans, report evidence, history or node_modules.`);
    if (dry) return 0;
    fs.mkdirSync(out, {recursive: true}); created = out;
    for (const file of files) {const target = path.join(out, file); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(path.join(kit, file), target, fs.constants.COPYFILE_EXCL);}
    print(`Local marketplace: ${out}; /plugin marketplace add ${out}; /plugin install spec@product-os-spec-driven`);
    return 0;
  } catch (error) {if (created) fs.rmSync(created, {recursive: true, force: true}); print(error.message); return 3;}
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode = packPlugin();

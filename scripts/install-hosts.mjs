#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const kit = fs.realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const commands = ['setup', 'new', 'run', 'clarify', 'gate', 'status', 'view', 'upgrade'];
export function installHosts(argv = process.argv.slice(2), print = console.log) {
  try {
    const opt = {home: os.homedir()}; const seen = new Set();
    for (let i = 0; i < argv.length; i++) {
      const flag = argv[i]; if (seen.has(flag)) throw Error(`Duplicate ${flag}`); seen.add(flag);
      if (flag === '--check') {opt.check = true; continue;}
      if (flag === '--help') {print('install-hosts --host codex|grok [--home <home>] [--check]; links only spec-* skills; never overwrites unrelated skills.'); return 0;}
      if (!['--host', '--home'].includes(flag) || !argv[i + 1]?.trim() || argv[i + 1].startsWith('--')) throw Error(`Unknown/missing ${flag}`);
      opt[flag.slice(2)] = argv[++i];
    }
    if (!['codex', 'grok'].includes(opt.host)) throw Error('Require --host codex|grok');
    const home = path.resolve(opt.home), directory = path.join(home, opt.host === 'codex' ? '.agents/skills' : '.claude/skills');
    const bundle = path.join(home, '.local/share/product-os-spec-driven', createHash('sha256').update(kit).digest('hex').slice(0, 16), opt.host);
    const rows = commands.map(command => {
      const name = `spec-${command}`, target = path.join(bundle, name), link = path.join(directory, name);
      const source = fs.readFileSync(path.join(kit, `skills/${command}/SKILL.md`), 'utf8');
      const body = source.replace(/^name: .*$/m, `name: ${name}`).replaceAll('${CLAUDE_PLUGIN_ROOT}', kit);
      if (body.includes('${CLAUDE_PLUGIN_ROOT}')) throw Error(`Unresolved kit root in ${name}`);
      return {name, link, target, body};
    });
    // Check every collision before creating or changing any file.
    for (const row of rows) {
      if (!fs.existsSync(row.link) && !fs.lstatSync(row.link, {throwIfNoEntry: false})) continue;
      if (!fs.lstatSync(row.link).isSymbolicLink() || path.resolve(path.dirname(row.link), fs.readlinkSync(row.link)) !== row.target) throw Error(`Refusing unrelated skill ${row.link}`);
    }
    if (opt.check) {
      const missing = rows.filter(row => !fs.existsSync(row.link) || !fs.existsSync(path.join(row.target, 'SKILL.md')) || fs.readFileSync(path.join(row.target, 'SKILL.md'), 'utf8') !== row.body);
      for (const row of missing) print(`NOT INSTALLED/current: ${row.name}`);
      if (missing.length) return 1;
      print(`${opt.host}: 8/8 skills installed and current at ${directory}`); return 0;
    }
    fs.mkdirSync(directory, {recursive: true});
    for (const row of rows) {
      fs.mkdirSync(row.target, {recursive: true});
      const file = path.join(row.target, 'SKILL.md');
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== row.body) fs.writeFileSync(file, row.body);
      if (!fs.lstatSync(row.link, {throwIfNoEntry: false})) fs.symlinkSync(row.target, row.link);
      print(`${row.name} -> ${row.target}`);
    }
    print(`${opt.host}: 8/8 skills installed; invoke ${opt.host === 'codex' ? '$spec-status' : '/spec-status'}.`); return 0;
  } catch (error) {print(error.message); return 3;}
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode = installHosts();

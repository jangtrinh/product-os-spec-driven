import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {RunnerError, localPath, sha256} from '../../lib/config/path-selection.mjs';
import {loadPacketSpec} from './spec-context.mjs';
import {buildPacketData} from './packet-data.mjs';
import {makeSupportBinder, bindDisplayedSources} from './source-binding.mjs';

const git = (root, args) => spawnSync('git', args, {cwd: root, maxBuffer: 64 * 1024 * 1024});
function requireGit(root, args) {
  const result = git(root, args);
  if (result.error || result.status !== 0) throw new RunnerError('Packet source at HEAD cannot be read by Git', 4);
  return result.stdout;
}

// Read committed spec bytes without checking out files or trusting a submitted packet.
function copyHeadSpec(root, specDir, head, snapshot) {
  const repo = requireGit(root, ['rev-parse', '--show-toplevel']).toString().trim();
  const prefix = path.relative(repo, specDir).split(path.sep).join('/');
  const entries = requireGit(root, ['ls-tree', '-rz', '--full-tree', head]).toString().split('\0').filter(Boolean);
  let files = 0;
  for (const entry of entries) {
    const tab = entry.indexOf('\t'), header = entry.slice(0, tab), file = entry.slice(tab + 1);
    if (prefix && !file.startsWith(prefix + '/')) continue;
    const rel = prefix ? file.slice(prefix.length + 1) : file;
    const [mode, type, object] = header.split(' ');
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new RunnerError(`Packet source at HEAD has unsupported file type: ${rel}`);
    const dest = localPath(snapshot, rel);
    fs.mkdirSync(path.dirname(dest), {recursive: true});
    fs.writeFileSync(dest, requireGit(root, ['cat-file', 'blob', object])); files++;
  }
  if (!files) throw new RunnerError('Configured packet spec is missing from HEAD');
}

export function rebuildPacketData({root, config, changeId, head}) {
  const specRoot = config.project.spec_root.replace(/^\.\//, '').replace(/\/+$/, '').replace(/^\.$/, '');
  const specDir = localPath(root, config.project.spec_root);
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'packet-import-source-'));
  try {
    if (git(root, ['rev-parse', '--is-inside-work-tree']).status === 0) copyHeadSpec(root, specDir, head, snapshot);
    else {
      if (!fs.existsSync(specDir)) throw new RunnerError('Configured authoritative packet spec is missing');
      fs.cpSync(specDir, snapshot, {recursive: true, filter: file => !['.git', 'node_modules'].includes(path.basename(file))});
    }
    const spec = loadPacketSpec(snapshot), loaded = spec.indexed.spec;
    if (loaded.inputError || loaded.manifestError || loaded.manifest?.format !== '2') throw new RunnerError(`Authoritative packet spec cannot be rebuilt: ${loaded.inputError || loaded.manifestError || 'Spec Format v2 required'}`);
    if (spec.design.errors.length) throw new RunnerError(`Authoritative packet spec input unavailable: ${spec.design.errors[0].rel}`);
    const support = makeSupportBinder({snapshotDir: snapshot, specRoot});
    const built = buildPacketData({root, config, changeId, spec, specRoot, support});
    for (const id of built.data.scope.ids) if (!spec.stories.some(s => s.acs.some(ac => ac.qid === id))) throw new RunnerError(`Authoritative packet spec has no criterion ${id}`);
    bindDisplayedSources({snapshotDir: snapshot, specRoot, stories: spec.stories, membership: built.data.membership, scopeIds: built.data.scope.ids});
    for (const [file, digest] of Object.entries(built.data.assets)) {
      const rel = specRoot ? file.slice(specRoot.length + 1) : file;
      if (sha256(fs.readFileSync(localPath(snapshot, rel))) !== digest) throw new RunnerError(`Packet asset differs from authoritative source at HEAD: ${file}`);
    }
    return built;
  } catch (error) {
    if (error instanceof RunnerError) throw error;
    throw new RunnerError(`Authoritative packet source cannot be rebuilt: ${error.message}`);
  } finally { fs.rmSync(snapshot, {recursive: true, force: true}); }
}

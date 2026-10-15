import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {localPath, sha256, writeLocal} from '../lib/config/path-selection.mjs';

export function snapshotSources(root, stage, context) {
  const digest = sha256(canonical(context.inputs));
  return Object.fromEntries(context.context.map(file => {
    const copy = `review/sources/${stage}/${digest}/files/${file}`;
    writeLocal(root, copy, fs.readFileSync(localPath(root, file)), {immutable: true});
    return [file, copy];
  }));
}

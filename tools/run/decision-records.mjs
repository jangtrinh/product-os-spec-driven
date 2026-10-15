import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {localPath, sha256, RunnerError} from '../lib/config/path-selection.mjs';
import {jsonFile} from './registries.mjs';
import {schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {appendAudit, immutableJson} from './audit-store.mjs';

export function preflightDecision(root, config, decision, schemaName) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(decision.id)) throw new RunnerError('Invalid decision id');
  if (schemaName) validateSchema(decision, schema(schemaName), 'decision');
  const saved = `${config.gates.decisions_dir}/${decision.id}.json`;
  if (fs.existsSync(localPath(root, saved)) && canonical(jsonFile(root, saved)) !== canonical(decision)) throw new RunnerError('Decision id reused with different bytes');
  return saved;
}
// Both human entrypoints use the same immutable record and hash-chained witness.
export function recordDecision(root, config, decision, {refs, dirty, schemaName} = {}) {
  const saved = preflightDecision(root, config, decision, schemaName);
  const event = appendAudit(root, {id: decision.id, type: 'decision', scope: decision.scope, after: sha256(canonical(decision)), refs, actor: decision.by, channel: decision.channel ?? 'direct', reason: `authority: asserted-local; dirty=${dirty}; ${decision.reason}`});
  immutableJson(root, saved, decision, schemaName);
  return {saved, event};
}

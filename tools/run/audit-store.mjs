import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {canonical, parseJson} from '../lib/config/strict-json.mjs';
import {localPath, sha256, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {schema, validateSchema} from '../lib/config/schema-validation.mjs';

export function auditEvents(root) {
  const file = localPath(root, 'review/audit.jsonl');
  if (!fs.existsSync(file)) return [];
  const bytes = fs.readFileSync(file, 'utf8');
  if (bytes && !bytes.endsWith('\n')) throw new RunnerError('review/audit.jsonl: truncated event');
  let previous = null; const ids = new Set(); const events = [];
  for (const line of bytes.split('\n').filter(Boolean)) {
    const event = validateSchema(parseJson(line), schema('audit-event.schema.json'), 'audit');
    if (event.previous_sha256 !== previous || ids.has(event.id)) throw new RunnerError('review/audit.jsonl: broken hash chain or duplicate event');
    previous = sha256(line + '\n'); ids.add(event.id); events.push(event);
  }
  return events;
}
export function appendAudit(root, {id = `event-${randomUUID()}`, type, scope, before = null, after = null, refs = [], reason, actor = 'dev', channel}) {
  const events = auditEvents(root); const previous = events.at(-1);
  const file = localPath(root, 'review/audit.jsonl');
  const raw = previous ? fs.readFileSync(file, 'utf8') : '';
  const priorBytes = raw ? raw.slice(0, -1).split('\n').at(-1) + '\n' : null;
  const event = {id, at: new Date().toISOString(), actor, type, scope, before, after, refs, reason, previous_sha256: priorBytes ? sha256(priorBytes) : null};
  if (channel !== undefined) event.channel = channel;
  const old = events.find(item => item.id === id);
  if (old) {
    const fields = ['type', 'scope', 'before', 'after', 'refs', 'reason', 'actor', 'channel'];
    if (fields.some(key => canonical(key === 'channel' ? old[key] ?? 'direct' : old[key]) !== canonical(key === 'channel' ? event[key] ?? 'direct' : event[key]))) throw new RunnerError(`Audit id reused with different content: ${id}`);
    return old;
  }
  validateSchema(event, schema('audit-event.schema.json'), 'new audit event');
  fs.mkdirSync(localPath(root, 'review'), {recursive: true});
  fs.appendFileSync(file, canonical(event) + '\n');
  // Verify the exact persisted chain immediately; no success from write exit alone.
  auditEvents(root); return event;
}
export function immutableJson(root, relative, record, schemaName) {
  if (schemaName) validateSchema(record, schema(schemaName), relative);
  writeLocal(root, relative, canonical(record) + '\n', {immutable: true});
}

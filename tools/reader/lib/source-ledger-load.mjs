import fs from 'node:fs';
import path from 'node:path';
import { parseJson } from '../../lib/json-strict.mjs';
import { localPath } from '../../lib/local-path.mjs';
import { FORMAT_DIR } from './paths.mjs';

/* The ONLY module that knows the source-ledger and id-crosswalk shapes (format §11, D13/D14). Fixed optional sidecars:
   provenance/source-ledger.json and provenance/id-crosswalk.json (the ledger names its crosswalk relative to itself).
   Validation: the format schema file when this checkout has it, otherwise the structural floor below; the result says which one ran. */
export const LEDGER_PATH = 'provenance/source-ledger.json';
export const STATUSES = ['exact', 'partial', 'conflicting', 'no-demo'];
const KINDS = ['scenario', 'screen-state', 'ac', 'artifact'];
const bad = (errors, at, message) => errors.push({ at, message });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function structuralFloor(ledger, errors) {
  if (!isObj(ledger)) return bad(errors, '(root)', 'ledger must be an object');
  if (ledger.version !== 1) bad(errors, 'version', 'version must be 1');
  if (typeof ledger.crosswalk !== 'string' || !ledger.crosswalk) bad(errors, 'crosswalk', 'crosswalk path is required');
  if (!Array.isArray(ledger.items)) return bad(errors, 'items', 'items must be an array');
  if (!ledger.items.length) return bad(errors, 'items', 'an empty source inventory cannot be a passing ledger');
  const seen = new Set();
  ledger.items.forEach((it, i) => {
    const at = `items[${i}]`;
    if (!isObj(it)) return bad(errors, at, 'an item must be an object; it is left out of the view');
    if (typeof it.id !== 'string' || !it.id) return bad(errors, at, 'item id is required');
    if (seen.has(it.id)) bad(errors, at, `duplicate item id ${it.id}`);
    seen.add(it.id);
    if (!isObj(it.source) || !it.source.file || !Number.isInteger(it.source.line)) bad(errors, `${at}.source`, 'source file:line is required');
    if (!/^[a-f0-9]{64}$/.test(it.text_sha256 || '')) bad(errors, `${at}.text_sha256`, 'text_sha256 must be 64 hex characters');
    if (!STATUSES.includes(it.status)) bad(errors, `${at}.status`, `status must be one of ${STATUSES.join(', ')}`);
    if (!Array.isArray(it.mappings)) bad(errors, `${at}.mappings`, 'mappings must be an array');
    else {
      if (it.status === 'exact' && !it.mappings.length) bad(errors, `${at}.mappings`, 'exact needs at least one mapping');
      if (it.status === 'no-demo' && it.mappings.length) bad(errors, `${at}.mappings`, 'no-demo cannot carry mappings');
      for (const m of it.mappings) if (!isObj(m) || !KINDS.includes(m.kind) || typeof m.id !== 'string' || !m.id) bad(errors, `${at}.mappings`, 'mapping needs a known kind and an id');
    }
    if (it.status && it.status !== 'exact' && !String(it.reason || '').trim()) bad(errors, `${at}.reason`, 'a non-exact status needs a reason');
  });
}

/* What the views may rely on whatever the file held: every item is an object with string/array fields. Items the floor rejected as
   non-objects are dropped here (their problem is already in `errors`); malformed fields become empty values the page shows as such. */
function normalizeItem(it, rows, errors) {
  const mappings = (Array.isArray(it.mappings) ? it.mappings : []).filter((m) => isObj(m) && typeof m.id === 'string' && m.id).map((m) => ({ kind: String(m.kind || ''), id: m.id }));
  const row = typeof it.crosswalk_row === 'string' && it.crosswalk_row ? rows.get(it.crosswalk_row) || null : null;
  const joinError = typeof it.crosswalk_row === 'string' && it.crosswalk_row ? (row ? '' : `crosswalk row ${it.crosswalk_row} not found`) : '';
  if (joinError) bad(errors, it.id, joinError);
  return { ...it, id: String(it.id), source: isObj(it.source) ? { file: String(it.source.file ?? ''), line: it.source.line ?? '' } : null, text_sha256: typeof it.text_sha256 === 'string' ? it.text_sha256 : '',
    status: String(it.status ?? ''), reason: typeof it.reason === 'string' ? it.reason : '', legacy: row ? { legacy_id: row.legacy_id, family: row.family, canonical_id: row.canonical_id, source: row.source } : null, joinError, mappings };
}

export function loadSourceLedger(specRoot) {
  const file = path.join(specRoot, LEDGER_PATH);
  if (!fs.existsSync(file)) return { declared: false, ledger: null, crosswalk: null, errors: [], validatedBy: 'none' };
  const errors = [];
  let ledger = null, crosswalk = null;
  try { ledger = parseJson(fs.readFileSync(localPath(specRoot, LEDGER_PATH), 'utf8')); } catch (e) { bad(errors, LEDGER_PATH, e.message); }
  const schemaFile = path.join(FORMAT_DIR, 'schema/source-ledger.schema.json');
  structuralFloor(ledger, errors);
  const validatedBy = fs.existsSync(schemaFile) ? 'structural floor (schema file present, run lint for the full schema)' : 'structural floor (schema file not in this checkout)';
  if (isObj(ledger) && typeof ledger.crosswalk === 'string') {
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(LEDGER_PATH), ledger.crosswalk));
    try { crosswalk = parseJson(fs.readFileSync(localPath(specRoot, rel), 'utf8')); } catch (e) { bad(errors, rel, `crosswalk unreadable: ${e.message}`); }
  }
  const rows = new Map((Array.isArray(crosswalk?.rows) ? crosswalk.rows : []).filter((r) => isObj(r) && typeof r.id === 'string').map((r) => [r.id, r]));
  const items = (isObj(ledger) && Array.isArray(ledger.items) ? ledger.items : []).filter((it) => isObj(it) && typeof it.id === 'string' && it.id).map((it) => normalizeItem(it, rows, errors));
  return { declared: true, ledger: isObj(ledger) ? { ...ledger, items } : null, crosswalk, errors, validatedBy };
}

/* Three separate measures, each recomputed from its own inventory. They are never added, averaged or shown as one number. */
export function ledgerMeasures(loaded) {
  const l = loaded.ledger;
  if (!l) return null;
  const by = Object.fromEntries(STATUSES.map((s) => [s, l.items.filter((i) => i.status === s).length]));
  return {
    source: { declared: l.summary?.source_preservation || null, recomputed: { total: l.items.length, preserved: l.items.filter((i) => /^[a-f0-9]{64}$/.test(i.text_sha256 || '')).length } },
    typed: { declared: l.summary?.typed_coverage || null, recomputed: { total: l.items.length, mapped: l.items.filter((i) => i.mappings.length > 0).length } },
    demo: { declared: l.summary?.demo_coverage || null, recomputed: null },
    byStatus: by,
  };
}

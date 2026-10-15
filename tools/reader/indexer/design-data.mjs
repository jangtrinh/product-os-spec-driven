import fs from 'node:fs';
import { parseJson } from '../../lib/json-strict.mjs';
import { localPath } from '../../lib/local-path.mjs';

/* Loads the structured records a spec declares in its manifest (design inventory, generated source sidecar, receipts, change sets,
   exported gate records). Nothing here fetches anything remote and nothing throws: a record that cannot be read becomes an entry in
   `errors`, so the views can say it is missing instead of hiding it. */
const readJson = (root, rel, errors, what) => {
  try { return parseJson(fs.readFileSync(localPath(root, rel), 'utf8')); } catch (e) { errors.push({ what, rel, message: e.message }); return null; }
};

const listJson = (root, relDir) => {
  try { return fs.readdirSync(localPath(root, relDir)).filter((n) => n.endsWith('.json')).sort().map((n) => `${relDir}/${n}`); } catch { return []; }
};

const recordsOf = (root, base, errors) => {
  const dirs = { definitions: [], gates: [], transitions: [], exceptions: [], decisions: [], clarify: [], expected: [], integration: [], feedback: [], candidates: [], rounds: [] };
  const out = { packets: [], audit: [] };
  for (const kind of Object.keys(dirs)) {
    out[kind] = listJson(root, `${base}/${kind}`).map((rel) => ({ rel, data: readJson(root, rel, errors, `records/${kind}`) })).filter((x) => x.data);
  }
  try {
    for (const name of fs.readdirSync(localPath(root, `${base}/packets`)).sort()) {
      const rel = `${base}/packets/${name}/packet-data.json`;
      if (fs.existsSync(localPath(root, rel))) out.packets.push({ rel, id: name, data: readJson(root, rel, errors, 'records/packets') });
    }
  } catch { /* no packets exported */ }
  try {
    out.audit = fs.readFileSync(localPath(root, `${base}/audit.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* no audit log exported */ }
  return out;
};

/* A receipt that two lists name is ONE receipt (same file, or the same id with identical content). Two different records under one id are
   a recorded conflict: the first stays, the other is reported, and nothing is chosen silently. */
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));
function uniqueReceipts(list, errors) {
  const seen = new Map(), out = [];
  for (const rec of list) {
    const key = typeof rec.data.id === 'string' ? rec.data.id : rec.rel;
    const first = seen.get(key);
    if (!first) { seen.set(key, rec); out.push(rec); continue; }
    if (first.rel !== rec.rel && stable(first.data) !== stable(rec.data)) errors.push({ what: 'receipts', rel: rec.rel, message: `receipt id ${key} is defined in ${first.rel} and again, with different content, in ${rec.rel}; the first is shown` });
  }
  return out;
}

export function loadDesignData(spec) {
  const m = spec.manifest || {};
  const root = spec.root;
  const errors = [];
  const design = m.design || null;
  const gm = m.gate_model || null;
  const inventory = design?.inventory ? readJson(root, design.inventory, errors, 'design.inventory') : null;
  const sources = design?.sources ? readJson(root, design.sources, errors, 'design.sources') : null;
  const profile = design?.profile ? readJson(root, design.profile, errors, 'design.profile') : null;
  const graph = gm?.graph ? readJson(root, gm.graph, errors, 'gate_model.graph') : null;
  const changes = (gm?.changes || []).map((rel) => ({ rel, data: readJson(root, rel, errors, 'gate_model.changes') })).filter((x) => x.data);
  const receipts = uniqueReceipts([...(gm?.receipts || []), ...(design?.evidence || [])].map((rel) => ({ rel, data: readJson(root, rel, errors, 'receipts') })).filter((x) => x.data), errors);
  const rubricText = (rel) => { try { return fs.readFileSync(localPath(root, rel), 'utf8'); } catch { return null; } };
  const rubrics = profile?.rubrics ? { core: profile.rubrics.core ? { path: profile.rubrics.core, text: rubricText(profile.rubrics.core) } : null, adapter: (profile.rubrics.adapter || []).map((p) => ({ path: p, text: rubricText(p) })) } : null;
  const records = gm?.records ? recordsOf(root, gm.records.replace(/\/$/, ''), errors) : null;
  return {
    declared: { design: !!design, gateModel: !!gm, records: !!records },
    inventory: inventory?.screens || [], inventoryDeclared: !!design?.inventory, sources, profile, rubrics, graph, changes, receipts, records, errors,
  };
}

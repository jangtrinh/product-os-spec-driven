'use strict';
// Bounded executable format oracle; runtime consumers must implement the same contract.
const {createHash} = require('node:crypto');
const reservationErrors = require('./source-provenance-reservation-oracle.cjs');
const normalize = text => text.normalize('NFC').replace(/\r\n?/g, '\n')
  .split('\n').map(line => line.replace(/[\t ]+$/u, '')).join('\n').replace(/\n+$/u, '');
const digest = text => createHash('sha256').update(normalize(text), 'utf8').digest('hex');
const families = [
  ['scn-pub', /^SCN-PUB-([0-9]{2})-([0-9]{2})$/, 'scenario', 'scenario-next'],
  ['scr-pub', /^SCR-PUB-([0-9]{2})$/, 'screen-state', 'screen-next'],
  ['email', /^EMAIL-([0-9]{2})$/, 'ac', 'ac-next'],
  ['ctrl', /^CTRL-([0-9]{2})$/, 'ac', 'ac-next'],
  ['pd-feedback', /^PD-([0-9]+)$/, 'artifact', 'feedback-next']
];
// Identity tokens delimit on letters/numbers; _, -, . and path separators are boundaries.
const legacy = /(?<![\p{L}\p{N}])(?:SCN-PUB-[0-9]{2}-[0-9]{2}|SCR-PUB-[0-9]{2}|EMAIL-[0-9]{2}|CTRL-[0-9]{2}|PD-[0-9]+)(?![\p{L}\p{N}])/iu;
const byteOrder = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function orderedRows(rows) {
  const parsed = rows.map(row => ({row, rank: families.findIndex(f => f[1].test(row.legacy_id))}));
  if (parsed.some(x => x.rank < 0)) throw Error('X-CROSSWALK unknown legacy family');
  const positions = new Set();
  for (const {row, rank} of parsed) {
    const numbers = row.legacy_id.match(families[rank][1]).slice(1).map(n => BigInt(n).toString());
    const key = JSON.stringify([rank, numbers, row.source.file, row.source.line]);
    if (positions.has(key)) throw Error('X-CROSSWALK ambiguous source ordering');
    positions.add(key);
  }
  return parsed.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const aa = a.row.legacy_id.match(families[a.rank][1]).slice(1).map(BigInt);
    const bb = b.row.legacy_id.match(families[b.rank][1]).slice(1).map(BigInt);
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1;
    return byteOrder(a.row.source.file, b.row.source.file) || a.row.source.line - b.row.source.line;
  }).map(x => x.row);
}
function allocate(rows, reserved = []) {
  const used = new Set(), results = new Map(), scenarios = [], labels = new Set();
  const owners = new Set();
  for (const token of reserved) {
    if (typeof token !== 'string') throw Error('X-CROSSWALK invalid occupied identity');
    if (/^(?:us:)?(?:US-(?:\d+|P\d+)|NF-\d+)$/.test(token)) owners.add(token.replace(/^us:/, ''));
  }
  for (const token of reserved) {
    const namespace = token.includes(':') ? token.slice(0, token.indexOf(':')) : null;
    const scenario = namespace === null ? /SCN[-\u2010-\u2015\u2212]/i.test(token) : /^scenario$/i.test(namespace);
    if (!scenario) {
      // Preserve other namespaces; only their own canonical allocation family may be unwrapped.
      used.add(token.replace(/^(?:ac:(?=(?:US-(?:\d+|P\d+)|NF-\d+)\.AC-\d+$)|screen-state:(?=S\d{2}(?:-[a-z])?$)|artifact:(?=FB-\d+$))/, ''));
      continue;
    }
    const match = token.match(/^(?:scenario:)?((?:US-(?:\d+|P\d+)|NF-\d+))\.(SCN-[A-Z0-9]+-(\d+))$/);
    if (!match || match[0] !== token) throw Error('X-CROSSWALK ambiguous occupied scenario');
    if (!owners.has(match[1])) throw Error('X-CROSSWALK unresolved scenario owner');
    used.add(match[1] + '.' + match[2]);
    scenarios.push({owner: match[1], label: match[2], suffix: BigInt(match[3])});
    labels.add(match[2]);
  }
  const next = (prefix, width, owner) => {
    const suffixes = owner ? scenarios.filter(x => x.owner === owner).map(x => x.suffix)
      : [...used].filter(id => id.startsWith(prefix)).flatMap(id => {
        const match = id.slice(prefix.length).match(/^[0-9]+/);
        return match ? [BigInt(match[0])] : [];
      });
    let n = suffixes.reduce((max, value) => value > max ? value : max, 0n) + 1n;
    let id = prefix + String(n).padStart(width, '0');
    // Scenario labels can already occur in another owner or through a resolved alias.
    while (used.has(id) || (owner && labels.has(id.slice(owner.length + 1)))) {
      n++; id = prefix + String(n).padStart(width, '0');
    }
    if (prefix === 'S' && n > 99n) throw Error('X-CROSSWALK screen namespace exhausted');
    used.add(id);
    if (owner) {
      const label = id.slice(owner.length + 1);
      labels.add(label); scenarios.push({owner, label, suffix: n});
    }
    return id;
  };
  for (const row of orderedRows(rows)) {
    const family = families.find(f => f[1].test(row.legacy_id));
    if (['scenario', 'ac'].includes(family[2]) && !/^(?:US-(?:\d+|P\d+)|NF-\d+)$/.test(row.owner || ''))
      throw Error('X-CROSSWALK missing source-backed owner');
    const prefix = family[2] === 'scenario' ? row.owner + '.SCN-' + row.owner.replace(/^(?:US|NF)-/, '') + '-'
      : family[2] === 'ac' ? row.owner + '.AC-' : family[2] === 'screen-state' ? 'S' : 'FB-';
    results.set(row.id, next(prefix, 2, family[2] === 'scenario' ? row.owner : undefined));
  }
  return results;
}
function crosswalkErrors(value, reserved = []) {
  const rows = value.rows, errors = reservationErrors(reserved), keys = new Set(), aliases = new Set(), targets = new Set();
  let expected;
  try { expected = allocate(rows, reserved); } catch (error) { errors.push(error.message); }
  for (const row of rows) {
    const family = families.find(f => f[1].test(row.legacy_id));
    if (!family || family[0] !== row.family || family[2] !== row.canonical_kind || family[3] !== row.assignment_rule)
      errors.push('X-CROSSWALK family/kind/rule');
    for (const [set, key, label] of [[keys, row.id, 'row'], [aliases, row.legacy_id, 'legacy'], [targets, row.canonical_id, 'canonical']]) {
      if (set.has(key)) errors.push('X-CROSSWALK duplicate ' + label); set.add(key);
    }
    if (expected && row.canonical_id !== expected.get(row.id)) errors.push('X-CROSSWALK assignment');
    if (family && !['scenario', 'ac'].includes(family[2]) && row.owner !== undefined)
      errors.push('X-CROSSWALK unexpected owner');
  }
  return errors;
}
function legacyOutsideCrosswalk(payload) {
  const errors = [];
  function walk(value, where) {
    if (typeof value === 'string' && legacy.test(value)) errors.push('X-LEGACY outside crosswalk ' + where);
    else if (Array.isArray(value)) value.forEach((v, i) => walk(v, where + '[' + i + ']'));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
      if (legacy.test(k)) errors.push('X-LEGACY outside crosswalk key ' + where);
      walk(v, where + '.' + k);
    }
  }
  walk(payload, '$'); return errors;
}
function ledgerErrors(ledger, crosswalk, context) {
  const errors = legacyOutsideCrosswalk(ledger), seen = new Set(), mapped = new Set();
  const sources = new Map(context.sourceItems.map(x => [x.id, x]));
  const rows = new Map(crosswalk.rows.map(x => [x.id, x]));
  const typed = new Set(context.typedItems.map(x => x.kind + ':' + x.id));
  const demo = new Set(context.demoItems), passed = new Set(context.passedDemoItems);
  if (sources.size !== context.sourceItems.length) errors.push('X-SOURCE duplicate source inventory');
  if (typed.size !== context.typedItems.length || demo.size !== context.demoItems.length)
    errors.push('X-SOURCE duplicate coverage inventory');
  let preserved = 0;
  for (const item of ledger.items) {
    if (seen.has(item.id)) errors.push('X-SOURCE duplicate item'); seen.add(item.id);
    const source = sources.get(item.id);
    if (!source || source.file !== item.source.file || source.line !== item.source.line || !normalize(source.text) || digest(source.text) !== item.text_sha256)
      errors.push('X-SOURCE digest/source mismatch');
    else preserved++;
    if (item.crosswalk_row) {
      const row = rows.get(item.crosswalk_row);
      if (!row || item.id !== row.id || row.source.file !== item.source.file || row.source.line !== item.source.line)
        errors.push('X-SOURCE crosswalk join');
    } else if (rows.has(item.id)) errors.push('X-SOURCE missing crosswalk join');
    if (item.status !== 'exact' && !item.reason?.trim()) errors.push('X-SOURCE non-exact reason');
    if ((item.status === 'no-demo') !== (item.mappings.length === 0)) errors.push('X-SOURCE mapping status');
    const mappings = new Set();
    for (const target of item.mappings) {
      const key = target.kind + ':' + target.id;
      if (!typed.has(key)) errors.push('X-SOURCE unresolved typed mapping');
      if (!target.id.startsWith(target.kind + ':') || !target.id.slice(target.kind.length + 1))
        errors.push('X-SOURCE kind/id mismatch');
      if (mappings.has(key)) errors.push('X-SOURCE duplicate mapping'); mappings.add(key); mapped.add(key);
    }
  }
  if (sources.size !== seen.size || [...sources.keys()].some(id => !seen.has(id))) errors.push('X-SOURCE omitted source item');
  if ([...passed].some(id => !demo.has(id))) errors.push('X-SOURCE unresolved demo pass');
  const s = ledger.summary;
  if (s.source_preservation.total !== sources.size || s.source_preservation.preserved !== preserved
    || s.typed_coverage.total !== typed.size || s.typed_coverage.mapped !== mapped.size
    || s.demo_coverage.total !== demo.size || s.demo_coverage.passed !== passed.size)
    errors.push('X-SOURCE separate counts');
  return errors;
}
module.exports = {normalize, digest, orderedRows, allocate, crosswalkErrors, ledgerErrors, legacyOutsideCrosswalk};

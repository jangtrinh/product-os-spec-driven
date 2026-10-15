import fs from 'node:fs';
import path from 'node:path';
import { canonical } from '../../lib/config/strict-json.mjs';
import { sha256, hashes, RunnerError } from '../../lib/config/path-selection.mjs';
import { readRecord, schema, validateSchema } from '../../lib/config/schema-validation.mjs';
import { jsonFile, checkMembership } from '../../run/registries.mjs';
import {loadEvidence, selectHeads} from '../../run/evidence-heads.mjs';
import {noImpactProof} from '../../run/gate-evidence.mjs';

/* Canonical packet data (packet-interchange §3) from the project's named registries and the exported spec. Pure and deterministic:
   no clock, no randomness, no network. Anything that cannot be resolved is RunnerError exit 3, never a guessed smaller batch. */
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const lex = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const NO_BEFORE = 'No earlier wording is recorded for this rule.';

const listRecords = (root, dir, schemaName) => {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((n) => n.endsWith('.json')).sort().map((n) => readRecord(root, `${dir}/${n}`, schemaName));
};

/* Rule wording: exact block history first, then the contract amendment row, else an explicit "not recorded". */
function rulesFor(change, model, blockEntries, blockFile) {
  const fromHistory = blockEntries.filter((e) => (e.refs || []).includes(change.source) || e.id === change.source)
    .map((e) => ({ source: `${e.page}.${change.source}`, before: e.before || NO_BEFORE, after: e.after || change.reason }));
  if (fromHistory.length) return { rules: fromHistory.sort((a, b) => lex(a.source, b.source)), from: blockFile };
  const am = model.amend?.items?.find((a) => a.id === change.source);
  if (am) return { rules: am.rows.map((r) => ({ source: `${model.amend.doc.pageId}.${change.source}`, before: NO_BEFORE, after: r.change })).slice(0, 12), from: model.amend.doc.rel };
  return { rules: [{ source: change.source, before: NO_BEFORE, after: change.reason }], from: null };
}

export function buildPacketData({ root, config, changeId, spec, specRoot, support }) {
  const g = config.gates;
  const change = readRecord(root, `${g.changes_dir}/${changeId}.json`, 'change-set.schema.json');
  if (!change.candidate) throw new RunnerError(`Change set ${changeId} has no candidate draft yet; a packet needs pinned candidate membership`, 3);
  if (change.scope.kind !== 'ac') throw new RunnerError('Packet scope must be an enumerated qualified-AC list', 3);
  const membership = jsonFile(root, `${g.candidates_dir}/${change.candidate.manifest}.json`);
  checkMembership(root, membership, change.candidate.manifest);
  const requested = membership.members.filter((m) => m.kind === 'ac' && change.scope.ids.includes(m.id));
  if (canonical(requested.map((m) => m.id).sort(lex)) !== canonical([...change.scope.ids].sort(lex)) || sha256(canonical(requested)) !== change.scope.revision) throw new RunnerError('Unresolved scope membership or revision', 3);
  const scopeIds = [...change.scope.ids].sort(lex);
  const graph = jsonFile(root, g.graph);
  const receipts = listRecords(root, g.receipts_dir, 'evidence-receipt.schema.json');
  const propEvidence = new Set(change.propagation.flatMap((p) => p.evidence || []));
  const evidence = receipts.filter((r) => (r.coverage?.ac || []).some((id) => scopeIds.includes(id)) || propEvidence.has(r.id)).sort(byId);
  const findings = [...new Map(evidence.flatMap((r) => r.review?.findings || []).map((f) => [f.id, f])).values()].sort(byId);
  const exceptions = listRecords(root, g.exceptions_dir, 'exception.schema.json').filter((e) => e.scope?.ids?.some((id) => scopeIds.includes(id)) || e.scope?.kind !== 'ac').sort(byId);
  const stories = spec.stories.filter((s) => scopeIds.some((id) => id.startsWith(`${s.id}.`)));
  const open = stories.flatMap((s) => s.open.map((o) => ({ id: `OPEN-${s.id}-L${o.line}`, text: o.text, blocking: o.blocking }))).sort(byId);
  /* Rulings are read from the ledger bytes the members pin (refused when unpinned, altered or missing), not from the exported index. */
  const decisionIds = [...new Set(stories.flatMap((s) => s.decisions))].filter((id) => (spec.model.decisions || []).some((d) => d.id === id));
  const decisions = support.decisions(membership, scopeIds, spec.model.ledger?.rel, decisionIds).map(({ id, text, source }) => ({ id, text, source })).sort(byId);
  const ruled = rulesFor(change, spec.model, spec.blockEntries, spec.model.manifest?.changes?.blocks);
  if (ruled.from) support.pinFile(membership, scopeIds, ruled.from, 'Before-and-after rule wording');
  /* Screens are read from the pinned inventory bytes, not from the indexer's copy of an unpinned export. */
  const contractRels = [...new Set(spec.model.docs.filter((x) => x.type === 'ui-contract').map((x) => x.rel))].sort(lex);
  const screens = support.screens(membership, scopeIds, spec.model.manifest?.design?.inventory, contractRels);
  const impactNodes = new Set(change.impact.map((i) => i.node));
  const complete = graph.complete === true && !change.impact.some((i) => i.classification === 'unknown');
  const allAc = spec.stories.flatMap((s) => s.acs.map((a) => a.qid));
  const unaffected = complete ? allAc.filter((id) => !scopeIds.includes(id) && !impactNodes.has(`ac:${id}`)).sort(lex) : [];
  const context = loadEvidence(root, config);
  const noImpact = noImpactProof(graph, change.candidate, {candidate: change.candidate, impact: change.impact}, context);
  const aggregate = [...new Set(requested.flatMap(member => ['spec', 'local-ci'].flatMap(domain => {
    const selected = selectHeads(context, {member, members: membership.members, pins: change.candidate, domain, reviewRequired: true, noImpact});
    return selected.eligible ? selected.heads.map(r => r.id) : [];
  })))].sort(lex);
  const specRel = specRoot;
  const assetRels = [...new Set(screens.flatMap((r) => [...(spec.codedByScreen[r.screen] || []), ...(r.boards || []).map((b) => spec.boardPng[b]).filter(Boolean)]))];
  const assets = {};
  for (const rel of assetRels) assets[`${specRel ? `${specRel}/` : ''}${rel}`] = null;
  Object.assign(assets, hashes(root, Object.keys(assets)));
  const data = {
    version: '1', product: 'PRODUCT:OS Spec Driven', scope: change.scope, baseline: change.baseline, candidate: change.candidate, membership,
    change: { id: change.id, source: change.source, reason: change.reason, rules: ruled.rules, impact: [...change.impact].sort((a, b) => lex(`${a.domain}/${a.node}`, `${b.domain}/${b.node}`)),
      closure: { complete, fallback: complete ? null : 'intake' }, propagation: change.propagation },
    screens, evidence, findings, open, exceptions, unaffected, aggregate_checks: aggregate,
    requests: scopeIds.map((id) => ({ id, reason: change.propagation.find((p) => p.ac.includes(id))?.behavior || change.reason })),
    assets, decisions, assumptions: [],
  };
  validateSchema(data, schema('packet-data.schema.json'), 'packet data');
  const json = canonical(data);
  const dataSha = sha256(json);
  return { data, json, dataSha, packetId: `packet-${dataSha}`, changeState: change.state, assetRels };
}

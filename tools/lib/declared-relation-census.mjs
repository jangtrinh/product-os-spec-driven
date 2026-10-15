import {loadReferenceRegistry} from './census-registry.mjs';
import {pathLocations, schemaLocations, bodyLocations} from './census-locations.mjs';
import {sourceCorpus} from './census-source-corpus.mjs';
import {endpointContext} from './census-endpoint-context.mjs';
import {absentReference, externalReference, referenceValues, runtimeSelectionEntry, qualifyEndpoint} from './census-reference-resolution.mjs';
import ownershipContract from '../../format/reference-registry-document-ownership.cjs';

const owned = new Set([...ownershipContract.identities.direct, ...ownershipContract.identities.logicalParents]);
const compare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
export function declaredRelationCensus(model, {registry: override, schemas} = {}) {
  const registry = loadReferenceRegistry(override);
  const corpus = sourceCorpus(model);
  const nodes = new Map(), nodeSources = new Map(), edges = new Map(), unresolved = [], certificationBindings = [];
  const declare = (id, source) => {
    if (!id || !source) return;
    if (!nodeSources.has(id)) nodeSources.set(id, new Set());
    nodeSources.get(id).add(source);
    nodes.set(id, nodes.get(id) ?? source);
  };
  function append(from, to, entry, source, ownership = false) {
    if (!from || !to) {
      unresolved.push({entry: entry.id, source, causal: entry.causal || ownership, from, to});
      return;
    }
    if (from === to) return;
    const edge = {from, to, relation: ownership ? 'derives' : entry.relation, causal: ownership ? true : entry.causal};
    const key = JSON.stringify(edge), provenance = {entry: entry.id, source};
    if (!edges.has(key)) edges.set(key, {...edge, provenance: []});
    if (!edges.get(key).provenance.some(p => p.entry === provenance.entry && p.source === provenance.source)) edges.get(key).provenance.push(provenance);
  }
  function emit(base, hit, context) {
    if (base.effect === 'context') return;
    for (const value of referenceValues(hit.value, base, context)) {
      // Selected leaves of a runtime selector are already decided by selectFiles, so a literal '—' file survives here.
      if (externalReference(value) || absentReference(value) && !runtimeSelectionEntry(base)) continue;
      const branch = (base.cases ?? []).find(c => (hit.ancestors ?? [hit.owner]).some(owner => c.when.path.split('.').reduce((v, k) => v?.[k], owner) === c.when.value));
      const entry = branch ? {...base, ...branch} : base;
      // A frozen prose source citation is not a local prerequisite; typed-looking misses remain unresolved.
      if (entry.location.kind === 'body-table' && /\{(?:resolved-|source-kind|affected-kind)/.test(entry.target.id)
        && typeof value === 'string' && !/[/.#:]|\b(?:REQ-|US-|NF-|AC-|SCN-|A-\d|D\d)/.test(value) && !corpus.docs.some(d => d.id === value)) continue;
      for (const tokens of endpointContext(entry, {...hit, value}, context)) {
        const source = qualifyEndpoint(entry.source.id, tokens);
        const target = qualifyEndpoint(entry.target.id, tokens);
        const file = hit.declaringFile === null ? null : hit.declaringFile ?? context.file ?? context.doc?.rel;
        if (owned.has(entry.id)) {declare(`artifact:${file}`, file); declare(target, hit.anchor && target?.startsWith('amendment:') ? `${file}#${hit.anchor}` : file);}
        const endpoints = {source, target};
        append(endpoints[entry.edge.from], endpoints[entry.edge.to], entry, context.file ?? context.doc?.rel);
        if (entry.certification_boundary) certificationBindings.push({
          from: endpoints[entry.edge.from], to: endpoints[entry.edge.to], source: context.file,
          file, data: hit.declaringData ?? context.data, pathBase: hit.declaringBase ?? context.pathBase ?? corpus.specBase,
        });
        if (entry.ownership) append(qualifyEndpoint(entry.ownership.id, tokens), target, entry, context.file ?? context.doc?.rel, true);
      }
    }
  }
  const traceFields = new Set(registry.entries.filter(e => e.location.kind === 'front-matter' && e.location.path.startsWith('trace.')).map(e => e.location.path.split('.')[1].split('[')[0]));
  const pending = [];
  const collect = (entry, hit, context) => pending.push({entry, hit, context});
  for (const doc of corpus.docs) {
    const context = {...corpus, identities: nodes, doc, file: doc.rel};
    for (const field of Object.keys(doc.fm?.trace ?? {})) if (!traceFields.has(field)) unresolved.push({entry: `trace.${field}`, source: doc.rel, causal: true});
    for (const entry of registry.entries) {
      const kind = entry.location.kind;
      if (kind === 'front-matter') for (const hit of pathLocations(doc.fm ?? {}, entry.location.path)) collect(entry, hit, context);
      else if (kind.startsWith('body') && (entry.doc_type === '*' || entry.doc_type.split('|').includes(doc.type))) for (const hit of bodyLocations(entry, doc)) collect(entry, hit, context);
    }
  }
  for (const payload of corpus.payloads) {
    const context = {...corpus, identities: nodes, file: payload.file, data: payload.data, payloadType: payload.type,pathBase:payload.pathBase};
    if (['pipeline', 'epic-map', 'gate-data'].includes(payload.type)) {
      for (const entry of registry.entries.filter(e => e.doc_type === payload.type && e.location.kind === 'json')) for (const hit of pathLocations(payload.data, entry.location.path)) collect(entry, hit, context);
    } else for (const {entry, ...hit} of schemaLocations(payload.type, payload.data, registry, {schemas, corpus, file: payload.file})) collect(entry, hit, context);
  }
  for (const item of pending.filter(p => owned.has(p.entry.id))) emit(item.entry, item.hit, item.context);
  for (const item of pending.filter(p => !owned.has(p.entry.id))) emit(item.entry, item.hit, item.context);
  const sorted = [...edges.values()].sort((a, b) => compare(JSON.stringify([a.from, a.to, a.relation, a.causal]), JSON.stringify([b.from, b.to, b.relation, b.causal])));
  for (const edge of sorted) edge.provenance.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  return {nodes, nodeSources, edges: sorted, unresolved, complete: !unresolved.some(r => r.causal), corpus, certificationBindings, pipelineScope: corpus.pipelineScope};
}

export const censusEdges = (model, options) => declaredRelationCensus(model, options).edges.map(({provenance, ...edge}) => edge);

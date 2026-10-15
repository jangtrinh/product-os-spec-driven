import path from 'node:path';
import {canonical} from './config/strict-json.mjs';
import {sha256} from './config/path-selection.mjs';
import {schema, validateSchema} from './config/schema-validation.mjs';
import {normalizedPath} from './census-reference-resolution.mjs';
import boundary from '../../format/reference-registry-certification-boundary.cjs';

function configuredGraphs(corpus) {
  const paths = new Set();
  const add = (file, base = '') => {if (file) paths.add(normalizedPath(file, corpus, base));};
  add(corpus.project?.config.gates?.graph);
  if (corpus.project) return paths;
  for (const payload of corpus.payloads) {
    if (payload.type === 'manifest') add(payload.data.gate_model?.graph, payload.pathBase);
    if (payload.type === 'pipeline') add(payload.data.gates?.graph, payload.pathBase);
  }
  return paths.size <= 1 ? paths : new Set();
}
function validBinding(binding, corpus, graphs) {
  try {
    if (!binding.file || binding.to !== `artifact:${binding.file}`) return false;
    const manifest = validateSchema(binding.data, schema('candidate-manifest.schema.json'));
    if (manifest.members.length !== 1) return false;
    const member = manifest.members[0], files = Object.keys(member.artifacts);
    if (member.kind !== 'artifact' || files.length !== 1 || files[0] !== member.id) return false;
    const graph = normalizedPath(member.id, corpus, binding.pathBase);
    if (!graphs.has(graph) || binding.from !== `artifact:${graph}`) return false;
    return member.revision === sha256(canonical(member.artifacts))
      && path.posix.basename(binding.file) === `${sha256(canonical(manifest))}.json`;
  } catch {return false;}
}

// The full extraction is never edited. Terminality is measured before projection.
export function graphConformanceView(census) {
  const omitted = new Set(), graphs = configuredGraphs(census.corpus);
  const groups = new Map();
  for (const binding of census.certificationBindings ?? []) {
    if (!groups.has(binding.to)) groups.set(binding.to, []);
    groups.get(binding.to).push(binding);
  }
  for (const [id, bindings] of groups) {
    if (!census.complete || !bindings.every(binding => validBinding(binding, census.corpus, graphs))) continue;
    if (census.nodeSources.has(id) || census.edges.some(edge => edge.causal && edge.from === id)) continue;
    const incoming = census.edges.filter(edge => edge.causal && edge.to === id);
    if (!incoming.length || incoming.some(edge => edge.relation !== 'uses' || !edge.provenance.length
      || !edge.provenance.every(p => p.entry === boundary.entryId && bindings.some(b => b.source === p.source && b.from === edge.from)))) continue;
    omitted.add(id);
  }
  return {...census, omitted,
    nodes: new Map([...census.nodes].filter(([id]) => !omitted.has(id))),
    nodeSources: new Map([...census.nodeSources].filter(([id]) => !omitted.has(id))),
    edges: census.edges.filter(edge => !(edge.causal && omitted.has(edge.to))),
  };
}

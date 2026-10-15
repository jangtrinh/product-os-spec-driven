'use strict';
module.exports = ({fresh, registryPath, schemaPath}) => {
  const field = (name, node) => () => {
    const s = fresh(schemaPath); s.properties[name] = node; return [schemaPath, s];
  };
  const entry = (id, mutate) => () => {
    const r = fresh(registryPath); mutate(r.entries.find(e => e.id === id)); return [registryPath, r];
  };
  return [
    ['missing-config-binding', () => {
      const r = fresh(registryPath); r.entries = r.entries.filter(e => e.id !== 'pipeline-gates-definitions-dir');
      return [registryPath, r];
    }, 'missing body registry entry pipeline-gates-definitions-dir'],
    ['unclassified-map-values', field('dependency_map', {type: 'object', additionalProperties: {
      type: 'string', description: 'Relative path to the required source document.'}}), 'unannotated reference'],
    ['unclassified-pattern-values', field('dependency_map', {type: 'object', patternProperties: {
      '^dependency_': {type: 'string', pattern: '^REQ-\\d+$'}}}), 'unsupported schema construct patternProperties at front-matter.schema.json#/properties/dependency_map/patternProperties'],
    ['path-description-literal-object', field('dependency_path', {type: 'string',
      description: 'Relative path to the required source document.',
      'x-spec-ref': {literal: 'This is only a metadata string.'}}), 'invalid literal annotation'],
    ['sibling-annotation-reuse', field('required_source', {type: 'string',
      description: 'Relative path to the required source document.', 'x-spec-ref': 'front-matter-data'}), 'annotation binding mismatch'],
    ['reverse-trace-decisions', entry('front-matter-trace-decisions', e => {e.edge = {from: 'source', to: 'target'};}), 'source-contract direction'],
    ['reverse-trace-amendments', entry('front-matter-trace-amendments', e => {e.edge = {from: 'source', to: 'target'};}), 'source-contract direction'],
    ['disable-trace-ac', entry('front-matter-trace-ac', e => {e.causal = false;}), 'source-contract causal'],
    ['unknown-payload-owner', entry('screen-inventory-screens-flow', e => {e.doc_type = 'nonexistent-payload';}), 'doc-type ownership'],
    // New defects, one for each invariant; no name/pattern/description hint for A.
    ['unclassified-plain-branch', field('caption', {anyOf: [{type: 'string'}, {type: 'null'}]}), 'unannotated reference'],
    ['definition-annotation-reuse', () => {
      const s = fresh(schemaPath); s.$defs.reused = {type: 'string', 'x-spec-ref': 'front-matter-data'};
      return [schemaPath, s];
    }, 'annotation binding mismatch'],
    ['reverse-flow-dependency', entry('screen-inventory-screens-flow', e => {e.edge = {from: 'source', to: 'target'};}), 'source-contract direction'],
    ['wrong-existing-payload-owner', entry('screen-inventory-screens-flow', e => {e.doc_type = 'design-profile';}), 'doc-type ownership']
  ];
};

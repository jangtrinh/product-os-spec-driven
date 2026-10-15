'use strict';
// Offline format meta-check; does not implement the lint/runner census.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const schemaDir = path.join(root, 'schema');
const parseUnique = require('../reference-registry-json.cjs');
const read = file => parseUnique(fs.readFileSync(file, 'utf8'));
const registry = read(path.join(root, 'reference-registry.json'));
const schemas = new Map(fs.readdirSync(schemaDir).filter(f => f.endsWith('.schema.json'))
  .map(file => [file, read(path.join(schemaDir, file))]));
const AjvModule = require(process.env.SPEC_AJV_MODULE || 'ajv/dist/2020');
const ajv = new (AjvModule.default || AjvModule)({strict: true, allErrors: true});
ajv.addKeyword({keyword: 'x-spec-ref', schemaType: ['string', 'boolean'], valid: true});
ajv.addKeyword({keyword: 'x-spec-ref-reason', schemaType: 'string', valid: true});
ajv.addKeyword({keyword: 'x-spec-exclusion', schemaType: 'object', valid: true});
const errors = [];
const demand = (ok, message) => { if (!ok) errors.push(message); };
// Every helper on this census uses the validator's own resource identity resolver.
schemas.uriResolver = ajv.opts.uriResolver;
require('../reference-registry-schema-identity.cjs').audit(schemas,demand);
if (errors.length) {
  for (const message of errors) console.error('RED '+message);
  process.exit(1);
}
const {pointer, location} = require('../reference-registry-schema-path.cjs')(schemas);
const classification = require('../reference-registry-classification.cjs')(schemas,pointer);
const exclusions = require('../reference-registry-exclusions.cjs')(schemas,pointer,classification.resolve);
require('../reference-registry-schema-constructs.cjs').audit(schemas,pointer,exclusions,demand);
if (errors.length) {
  for (const message of errors) console.error('RED '+message);
  process.exit(1);
}
const validator = ajv.compile(schemas.get('reference-registry.schema.json'));
if (!validator(registry)) {
  console.error('RED registry shape: ' + JSON.stringify(validator.errors));
  process.exit(1);
}
for(const [file,schema]of schemas)demand(ajv.validateSchema(schema),'invalid schema shape '+file);
const entries = new Map();
for (const entry of registry.entries || []) {
  demand(!entries.has(entry.id), 'duplicate entry ' + entry.id);
  entries.set(entry.id, entry);
}
require('../reference-registry-certification-boundary.cjs').audit(entries, demand);
const formatText = fs.readFileSync(path.join(root, 'SPEC-FORMAT-v2.md'), 'utf8');
const hints = require('../reference-registry-reference-hints.cjs')(schemas, pointer, formatText);
const {annotated, literals} = classification.audit(entries, demand, hints);
const locations = new Set(), schemaLocations = new Set();
const headings = new Map();
function grammar(entry) {
  const {file, section} = entry.grammar || {};
  if (!headings.has(file)) {
    const target = path.join(root, file || '');
    demand(fs.existsSync(target) && fs.statSync(target).isFile(), 'missing grammar file ' + file);
    const text = fs.existsSync(target) && fs.statSync(target).isFile() ? fs.readFileSync(target, 'utf8') : '';
    headings.set(file, text.split('\n').filter(line => /^#{1,6} /.test(line)).map(line => line.replace(/^#{1,6} /, '')));
  }
  demand(headings.get(file).includes(section), 'missing grammar section ' + file + '#' + section);
}
const bodyGrammar = fs.readFileSync(path.join(root, 'reference-registry-grammar.md'), 'utf8');
for (const match of bodyGrammar.matchAll(/^\| ([a-z][a-z0-9-]*) \|/gm)) {
  demand(entries.has(match[1]) && !entries.get(match[1]).schema, 'missing body registry entry ' + match[1]);
}
const graphKinds = schemas.get('dependency-graph.schema.json').properties.nodes.items.properties.kind.enum;
for (const entry of entries.values()) {
  grammar(entry);
  const key = JSON.stringify([entry.doc_type, entry.location]);
  demand(!locations.has(key), 'duplicate location ' + entry.id);
  locations.add(key);
  if (entry.schema) {
    const schema = schemas.get(entry.schema.file), node = pointer(schema, entry.schema.pointer);
    demand(node && node['x-spec-ref'] === entry.id, 'dead schema property ' + entry.id);
    const binding = entry.schema.file + '#' + entry.schema.pointer;
    demand(!schemaLocations.has(binding), 'duplicate schema binding ' + entry.id);
    schemaLocations.add(binding);
    demand(location(schema, entry.location.path).includes(node), 'schema location mismatch ' + entry.id);
    demand(/\/(?:properties|\$defs)\//.test(entry.schema.pointer) || /\/propertyNames$/.test(entry.schema.pointer), 'not a schema property ' + entry.id);
  } else {
    // Exact rows are the documented extraction grammars, not an arbitrary heading.
    const row = '| ' + entry.id + ' | ' + entry.doc_type.replaceAll('|', '\\|') + ' | ' + JSON.stringify(entry.location).replaceAll('|', '\\|') + ' |';
    demand(bodyGrammar.includes(row),
      'undocumented body grammar ' + entry.id);
  }
  if (entry.location?.pattern) {
    try { new RegExp(entry.location.pattern, 'u'); } catch { demand(false, 'invalid body pattern ' + entry.id); }
  }
  demand(!entry.causal || entry.effect === 'edge', 'causal non-edge ' + entry.id);
  demand(!['mentions', 'supersedes'].includes(entry.relation) || !entry.causal, 'causal history ' + entry.id);
  const discriminators = new Set(), discriminatorPaths = new Set();
  for (const rule of entry.cases || []) {
    const discriminator = JSON.stringify([rule.when.path, rule.when.value]);
    demand(!discriminators.has(discriminator), 'conflicting discriminator ' + entry.id);
    discriminators.add(discriminator); discriminatorPaths.add(rule.when.path);
    demand(!rule.causal || entry.effect === 'edge', 'causal non-edge case ' + entry.id);
  }
  demand(discriminatorPaths.size <= 1, 'conflicting discriminator paths ' + entry.id);
  for (const rule of [entry, ...(entry.cases || [])]) {
    for (const kind of rule.target?.kinds || []) demand(graphKinds.includes(kind), 'unknown target kind ' + entry.id);
    demand(!['mentions', 'supersedes'].includes(rule.relation) || !rule.causal, 'causal case history ' + entry.id);
    if (rule.causal && rule.relation === 'renders' && rule.target.kinds.includes('board')) {
      demand(rule.edge.from === 'source' && rule.edge.to === 'target', 'reversed board direction ' + entry.id);
    }
  }
}
const census=require('../reference-registry-source-discovery.cjs').audit(root, entries, demand);
require('../reference-registry-endpoint-contract.cjs').audit(entries, demand);
require('../reference-registry-ownership-contract.cjs').audit(entries, demand);
require('../reference-registry-direction-contract.cjs').audit(entries, demand);
if (errors.length) {
  for (const message of errors) console.error('RED ' + message);
  process.exitCode = 1;
} else {
  console.log(`PASS reference registry: ${entries.size} entries; ${annotated.size} annotated schema locations; ${literals.size} explicit literals`);
  const counts = new Map();
  for (const entry of entries.values()) counts.set(entry.doc_type, (counts.get(entry.doc_type) || 0) + 1);
  for (const [type, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) console.log(type + ': ' + count);
  console.log('PASS source discovery: '+census.sites.size+' classified locations; '+census.declarations.length+' typed grammar declarations');
  console.log('PASS schema bindings, body grammars, directions and non-causal history');
}

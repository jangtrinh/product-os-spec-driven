import {selectFiles} from '../lib/config/path-selection.mjs';
import {loadConfig} from '../lib/config/config-loader.mjs';

// A stage's own gate record and its scoped gate records describe the stage's result.
// They must never be part of the selection that the same gate is bound to.
export function ownGateExclusions(gatesDir, stage, definitions) {
  return [`${gatesDir}/${stage}.md`, ...definitions.map(def => `${gatesDir}/scoped/${def.id}`)];
}
// loadRegistries binds the configured gates dir to each definition it returns, so callers that hold
// only definitions (the stage runner) still use the project's own --config.
const gatesDirs = new WeakMap();
export function bindGatesDir(definition, gatesDir) { gatesDirs.set(definition, gatesDir); }
export function registryOwnGateExclusions(root, stage, definitions) {
  let gatesDir = gatesDirs.get(definitions[0]);
  if (!gatesDir) { try { gatesDir = loadConfig(root).gates.dir; } catch { return []; } }
  return ownGateExclusions(gatesDir, stage, definitions);
}
export function selectDefinitionInputs(root, definition, {exclude = [], skipped = [], optional = false} = {}) {
  return definition.inputs.flatMap(pattern => selectFiles(root, pattern, {optional: optional || skipped.includes(pattern), exclude}));
}

import {canonical} from '../lib/config/strict-json.mjs';
import {hashes} from '../lib/config/path-selection.mjs';
import {concreteOutputs} from '../lib/output-patterns.mjs';
import {stageContext} from './stage-context.mjs';

// Bind both the original bytes shown by the reviewer and the live context at
// that invocation. Context includes composed prompts, _common and the rubric.
export function reviewBinding(root, config, registry, stage, state, outputs) {
  return {
    context: stageContext(root, config, registry, stage).inputs,
    sources: hashes(root, Object.values(state.source_snapshot ?? {})),
    source_paths: state.source_snapshot ?? {},
    outputs: hashes(root, concreteOutputs(root, outputs)),
  };
}
export function reviewBindingMatches(root, config, registry, stage, state, outputs) {
  return Boolean(state.review_binding) && canonical(state.review_binding) === canonical(reviewBinding(root, config, registry, stage, state, outputs));
}

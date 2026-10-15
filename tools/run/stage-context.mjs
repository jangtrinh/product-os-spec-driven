import fs from 'node:fs';
import {selectFiles, hashes, localPath, RunnerError} from '../lib/config/path-selection.mjs';
import {definitionsFor} from './registries.mjs';
import {composedPromptFiles} from './composed-prompt-files.mjs';
import {ownGateExclusions} from './own-gate-exclusions.mjs';

const produced = {intake: ['intake/'], clarify: ['decisions/decisions.md', 'glossary.md'], contract: ['contract/'], prd: ['prd/'], us: ['us/', 'readable/'], wireframe: ['wireframe/'], prototype: ['prototype/'], design: ['ux/design.md', 'ux/ui-contract.md', 'ux/', 'reviews/'], tdd: ['tests/'], uiux: ['ui/', 'reviews/'], handoff: ['delivery/']};
export function stageContext(root, config, registry, stage) {
  const ownGate = `${config.gates.dir}/${stage}.md`;
  const definitions = definitionsFor(config, registry, stage);
  const skipped = []; let context = []; const declared = [];
  const optionalPatterns = config.stages[stage].optional_context ?? [];
  const patterns = [...config.stages[stage].context, ...optionalPatterns, ...composedPromptFiles(stage), ...(config.review.enabled ? [config.review.rubric, ...composedPromptFiles('reviewer')] : []), ...definitions.flatMap(def => def.inputs), config.gates.graph, ...definitions.map(def => `${config.gates.definitions_dir}/${def.id}/${def.version}.json`), ...(config.design_adapter ? [config.design_adapter] : []), ...(stage === 'handoff' && config.gates.baseline ? [config.gates.baseline] : [])];
  for (const pattern of [...new Set(patterns)]) {
    const producers = Object.entries(config.stages).filter(([name]) => (produced[name] ?? []).some(output => pattern === `${config.project.spec_root}/${output}` || (output.endsWith('/') && pattern.startsWith(`${config.project.spec_root}/${output}`)) || (output === 'ui/' && pattern.startsWith('ui/'))));
    const optional = optionalPatterns.includes(pattern) || producers.length > 0 && producers.every(([,row])=>!row.enabled);
    const selected = selectFiles(root, pattern, {optional, preparedText: optionalPatterns.includes(pattern), exclude: ownGateExclusions(config.gates.dir, stage, definitions)});
    if (!selected.length) skipped.push(pattern);
    context.push(...selected);
    if (config.stages[stage].context.includes(pattern) || optionalPatterns.includes(pattern)) declared.push(...selected);
  }
  context = [...new Set(context)].sort().filter(file => file !== ownGate);
  return {context, declared: [...new Set(declared)].sort(), inputs: hashes(root, context), skipped};
}
export const readText = (root, relative) => fs.readFileSync(localPath(root, relative), 'utf8');
export function writerPrompt(root, stage, context, outputs, request = '') {
  const [commonFile, promptFile] = composedPromptFiles(stage);
  const writerContext = context.filter(file => file !== promptFile && file !== 'prompts/reviewer.md' && file !== 'prompts/_common.md');
  return `${readText(root, commonFile)}\n${readText(root, promptFile)}\nSTAGE: ${stage}\nDECLARED OUTPUTS: ${JSON.stringify(outputs)}\nReturn plain text for one literal file; otherwise return one non-empty fenced files JSON map. Include every literal output; allocated regex patterns accept matching concrete paths within their declared directory.\n${writerContext.map(file => `\n--- FILE: ${file} ---\n${readText(root, file)}`).join('\n')}\n${request ? `CHANGE REQUEST / REPAIR:\n${request}` : ''}`;
}

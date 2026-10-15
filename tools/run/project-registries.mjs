import {definitionRevision} from '../lib/definition-scope.mjs';
import fs from 'node:fs';
import {canonical} from '../lib/config/strict-json.mjs';
import {localPath, sha256, writeLocal, RunnerError} from '../lib/config/path-selection.mjs';
import {outputPatternFromToken} from '../lib/output-patterns.mjs';
import {schema, validateSchema} from '../lib/config/schema-validation.mjs';
import {STAGES} from '../lib/config/config-loader.mjs';

export function gateDefinition(config, stage, {inputs, outputs, checks, invalidation = 'Typed closure; BR-14 on incomplete census'}) {
 const binding = config.gates.stage_definitions[stage];
 const definition={id:binding.id, version:binding.version, stage,
  scope:{kind:'stage',ids:[stage],revision:'unbound'}, inputs, outputs,
  checks:checks ?? config.evals[stage].map((entry,i)=>({id:`configured-check-${i}`,command:entry.run,mandatory:true,blocker_policy:'Every configured deterministic command must pass'})),
  reviewer:'qc',decider:config.stages[stage].owner,transitions:['advance','repair','backward','exception','change-set','recovery'],invalidation,exceptions:[],versions:config.versions};
 definition.scope.revision=definitionRevision(definition);return definition;
}
export function declaredOutputs(root, stage) {
 const text=fs.readFileSync(localPath(root,`prompts/${stage}.md`),'utf8');
 const section=text.split('## Output files')[1]?.split('\n## ')[0] ?? '';
 // Literals stay exact. A known placeholder becomes one strict pattern; the
 // concrete file is still a membership change when it appears or disappears.
 const literals=[...section.matchAll(/^- `((?:spec|review)\/[A-Za-z0-9_./-]+\.(?:md|json|html))(?=[` ;])/gm)].map(match=>match[1]);
 const patterns=[...section.matchAll(/^- `((?:spec|review)\/[^`\s;]*<[^>\s]+>[^`\s;]*)/gm)].map(match=>{
  const pattern=outputPatternFromToken(match[1]);
  if(pattern) validateSchema(pattern,schema('model-common.schema.json').$defs.path,`prompts/${stage}.md output token ${match[1]}`);
  return pattern;
 }).filter(Boolean);
 const paths=[...new Set([...literals,...patterns])].sort();
 if(!paths.length) throw new RunnerError(`prompts/${stage}.md has no concrete output file declarations`);
 return paths;
}
export function materializeRegistries(root, config) {
 const put=(file,value)=>{ if(!fs.existsSync(localPath(root,file))) writeLocal(root,file,canonical(value)+'\n',{immutable:true}); };
 for(const stage of STAGES) {
  // Reviewer snapshots need the shared wrapper's runtime imports as well.
  const inputs=[...new Set([...config.stages[stage].context,'tools/agents/','tools/run/agent-timeouts.mjs','tools/run/process-tree.mjs'])];
  const definition=gateDefinition(config,stage,{inputs,outputs:declaredOutputs(root,stage)});
  put(`${config.gates.definitions_dir}/${definition.id}/${definition.version}.json`,definition);
 }
 const source='input/po-spec.md', digest=sha256(fs.readFileSync(localPath(root,source)));
 put(config.gates.graph,{version:'1',complete:false,nodes:[{id:`artifact:${source}`,kind:'artifact',source,revision:digest}],edges:[]});
 if(config.stages.handoff.enabled && config.gates.baseline) put(config.gates.baseline,{id:'baseline-unpublished',head:'not-published',manifest:digest});
}

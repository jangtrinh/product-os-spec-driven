// Design and UIUX stages must name the skill that carries their design judgment.
// A project design adapter adds its own skill on top of es-designer.
import {SKILL_REQUIRED_STAGES as STAGE_SKILLS} from '../lib/config/config-loader.mjs';
import {isLegacySkillId,replacementForLegacySkillId} from '../lib/config/skill-ids.mjs';
const ALWAYS_REQUIRED = ['es-designer'];
const ADAPTER_REQUIRED = ['design'];
export function pipelineSkillRules(model, P) {
  const config = model.options?.pipelineConfig;
  if (!config) return;
  const file = model.options.pipeline || 'config/pipeline.yaml';
  const adapterEnabled = typeof config.design_adapter === 'string' && config.design_adapter.trim().length > 0;
  const required = adapterEnabled ? [...ALWAYS_REQUIRED, ...ADAPTER_REQUIRED] : ALWAYS_REQUIRED;
  for (const [stage, row] of Object.entries(config.stages ?? {})) for (const id of row?.skill?.skills ?? []) if (isLegacySkillId(id)) {
    const replacement = replacementForLegacySkillId(id);
    P.add('E-PIPELINE-SKILL', file, 1, `stages.${stage}.skill.skills contains legacy ${id}; replace it with ${replacement}`, `replace ${id} with ${replacement}`);
  }
  for (const stage of STAGE_SKILLS) {
    // A pipeline that never declares the stage, or keeps it disabled, has no design work to govern.
    if (!config.stages?.[stage]?.enabled) continue;
    const skills = config.stages[stage].skill?.skills;
    const named = Array.isArray(skills) ? skills : [];
    for (const id of (['design','uiux'].includes(stage) ? required : ALWAYS_REQUIRED)) {
      if (!named.includes(id)) P.add('E-PIPELINE-SKILL', file, 1, `stages.${stage}.skill.skills lacks ${id}`, `add ${id} to stages.${stage}.skill.skills`);
    }
  }
}

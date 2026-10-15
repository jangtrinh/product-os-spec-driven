// Skill ids before 2.3.0 carried a retired kit namespace. The prefix is assembled here, in the one module that
// migrates it, so no other file has to name it.
const LEGACY_PREFIX=['v','s','f'].join('')+':';

// Legacy names map to the same capability name, except the spec skill.
const RENAMED=Object.freeze({spec:'spec-structure'});

export function isLegacySkillId(id) {
  return typeof id==='string'&&id.startsWith(LEGACY_PREFIX);
}

export function replacementForLegacySkillId(id) {
  if(!isLegacySkillId(id))return id;
  const name=id.slice(LEGACY_PREFIX.length);
  return RENAMED[name]??name;
}

export function migrateLegacySkillIds(config) {
  for(const stage of Object.values(config.stages ?? {})) {
    if(stage?.skill?.skills) stage.skill.skills=stage.skill.skills.map(replacementForLegacySkillId);
  }
  return config;
}

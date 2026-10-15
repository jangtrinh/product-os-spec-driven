import fs from 'node:fs';
import { validate, realDate } from '../lib/schema-lite.mjs';
import { loadSchema, effectiveManifest } from '../lib/manifest.mjs';
import { localPath } from '../lib/local-path.mjs';
import { themeVarNames } from '../lib/theme.mjs';
import { DEFAULT_TIER_BY_TYPE } from '../lib/defaults.mjs';
import {STAGES} from '../lib/config/config-loader.mjs';
import {stageOwningFolder} from './stage-output-owner.mjs';
export function manifestRules(spec,P,options={}) {
  const file='spec.manifest.json',add=(code,msg,fix='correct the manifest using format/SPEC-FORMAT-v2.md')=>P.add(code,file,1,msg,fix);
  if(spec.manifestError) {add('M-MANIFEST',spec.manifestError);return;}
  const raw=spec.manifest;
  for(const v of validate(raw,loadSchema('manifest.schema.json'))) add('M-SCHEMA',`${v.path} ${v.message}`);
  const m=effectiveManifest(raw),ids=new Set(),numbers=new Set(),folders=new Set();
  for(const a of m.artifacts) {
    if(ids.has(a.id)) add('M-ARTIFACT-DUP',`duplicate artifact ${a.id}`);ids.add(a.id);
    if(numbers.has(a.n)) add('M-ARTIFACT-N',`duplicate artifact number ${a.n}`);numbers.add(a.n);
    if(a.folder) {
      if(folders.has(a.folder)) add('M-ARTIFACT-FOLDER',`duplicate folder ${a.folder}`);folders.add(a.folder);
      const owner=stageOwningFolder(a.folder),future=owner&&options.stage&&STAGES.indexOf(options.stage)<STAGES.indexOf(owner);
      if(!future&&!spec.files.some(f=>f.startsWith(a.folder+'/'))) add('M-ARTIFACT-EMPTY',`${a.folder} has no files`);
    }
  }
  const tiers=new Set(['index']);
  for(const t of m.tiers) {if(tiers.has(t.id)) add('M-TIER',`duplicate tier ${t.id}`);tiers.add(t.id);}
  for(const [t,id] of Object.entries(raw.tier_by_type || {})) if(![...Object.keys(DEFAULT_TIER_BY_TYPE),'release','epic','readable-review'].includes(t) || !tiers.has(id)) add('M-TIER',`unsupported type/tier ${t}: ${id}`);
  for(const key of ['epics','capabilities']) {const r=raw.readable?.[key];if(r && (r.min ?? (key==='epics'?6:3))>(r.max ?? (key==='epics'?8:7))) add('M-PATH',`readable ${key} min exceeds max`);}
  const paths=[raw.tests_root,raw.glossary?.document,raw.glossary?.context,raw.changes?.blocks,raw.migration_report,...(raw.images?.deny || [])].filter(x=>x!==undefined);
  for(const r of paths) try {localPath(spec.root,r,{missing:true});}catch(e){add('M-PATH',e.message);}
  if(raw.date && !realDate(raw.date)) add('M-DATE',`invalid date ${raw.date}`);
  if(raw.theme?.tokens) {
    try {
      const have=themeVarNames(fs.readFileSync(localPath(spec.root,raw.theme.tokens),'utf8'));
      const required=themeVarNames(fs.readFileSync(new URL('../lib/theme.default.css',import.meta.url),'utf8'));
      const missing=required.filter(v=>!have.includes(v));
      if(missing.length) add('M-THEME-VARS',`missing theme variables ${missing.join(', ')}`);
    } catch(e) {add('M-THEME',e.message);}
  }
}

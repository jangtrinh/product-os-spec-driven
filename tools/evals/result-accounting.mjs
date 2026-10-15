import fs from 'node:fs';
import path from 'node:path';
import {loadSpec} from '../lib/spec-load.mjs';
import {buildModel} from '../lib/doc-model.mjs';
import {sha256} from '../lib/config/path-selection.mjs';
import {STAGES} from '../lib/config/config-loader.mjs';

export function caseCoverage(root, scopes) {
  return specCoverage(path.join(root,'spec'),scopes);
}
export function requestedCoverage(directory) {
  const meta=JSON.parse(fs.readFileSync(path.join(directory,'case.json')));
  const scopes=STAGES.filter(stage=>meta.ui||!['design','uiux'].includes(stage)).map(stage=>`stage:${stage}`);
  return specCoverage(path.join(directory,'candidate'),scopes);
}
function specCoverage(specRoot,scopes) {
  const spec=loadSpec(specRoot);
  if(spec.inputError)throw new Error(`Cannot enumerate requested membership: ${spec.inputError}`);
  const model = buildModel(spec);
  const ac = model.stories.flatMap(story => story.ac.rows.map(row => `${story.doc.id}.${row.id}`));
  const scn = model.stories.flatMap(story => (story.doc.fm.scenarios ?? []).map(row => ({id: `${story.doc.id}.${row.id}`, method: row.method, status: row.status})));
  return {scope: {ids: scopes, selected: scopes.length, total: scopes.length}, ac: {ids: ac, selected: ac.length, total: ac.length},
    scenarios: {items: scn, selected: scn.length, total: scn.length}, na: [],
    quality_ac: {passed_ids: [], passed: 0, denominator: ac.length, reason: 'Lint/expected and fixture tests do not verify all mandatory product scenarios on current appropriate evidence'},
    source_items: {status: 'NOT_RUN', reason: 'No source-item ledger declared; never combine source preservation with typed coverage'}};
}
export function pinsFor(repo) {
  const pins = {};
  for (const directory of ['tools/evals', 'tools/run', 'tools/lint', 'tools/lib', 'templates', 'rules', 'prompts', 'format/schema']) {
    function walk(relative) {
      for (const entry of fs.readdirSync(path.join(repo, relative), {withFileTypes: true}).sort((a,b) => a.name.localeCompare(b.name))) {
        const file = `${relative}/${entry.name}`;
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) pins[file] = sha256(fs.readFileSync(path.join(repo, file)));
      }
    }
    walk(directory);
  }
  pins['config/pipeline.yaml'] = sha256(fs.readFileSync(path.join(repo, 'config/pipeline.yaml')));
  for (const file of ['SPEC.md', 'format/gate-model.md', 'format/design-model.md']) {
    pins[file] = sha256(fs.readFileSync(path.join(repo, file)));
  }
  return pins;
}
export function resultDiff(previous, current) {
  const old = new Set(previous?.findings ?? []), now = new Set(current.findings);
  const selected = new Set(current.cases.map(row => row.id));
  return {previous: previous?.result_path ?? null, new_findings: [...now].filter(row => !old.has(row)),
    resolved_findings: [...old].filter(row => selected.has(row.split(':')[0]) && !now.has(row)),
    not_rechecked: previous?.cases.filter(row => !selected.has(row.id)).map(row => row.id) ?? [],
    cases: current.cases.map(row => ({id: row.id, before: previous?.cases.find(item => item.id === row.id)?.status ?? null, after: row.status})),
    changed_inputs: current.cases.flatMap(row=>{
      const old=previous?.cases.find(item=>item.id===row.id)?.execution_inputs;
      if(!old)return [];
      const now=row.execution_inputs;
      return [...new Set([...Object.keys(old),...Object.keys(now)])].filter(file=>old[file]!==now[file])
        .map(file=>({case_id:row.id,file,before:old[file]??null,after:now[file]??null}));
    }),
    changed_pins: Object.keys(current.pins).filter(key => previous && previous.pins[key] !== current.pins[key])};
}

import fs from 'node:fs';
import path from 'node:path';
import {sha256} from '../lib/config/path-selection.mjs';

// Snapshot the resolved selected corpus, not a similarly named repository copy.
export function selectedInputs(casesRoot,selected) {
  const cases={};
  for(const id of selected) {
    const files={};
    function walk(relative) {
      const file=path.join(casesRoot,id,relative);
      if(!fs.existsSync(file)) {files[relative||'.']=null;return;}
      const stat=fs.lstatSync(file);
      if(stat.isSymbolicLink()) throw new Error(`Selected input symlink is unsupported: ${file}`);
      if(stat.isDirectory()) for(const name of fs.readdirSync(file).sort()) walk(relative?`${relative}/${name}`:name);
      else if(stat.isFile()) files[relative]=sha256(fs.readFileSync(file));
      else throw new Error(`Selected input is not a file/directory: ${file}`);
    }
    walk('');
    for(const required of ['po-spec.md','case.json','expected.md','candidate']) {
      if(!fs.existsSync(path.join(casesRoot,id,required))) files[required]=null;
    }
    cases[id]=files;
  }
  return {cases_root:casesRoot,cases};
}
export function inputChanges(before,after) {
  return Object.keys(before.cases).flatMap(case_id=>{
    const old=before.cases[case_id],now=after.cases[case_id];
    return [...new Set([...Object.keys(old),...Object.keys(now)])].sort()
      .filter(file=>old[file]!==now[file]).map(file=>({case_id,file,before:old[file]??null,after:now[file]??null}));
  });
}

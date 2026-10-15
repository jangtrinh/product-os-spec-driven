import {fileURLToPath} from 'node:url';
import {STAGES} from '../lib/config/config-loader.mjs';
import {declaredOutputs} from '../run/project-registries.mjs';
const KIT_ROOT=fileURLToPath(new URL('../../',import.meta.url));
let table;
/* folder -> earliest stage whose prompt "## Output files" declares a path under spec/<folder>/ (the source the runner uses). */
function ownerTable() {
  if(table) return table;
  table=new Map();
  for(const stage of STAGES) {
    let outputs=[];try{outputs=declaredOutputs(KIT_ROOT,stage);}catch{continue;}
    for(const out of outputs) {
      const m=/^spec\/([^/]+)\//.exec(out);
      if(m && !table.has(m[1])) table.set(m[1],stage);
    }
  }
  return table;
}
/* Stage that first produces documents in spec/<folder>/, or null when no prompt declares that folder. */
export function stageOwningFolder(folder) {
  return ownerTable().get(folder) ?? null;
}

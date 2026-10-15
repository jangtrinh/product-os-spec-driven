import { splitRow } from '../lib/md.mjs';
import { legacyPattern } from './id-crosswalk.mjs';
// A bullet's delimiter and a table's ID cell/pipes are framing, not obligation text.
export function sourceItemText(raw,id,line,legacyId){
 let text=raw.split('\n')[line-1];
 if(text===undefined)throw Error(`source item ${id} has no source line ${line}`);
 const bullet=/^- (AC-\d+\.\d+): ?(.*)$/.exec(text);
 if(bullet){if(bullet[1]!==id)throw Error(`source item ${id} differs from its bullet identity`);text=bullet[2];}
 else if(/^\s*\|/.test(text))text=splitRow(text).slice(1).join('\n');
 return legacyId?text.replace(legacyPattern,token=>token.toUpperCase()===legacyId?'':token):text;
}

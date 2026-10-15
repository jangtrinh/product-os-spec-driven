import { parseTables } from '../lib/md.mjs';
import { expandScenarios } from '../lib/structure.mjs';
export function scenarioDetails(model,P) {
  for(const d of model.docs.filter(d=>['us','review','build'].includes(d.type))) {
    const owners=d.type==='us'?[d.id]:[...d.fm.trace?.us || [],...(d.fm.trace?.ac || []).map(x=>x.split('.')[0])];
    for(const table of parseTables(d.body).filter(t=>t.header[0]==='Scenario')) {
      const cols=Object.fromEntries(table.header.map((x,i)=>[x.toLowerCase(),i]));
      for(const [i,row] of table.rows.entries())for(const id of expandScenarios(row[0])) {
        const explicit=/^((?:US-(?:P?\d+)|NF-\d+))\./.exec(row[0])?.[1];
        const stories=model.stories.filter(s=>(explicit?s.doc.id===explicit:owners.includes(s.doc.id)) && s.doc.fm.scenarios?.some(x=>x.id===id));
        const cited=(row[cols.ac] || '').match(/(?:US-(?:P?\d+)\.|NF-\d+\.)?AC-\d+/g) || [];
        const method=row[cols['method / evidence']] || '',status=cols.status===undefined?'':row[cols.status];
        if(!stories.length || stories.some(story=>{const s=story.doc.fm.scenarios.find(x=>x.id===id);return cited.some(ac=>!s.ac.includes(ac.includes('.')?ac.slice(ac.indexOf('.')+1):ac) || ac.includes('.') && !ac.startsWith(story.doc.id+'.')) || method && !method.includes(s.method) || status && status!==s.status;}))P.add('S-SCN-DETAIL',d.rel,d.bodyLine+table.rowLines[i],`${id} detail has absent or contradictory owning scenario/AC/method/status`,'trace the owning US and align detail with its authoritative scenario');
      }
    }
  }
}

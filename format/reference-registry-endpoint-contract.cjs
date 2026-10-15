'use strict';
const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const parse=require('./reference-registry-json.cjs');
const placeholders=s=>[...s.matchAll(/\{([^{}]+)\}/g)].map(m=>m[1]);
function audit(entries,demand) {
  const contracts=new Map(),dir=path.join(__dirname,'reference-registry-endpoint-contexts');
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json')))
    for(const [id,contract]of parse(fs.readFileSync(path.join(dir,file),'utf8'))) {
      demand(!contracts.has(id),'duplicate endpoint context '+id);contracts.set(id,contract);
    }
  for(const entry of entries.values()) {
    const contract=contracts.get(entry.id);
    demand(contract,'missing endpoint context '+entry.id);
    if(!contract)continue;
    demand(isDeepStrictEqual(entry.source,contract.source),'source endpoint ownership '+entry.id);
    const rules=[entry,...(entry.cases||[])];
    demand(rules.length===contract.targets.length,'endpoint case count '+entry.id);
    for(const [i,rule]of rules.entries()) {
      const expected=contract.targets[i];
      demand(expected && isDeepStrictEqual(rule.target,expected.node),'target endpoint ownership '+entry.id);
      if(i)demand(isDeepStrictEqual(rule.when,expected?.when),'endpoint discriminator context '+entry.id);
      for(const node of [entry.source,rule.target,...(entry.ownership?[entry.ownership]:[])]) {
        const prefix=node.id.split(':')[0],dynamic=/^\{[^{}]+\}$/.test(prefix);
        demand(dynamic || node.kinds.includes(prefix),'endpoint namespace/kind mismatch '+entry.id);
        const names=placeholders(node.id);
        demand(names.every(name=>contract.available.includes(name)),'unavailable endpoint placeholder '+entry.id);
        demand(node.id.replace(/\{[^{}]+\}/g,'').match(/[{}]/)===null,'malformed endpoint template '+entry.id);
      }
      demand(!rule.causal || entry.source.id!==rule.target.id,'causal self-edge template '+entry.id);
    }
  }
  for(const id of contracts.keys())demand(entries.has(id),'stale endpoint context '+id);
}
module.exports={audit,placeholders};

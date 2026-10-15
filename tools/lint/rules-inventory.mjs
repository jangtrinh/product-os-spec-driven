import { sourceExists } from './rules-glossary.mjs';
export function inventoryRules(model,P) {
  const rows=model.inventory?.screens || [],file=model.manifest.design?.inventory || model.inventoryDoc?.fm.data || 'spec.manifest.json';
  const add=(code,msg)=>P.add(code,file,1,msg,'repair inventory, source, and UI context associations');
  const seen=new Set();
  for(const r of rows) {
    const key=`${r.screen}/${r.state}`;if(seen.has(key)) add('DS-INVENTORY',`duplicate screen/state ${key}`);seen.add(key);
    for(const u of r.us || []) if(!model.stories.some(s=>s.doc.id===u && s.doc.fm.screens?.includes(r.screen))) add('DS-INVENTORY',`${u} does not declare ${r.screen}`);
    for(const a of r.ac || []) {const [u,id]=a.split('.');if(!r.us.includes(u) || !model.stories.find(s=>s.doc.id===u)?.ac.rows.some(x=>x.id===id)) add('DS-INVENTORY',`unknown owning AC ${a}`);}
    for(const s of r.scenarios || []) {const [u,id]=s.split('.');if(!r.us.includes(u) || !model.stories.find(s=>s.doc.id===u)?.doc.fm.scenarios?.some(x=>x.id===id)) add('DS-INVENTORY',`unknown owning scenario ${s}`);}
    for(const ref of [...r.components || [],...r.patterns || []]) {
      const [adapter,handle]=ref.split('/'),kind=(r.components || []).includes(ref)?'component':'pattern',catalog=model.catalogs?.find(c=>c.declaration.id===adapter && c.declaration.kind===kind);
      const item=catalog?.value.items?.find(x=>x.handle===handle);
      if(!item || item.status==='retired') add('DS-CATALOG',`unknown or retired catalog handle ${ref}`);
      else if(item.status==='deprecated') P.warn('DS-CATALOG',file,1,`deprecated handle ${ref}; replaced_by ${item.replaced_by || 'not declared'}`,'use the source-backed replacement handle');
    }
    for(const ref of [r.flow,r.data]) if(ref && !ref.startsWith('not-applicable:') && !sourceExists(model,model.inventoryDoc || {rel:file},ref)) add('DS-INVENTORY',`flow/data reference missing: ${ref}`);
    if(r.source?.kind==='figma') {
      if(!r.source.ref?.startsWith('source-') || !model.designSources?.entries?.some(e=>e.id===r.source.ref)) add('DS-SOURCE',`${key} needs an explicit generated symbolic source`);
    } else if(r.source?.kind==='html-board') {if(!model.boardIds.has(r.source.ref)) add('DS-SOURCE',`${key} source board missing`);}
    else if(r.source?.kind!=='not-created' || r.source.ref!==null || !r.source.reason?.trim()) add('DS-SOURCE',`${key} source kind/ref/reason missing`);
    for(const b of r.boards || []) if(!model.boardIds.has(b)) add('DS-BOARD',`${key} board ${b} missing`);
    if(!r.roles?.length || !r.scope?.length || !r.consequences?.length) add('DS-STATES',`${key} role/scope/consequences missing`);
    if(model.options.designRequired && !model.uiRows?.some(x=>x.screen===r.screen && x.state===r.state)) add('U-CONTRACT-DESIGN',`${key} has no extended UI target`);
  }
  if(model.options.designRequired) for(const screen of new Set(rows.map(r=>r.screen))) for(const state of ['normal','empty','loading','error','disabled','focus','long-content','no-permission']) {
    if(!seen.has(`${screen}/${state}`) && !model.inventoryDoc?.body.split('\n').some(line=>line.includes(`${screen}/${state}`) && /not-applicable|\bNA\b/.test(line) && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(line))) add('DS-STATES',`${screen}/${state} needs row or source-backed NA reason/confirmer`);
  }
  for(const r of model.uiRows || []) if(r.state) {
    const inv=rows.find(x=>x.screen===r.screen && x.state===r.state);
    if(!inv || inv.route!==r.route || r.roles.some(x=>!inv.roles.includes(x)) || r.scope.some(x=>!inv.scope.includes(x)) || r.us.some(x=>!inv.us.includes(x)) || !r.target?.trim()) P.add('U-CONTRACT-DESIGN',r.file,r.line,'extended UI context/target disagrees with inventory','use exact inventory route/state/roles/scope and target');
    for(const s of r.used_by) if(!r.us.some(u=>inv?.scenarios?.includes(`${u}.${s}`))) P.add('U-CONTRACT-CONTEXT',r.file,r.line,'scenario is not mapped to this inventory context','join the owning US scenario to its real state');
  }
}

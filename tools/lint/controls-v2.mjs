import fs from 'node:fs';
import path from 'node:path';
import { hash } from '../lib/digests.mjs';
const U='ux/ui-contract.md',US='us/US-01.md',G='decisions/glossary.md';
const edit=(t,file,old,value)=>t.edit(file,s=>s.replace(old,value));
const m=(t,fn)=>t.json('spec.manifest.json',fn);
export const v2Controls=[
 ['U-CONTRACT-REQUIRED',t=>t.remove(U)],
 ['U-CONTRACT-SCHEMA',t=>edit(t,U,'| Screen | State |','| Screens | State |')],
 ['U-CONTRACT-SCREEN',t=>t.edit(U,s=>s.replace(/^\| S03.*\n/gm,''))],
 ['U-CONTRACT-US',t=>edit(t,U,'| US-01 |','| US-99 |')],
 ['U-CONTRACT-SELECTOR',t=>edit(t,U,'role=button; name=Complete filter action','role=button')],
 ['U-CONTRACT-SCN',t=>edit(t,U,'SCN-01-01, SCN-01-02','SCN-99-01')],
 ['W-UI-CONTRACT-LEGACY',t=>{t.remove(U);m(t,j=>{j.ui_contract='legacy-absent';j.migrated_from='v1';j.migration_report='assets/migration.json';});t.write('assets/migration.json',JSON.stringify({source_format:'1',source_sha256:'a'.repeat(64),ui_contract_missing_screens:['S01','S02','S03']}));},'warning'],
 ['G-GLOSSARY',t=>t.remove(G)],
 ['G-ENTRY',t=>edit(t,G,'A saved reusable selection.','')],
 ['G-DUP',t=>edit(t,G,'| Saved filter | saved-filter | A saved reusable selection. | D1 |','| Saved filter | saved-filter | A saved reusable selection. | D1 |\n| Saved filter | saved-filter-2 | Duplicate term. | D1 |')],
 ['G-TERM-REF',t=>edit(t,G,'| D1 |','| D999 |')],
 ['O-OPEN-EMPTY',t=>t.edit(US,s=>s+'\n- OPEN:\n')],
 ['O-OPEN-BLOCKING',t=>t.edit(US,s=>s+'\n- OPEN[blocking]: Who may save?\n')],
 ['D-DATA',t=>edit(t,'ux/inventory.md','data: assets/inventory.json','data: assets/change.json')],
 ['M-DESIGN',t=>m(t,j=>j.design.profile='assets/missing.json')],
 ['M-GATE-MODEL',t=>m(t,j=>j.gate_model.graph='assets/missing.json')],
 ['DS-AUTHORITY',t=>t.json('assets/profile.json',j=>j.authority[0].revision='a'.repeat(64))],
 ['DS-TOKENS',t=>t.json('assets/profile.json',j=>j.tokens.generated=[j.tokens.source])],
 ['DS-CATALOG',t=>t.json('assets/inventory.json',j=>j.screens[0].components=['example/Missing'])],
 ['DS-CAPABILITY',t=>{t.json('assets/profile.json',j=>j.capabilities[0].status='missing');m(t,j=>j.design.evidence=['assets/visual.json']);t.json('assets/receipt.json',j=>{j.domain='visual';j.visual={screen:'S01',state:'normal',role:'Dev',scope:'workspace',scenarios:['US-01.SCN-01-01'],width:375,height:800,mode:'light',locale:'vi',fixture:'local',browser:'chromium',build:'not-built',ds:'1',probe:'1',png:'assets/shots/saved-filters-1440.png',measurements:'assets/tokens.json'};t.write('assets/visual.json',JSON.stringify(j));});}],
 ['DS-INVENTORY',t=>t.json('assets/inventory.json',j=>j.screens.push(j.screens[0]))],
 ['DS-STATES',t=>t.json('assets/inventory.json',j=>j.screens[0].consequences=[])],
 ['DS-SOURCE',t=>t.json('assets/inventory.json',j=>j.screens[0].source={kind:'figma',ref:null})],
 ['DS-SIDECAR',t=>t.json('assets/sources.json',j=>j.generated=false)],
 ['DS-CURATED',t=>t.edit('ux/inventory.md',s=>s+'\nnode_id: 10:20\n')],
 ['DS-BOARD',t=>t.remove('ux/wireframes/html/W-01-saved-filters-list.html')],
 ['U-CONTRACT-DESIGN',t=>edit(t,U,'| normal |','| absent-state |')],
 ['U-CONTRACT-CONTEXT',t=>t.edit(U,s=>{const row=s.split('\n').find(l=>l.startsWith('| S01 | normal |'));return s.replace(row,row+'\n'+row);})],
 ['DS-CATALOG',t=>{t.json('assets/catalog.json',j=>{j.items[0].status='deprecated';j.items[0].reason='Use the source-backed replacement';j.items[0].replaced_by='ButtonNext';});t.json('assets/profile.json',j=>j.catalogs[0].revision=hash(fs.readFileSync(path.join(t.root,'assets/catalog.json'))));},'warning'],
 ['DS-COPY',t=>edit(t,G,'| Term | Anchor | Definition | Source |\n|---|---|---|---|\n| Saved filter | saved-filter | A saved reusable selection. | D1 |','| Term | Anchor | Definition | Source | Locale | Source key | Retained terms | Exceptions |\n|---|---|---|---|---|---|---|---|\n| Saved filter | saved-filter | A saved reusable selection. | D1 | vi | missing.key | [] | [] |')],
];

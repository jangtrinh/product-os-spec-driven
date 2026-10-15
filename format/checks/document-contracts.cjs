const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const baseline=process.argv[2];
const read=f=>baseline?execFileSync('git',['show',baseline+':'+f],{encoding:'utf8'}):fs.readFileSync(f,'utf8');
const spec=read('SPEC.md'),format=read('format/SPEC-FORMAT-v2.md'),design=read('format/design-model.md'),gate=read('format/gate-model.md'),schemaReadme=read('format/schema/README.md');
const prohibited=['plan'+'notator','effective'+'-html','W-'+'DESIGN-'+'MIGRATION'];
const checks=[
 ['F4 accepted warning policy',!format.includes(prohibited[2])&&design.includes('no extra lint warning class')],
 ['F5 packet schema/config/CLI',spec.includes('definitions_dir:')&&format.includes('--import-decision')&&gate.includes('packet-interchange.md')],
 ['F6 exact extended authoring grammar',format.includes('glossary-grammar.md')],
 ['F7 registered compile entrypoint',schemaReadme.includes('supersedes')&&schemaReadme.includes('schema-suite.cjs')&&!schemaReadme.includes('Schemas are local, self-contained')],
 ['D12 branded kit and owned packet guidance',spec.startsWith('# PRODUCT:OS Spec Driven\n')&&!prohibited.slice(0,2).some(x=>(spec+format+design+gate).toLowerCase().includes(x))]
];
let failed=0;for(const [label,ok] of checks){console.log((ok?'PASS ':'RED ')+label);if(!ok)failed++;}
if(baseline){assert.equal(failed,5);console.log('5/5 pre-fix normative defects reproduced');process.exit(0);}
assert.equal(failed,0);
const mapping=read('format/requirements-map.md'),ids=[...mapping.matchAll(/^\| (R-[DG]\d+|D\d+) \|/gm)].map(x=>x[1]);
const expected=['D','G'].flatMap(k=>Array.from({length:24},(_,i)=>'R-'+k+(i+1))).concat(Array.from({length:12},(_,i)=>'D'+(i+1)));
assert.deepEqual([...ids].sort(),expected.sort());
console.log('48/48 requirements; D1-D12 12/12; missing 0; duplicate 0');
const sourceMap=read('format/source-map.md');
for(const [label,file] of [['Baseline SPEC','reference/baseline-v0.2/SPEC.md']]){
 const headings=fs.readFileSync(file,'utf8').split('\n').filter(x=>/^#{2,3} /.test(x));
 for(const h of headings)assert(sourceMap.includes('| '+label+' | '+h.replaceAll('|','\\|')+' |'),h);
 assert.equal(sourceMap.split('\n').filter(x=>x.startsWith('| '+label+' |')).length,headings.length);
 console.log(label+': '+headings.length+'/'+headings.length+' headings');
}
const retainedRules=sourceMap.split('\n').filter(x=>x.startsWith('| Retained format rules |'));
assert.equal(retainedRules.length,24);console.log(retainedRules.length+'/'+retainedRules.length+' retained format rules');
const codes=[...new Set([...format.matchAll(/^\| ([A-Z]+-[A-Z0-9-]+) \|/gm)].map(x=>x[1]))];
assert.ok(codes.length>=72);console.log(codes.length+' retained lint codes (floor 72)');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const docs=['SPEC.md','README.md',...files('format').filter(f=>f.endsWith('.md'))];
const slug=s=>s.toLowerCase().replace(/<[^>]*>/g,'').replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s/g,'-');
let links=0;
for(const file of docs){
 const text=fs.readFileSync(file,'utf8');
 for(const match of text.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)){
  const href=match[1];if(/^(https?:|mailto:)/.test(href))continue;
  const [target,fragment]=href.split('#'),resolved=path.resolve(path.dirname(file),target||path.basename(file));
  assert(fs.existsSync(resolved),file+' missing '+href);
  if(fragment&&resolved.endsWith('.md')){
   const body=fs.readFileSync(resolved,'utf8'),headings=body.split('\n').filter(x=>/^#{1,6} /.test(x)).map(x=>slug(x.replace(/^#{1,6} /,'')));
   assert(headings.includes(fragment),file+' missing fragment '+href);
  }links++;
 }
}
console.log(docs.length+' Markdown files; '+links+' local links/fragments valid');
for(const line of mapping.split('\n').filter(x=>/^\| (R-|D\d)/.test(x))){
 const destinations=line.split('|').at(-2).trim().split('; ');
 for(const dest of destinations){const split=dest.indexOf(':');const file=dest.slice(0,split),heading=dest.slice(split+1);
  assert(read(file).split('\n').some(x=>/^#{1,6} /.test(x)&&x.replace(/^#{1,6} /,'')===heading),dest);
 }
}
console.log('60 mapping IDs have valid destination headings');
for(const file of files('format').filter(f=>/\.(cjs|json)$/.test(f)&&!f.includes('/evidence/'))){
 assert(fs.readFileSync(file,'utf8').split('\n').length<=201,file+' exceeds 200 lines');
}
assert(!prohibited.some(x=>docs.map(read).join('\n').toLowerCase().includes(x.toLowerCase())),'prohibited name/class');
assert(spec.includes('max_rounds: 3')&&spec.includes('max_fix_rounds: 3')&&design.includes('375/768/1440')&&design.includes('874×827')&&gate.includes('Critical/Major'));
console.log('Size, branding, warning policy, unchanged gate floors/caps valid');

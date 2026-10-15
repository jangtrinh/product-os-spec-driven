import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lintSpec} from '../index.mjs';
import {parsePrototype} from '../../lib/prototype-model.mjs';
import {wireframe,prototype} from '../../../fixtures/runner/wireframe-prototype-fixture.mjs';
const kit=fileURLToPath(new URL('../../../',import.meta.url));
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ui-lint-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.cpSync(path.join(kit,'fixtures/v2/full'),root,{recursive:true});for(const [dir,name,text] of [['wireframe','wireframes.md',wireframe],['prototype','index.html',prototype]]){fs.mkdirSync(path.join(root,dir));fs.writeFileSync(path.join(root,dir,name),text);}const manifest=JSON.parse(fs.readFileSync(path.join(root,'spec.manifest.json')));manifest.artifacts.push({id:'wireframe',folder:'wireframe',name:'Wireframes'},{id:'prototype',folder:'prototype',name:'Prototype'});fs.writeFileSync(path.join(root,'spec.manifest.json'),JSON.stringify(manifest));return {root,write:(file,text)=>fs.writeFileSync(path.join(root,file),text)};}
const codes=(p,stage)=>lintSpec(p.root,{stage}).problems.errors.map(x=>x.code);
for(const tag of ['noscript','iframe','noembed','noframes','object','embed','template'])test(`constrained grammar rejects ${tag} wrapper with its tag and source line`,t=>{
 const p=fixture(t),raw=fs.readFileSync(path.join(kit,'fixtures/runner/prototype-elements',tag+'.html'),'utf8');p.write('prototype/index.html',raw);
 const errors=lintSpec(p.root,{stage:'prototype'}).problems.errors,at=raw.slice(0,raw.indexOf('<'+tag+'>')).split('\n').length;
 assert.ok(errors.some(e=>e.code==='P-ELEMENT'&&e.file==='prototype/index.html'&&e.line===at&&e.message.includes('<'+tag+'>')),JSON.stringify(errors));
});
test('the published prototype template passes prototype rules with its example wireframe',t=>{
 const p=fixture(t),template=/```html\n([\s\S]*?)\n```/.exec(fs.readFileSync(path.join(kit,'templates/prototype.md'),'utf8'))[1];
 p.write('prototype/index.html',template);p.write('wireframe/wireframes.md',`---\nid: wireframe-plan\ntype: note\ntitle: Wireframes\nupdated: "2026-10-13"\nstatus: draft\n---\n## Screens\n| Screen | Title | US | AC |\n|---|---|---|---|\n| SCR-001 | Example | US-01 | US-01.AC-01 |\n## Flows\n| US | Path |\n|---|---|\n| US-01 | SCR-001 |\n## Wireframes\n### SCR-001--normal\n\`\`\`text\n+---+\n| Example |\n+---+\n\`\`\`\n${['empty','error','loading'].map(state=>'### SCR-001--'+state+'\nN/A: example skeleton omits this state.\n').join('')}`);
 // The template is a one-story skeleton; check its prototype rules against that
 // example, not unrelated US-02/03 requirements from the full fixture.
 assert.deepEqual(lintSpec(p.root,{stage:'prototype'}).problems.errors.filter(e=>e.code.startsWith('P-')),[]);
});
for(const [name,markup] of [
 ['unlisted custom element','<lofi-app></lofi-app>'],
 ['non-viewport metadata','<meta name="robots" content="none">'],
 ['mixed viewport and refresh metadata','<meta name="viewport" http-equiv="refresh" content="0;url=next.html">'],
 ['editable input','<input type="text">'],
 ['ineffective readonly checkbox','<input type="checkbox" readonly>'],
 ['submit button','<button type="submit">Submit</button>'],
 ['editable textarea','<textarea>Editable</textarea>'],
 ['enabled select','<select><option>First</option></select>'],
 ['standalone option','<option>First</option>'],
 ['HTML section inside SVG','<svg><section id="ghost"></section></svg>'],
 ['HTML section inside disabled select','<select disabled><section id="ghost"></section></select>'],
 ['duplicate metadata with invalid first value','<meta name="robots" name="viewport" content="none">'],
])test(`constrained grammar refuses ${name}`,t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('</section>','</section>\n'+markup));assert.ok(codes(p,'prototype').includes('P-ELEMENT'));});
test('allowed readonly controls, disabled choices, basic SVG shapes and semantic text pass',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('</section>','</section><footer><h4>Example</h4><h5>Detail</h5><h6>Note</h6><strong>Strong</strong><em>Emphasis</em><small>Small</small><br><hr><figure><figcaption>Figure</figcaption><pre><code>Text</code></pre></figure><label for="example-field">Field</label><textarea id="example-field" readonly>Fixed</textarea><input type="checkbox" disabled><button type="button">Preview</button><select disabled><option>Fixed choice</option></select><svg aria-label="Example"><g><rect width="8" height="8"/><circle cx="4" cy="4" r="2"/></g></svg><svg aria-label="Empty"/><table><thead><tr><th>Column</th></tr></thead><tbody><tr><td>Row</td></tr></tbody></table></footer>'));assert.deepEqual(codes(p,'prototype'),[]);});
test('tag-looking text in comments and styles is outside the element grammar',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('</style>','/* <noscript><iframe><lofi-app> */\n</style>').replace('</section>','</section><!-- <object><embed><template> -->'));assert.deepEqual(codes(p,'prototype'),[]);});
for(const tag of ['divé','main$','section\u00a0'])test(`the whole element name ${JSON.stringify(tag)} must match the allow-list`,t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('</section>',`</section><${tag}></${tag}>`));assert.ok(lintSpec(p.root,{stage:'prototype'}).problems.errors.some(e=>e.code==='P-ELEMENT'&&e.message.includes('<'+tag+'>')));});
for(const markup of ['<input type="text" readonly\u00a0bogus>','<input type=text\u00a0readonly>'])test(`non-ASCII attribute whitespace cannot simulate readonly: ${JSON.stringify(markup)}`,t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('</section>','</section>'+markup));assert.ok(codes(p,'prototype').includes('P-ELEMENT'));});
test('non-ASCII space in an attribute name cannot supply a section id',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('id="SCR-001--normal"','id\u00a0="SCR-001--normal"'));assert.ok(codes(p,'prototype').includes('P-STATE'));});
test('non-ASCII class separator cannot supply a screen frame marker',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('class="screen"','class="screen\u00a0bogus"'));assert.ok(codes(p,'prototype').includes('P-SCREEN'));});
test('space after an SVG slash does not make a self-closing element',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('</section>','</section><svg/ ><section id="ghost"></section></svg>'));assert.ok(codes(p,'prototype').includes('P-ELEMENT'));});
test('HTML ASCII whitespace still separates real attributes and screen classes',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('class="screen"','class="screen\tother"').replace(' readonly','\treadonly\n'));assert.deepEqual(codes(p,'prototype'),[]);});
const commentFixture=name=>fs.readFileSync(path.join(kit,'fixtures/runner/prototype-comments',name),'utf8');
test('raw style comment opener cannot hide a later refresh tag from offline lint',t=>{const p=fixture(t);p.write('prototype/index.html',commentFixture('raw-style-refresh.html'));assert.ok(codes(p,'prototype').includes('P-OFFLINE'));});
test('unclosed comment hides all ids and sections in the verbatim review fixture',()=>{const parsed=parsePrototype(commentFixture('unclosed-comment.html'));assert.deepEqual(parsed.ids,[]);assert.equal(parsed.sections.size,0);assert.deepEqual(parsed.links,[]);});
test('unclosed comment before an otherwise valid prototype cannot satisfy coverage or navigation',t=>{const p=fixture(t);const opener=commentFixture('unclosed-comment.html').split('\n')[0];assert.equal(opener,'<!--');p.write('prototype/index.html',opener+'\n'+prototype);const result=codes(p,'prototype');assert.ok(result.includes('P-FLOW'));assert.ok(result.includes('P-STATE'));});
test('normal comment between sections adds no resources or phantom navigation and still passes',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('</section>','</section>\n<!-- <a href="#missing">US-99</a><meta http-equiv="refresh" content="0;url=next.html"> -->'));assert.deepEqual(codes(p,'prototype'),[]);});
for(const tag of ['script','textarea','title'])test(`comment opener in raw ${tag} cannot consume its closing tag or later resources`,()=>{const raw=commentFixture('raw-style-refresh.html').replace('<style>',`<${tag}>`).replace('</style>',`</${tag}>`);assert.ok(parsePrototype(raw).resources.includes('embedded or automatic navigation'));});
test('commented template close cannot expose inert sections or links and the forbidden template is rejected',t=>{const p=fixture(t);const inert='<template><!-- </template> --><section id="ghost"><a href="#missing">US-99</a></section></template>';p.write('prototype/index.html',prototype.replace('<section id="start">',inert+'<section id="start">'));const parsed=parsePrototype(inert);assert.deepEqual(parsed.ids,[]);assert.equal(parsed.sections.size,0);assert.ok(codes(p,'prototype').includes('P-ELEMENT'));});
for(const prefix of ['<!-->','<!--->','<!-- text --!>'])test(`browser-recognized comment end ${prefix} cannot hide a later refresh`,t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace('</section>','</section>'+prefix+'<meta http-equiv="refresh" content="0;url=next.html">'));assert.ok(codes(p,'prototype').includes('P-OFFLINE'));});
for(const [name,insert,code='P-OFFLINE'] of [
 ['refresh navigation','<meta http-equiv="refresh" content="0;url=next.html">'],
 ['preload image source','<link rel="preload" imagesrcset="hero.png 1x">'],
 ['external SVG reference','<svg><use xlink:href="icons.svg#i"></use></svg>'],
 ['iframe source document','<iframe srcdoc="&lt;p&gt;other page&lt;/p&gt;"></iframe>'],
 ['dangling SVG fragment','<svg><a xlink:href="#missing">missing</a></svg>','P-ANCHOR'],
 ['CSS image-set load','<style-placeholder>'],
 ['CSS image load','<image-placeholder>'],
])test(`offline lint refuses ${name}`,t=>{const p=fixture(t);const bad=insert==='<style-placeholder>'?prototype.replace('body {','body { background-image: image-set("panel.png" 1x);'):insert==='<image-placeholder>'?prototype.replace('body {','body { background-image: image("panel.png");'):prototype.replace('</head>',insert+'</head>');p.write('prototype/index.html',bad);assert.ok(codes(p,'prototype').includes(code),name);});
test('style text cannot supply a clickable flow path',t=>{const p=fixture(t);const style=/<style>[\s\S]*?<\/style>/.exec(prototype)[0];const bad=prototype.replace(style,'').replaceAll('href="#SCR-002--normal"','href="#start"').replace('<section id="start">','<section id="start">'+style.replace('</style>','/* <a href="#SCR-002--normal">ghost</a> */</style>'));p.write('prototype/index.html',bad);assert.ok(codes(p,'prototype').includes('P-FLOW'));});
test('inert template text cannot supply visible trace ids',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replaceAll('US-01.AC-01','<template>US-01.AC-01</template>'));assert.ok(codes(p,'prototype').includes('P-TRACE'));});
test('a section inside a template cannot satisfy state coverage or fragment resolution',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replace(/(<section id="SCR-001--error"[\s\S]*?<\/section>)/,'<template>$1</template>'));const result=codes(p,'prototype');assert.ok(result.includes('P-STATE'));assert.ok(result.includes('P-ANCHOR'));});
test('an N/A line mixed with ASCII does not exempt the state from prototype coverage',t=>{const p=fixture(t);p.write('wireframe/wireframes.md',wireframe.replace('### SCR-002--loading\n','### SCR-002--loading\nN/A: no loading here\n'));p.write('prototype/index.html',prototype.replace(/<section id="SCR-002--loading"[\s\S]*?<\/section>/,'').replaceAll('<a href="#SCR-002--loading">View loading state</a>',''));const result=codes(p,'prototype');assert.ok(result.includes('W-STATE'));assert.ok(result.includes('P-STATE'));});
test('plain prose with a hyphen inside a fence is not an ASCII screen layout',t=>{const p=fixture(t);p.write('wireframe/wireframes.md',wireframe.replace(/(### SCR-001--loading\n)```text\n[\s\S]*?\n```/,'$1```text\nLoading - please wait\n```'));assert.ok(codes(p,'wireframe').includes('W-STATE'));});
test('every rendered screen state needs a visible screen frame',t=>{const p=fixture(t);p.write('prototype/index.html',prototype.replaceAll('class="screen"','class="missing-frame"'));assert.ok(codes(p,'prototype').includes('P-SCREEN'));});
test('complete wireframes and offline anchor prototype pass the full deterministic lint',t=>{const p=fixture(t);assert.deepEqual(codes(p,'wireframe'),[]);assert.deepEqual(codes(p,'prototype'),[]);});
for(const [name,file,mutate,code,stage='wireframe'] of [
 ['missing flow','wireframe/wireframes.md',s=>s.replace('| US-01 | SCR-001 --Save filter--> SCR-002 |',''),'W-FLOW'],
 ['unknown AC','wireframe/wireframes.md',s=>s.replaceAll('US-01.AC-01','US-01.AC-99'),'W-TRACE'],
 ['unknown US','wireframe/wireframes.md',s=>s.replace('| SCR-001 | Saved filters | US-01,','| SCR-001 | Saved filters | US-99,'),'W-TRACE'],
 ['missing state','wireframe/wireframes.md',s=>s.replace('### SCR-001--error','### absent'),'W-STATE'],
 ['duplicate screen','wireframe/wireframes.md',s=>s.replace('| SCR-002 | Filter result','| SCR-001 | Filter result'),'W-SCREEN'],
 ['missing ASCII','wireframe/wireframes.md',s=>s.replace('```text','plain text'),'W-STATE'],
 ['unknown screen in flow','wireframe/wireframes.md',s=>s.replace('Save filter--> SCR-002','Save filter--> SCR-999'),'W-FLOW'],
 ['missing action','wireframe/wireframes.md',s=>s.replace('--Save filter-->','-- -->'),'W-FLOW'],
 ['missing section','prototype/index.html',s=>s.replace('id="SCR-001--error"','id="absent"'),'P-STATE','prototype'],
 ['dangling anchor','prototype/index.html',s=>s.replace('href="#SCR-001--error"','href="#missing"'),'P-ANCHOR','prototype'],
 ['external URL','prototype/index.html',s=>s.replace('</head>','<link href="https://example.test/font.css"></head>'),'P-OFFLINE','prototype'],
 ['protocol relative URL','prototype/index.html',s=>s.replace('</head>','<link href="//example.test/font.css"></head>'),'P-OFFLINE','prototype'],
 ['script source','prototype/index.html',s=>s.replace('</head>','<script src="local.js"></script></head>'),'P-OFFLINE','prototype'],
 ['disconnected flow','prototype/index.html',s=>s.replaceAll('href="#SCR-002--normal"','href="#start"'),'P-FLOW','prototype'],
 ['missing visible trace','prototype/index.html',s=>s.replaceAll('US-01.AC-01','untraced'),'P-TRACE','prototype'],
])test(`${name} turns the rule red and restoration is green`,t=>{const p=fixture(t),original=file.startsWith('wireframe')?wireframe:prototype;p.write(file,mutate(original));assert.ok(codes(p,stage).includes(code),JSON.stringify(lintSpec(p.root,{stage}).problems.list));p.write(file,original);assert.deepEqual(codes(p,stage),[]);});
test('N/A reason exempts only that state from HTML coverage',t=>{const p=fixture(t);p.write('wireframe/wireframes.md',wireframe.replace(/(### SCR-002--loading\n)[\s\S]*?```\n/, '$1N/A: No load after a local defer decision.\n'));p.write('prototype/index.html',prototype.replace(/<section id="SCR-002--loading"[\s\S]*?<\/section>/,'').replaceAll('<a href="#SCR-002--loading">View loading state</a>',''));assert.deepEqual(codes(p,'prototype'),[]);});
test('wireframe eval defers the declared future prototype artifact without creating placeholder output',t=>{const p=fixture(t);fs.unlinkSync(path.join(p.root,'prototype/index.html'));assert.deepEqual(codes(p,'wireframe'),[]);assert.ok(codes(p,'prototype').includes('P-INPUT'));});
test('ASCII borders allow source-language labels and bare unknown AC ids are rejected',t=>{const p=fixture(t);p.write('wireframe/wireframes.md',wireframe.replace('Filter name [My reviews','Tên bộ lọc [Bộ lọc'));assert.deepEqual(codes(p,'wireframe'),[]);p.write('wireframe/wireframes.md',wireframe+'\nOPEN: AC-99 has no source\n');assert.ok(codes(p,'wireframe').includes('W-TRACE'));});
test('upgraded approved manifests need no mutation to accept the two new literal outputs',t=>{const p=fixture(t);const file=path.join(p.root,'spec.manifest.json'),manifest=JSON.parse(fs.readFileSync(file));manifest.artifacts=manifest.artifacts.filter(a=>!['wireframe','prototype'].includes(a.id));fs.writeFileSync(file,JSON.stringify(manifest));assert.deepEqual(codes(p,'prototype'),[]);});

const view=(id,state)=>({
 title:id==='SCR-001'?'Saved filters':'Filter result',
 name:state==='empty'?'':state==='error'?'Open bugs':'My reviews',
 message:state==='normal'?(id==='SCR-001'?'Save a name up to 40 characters, open a saved filter, or choose delete.':'My reviews appears after save. Opening restores its filtered rows. Confirming delete removes it; cancel keeps it.'):state==='empty'?'No saved filters. Save a filter from the current list.':state==='error'?'A filter with this name exists. Choose a different name.':'Loading saved filters.',
 row:state==='normal'?(id==='SCR-001'?'Open bugs':'My reviews'):null,
});
export const wireframe=`---
id: wireframe-plan
type: note
title: "Wireframes"
updated: "2026-10-13"
status: draft
---
## Screens
| Screen | Title | US | AC |
|---|---|---|---|
| SCR-001 | Saved filters | US-01, US-02, US-03 | US-01.AC-01, US-01.AC-02, US-02.AC-01, US-03.AC-01, US-03.AC-02 |
| SCR-002 | Filter result | US-01, US-02, US-03 | US-01.AC-01, US-01.AC-02, US-02.AC-01, US-03.AC-01, US-03.AC-02 |
## Flows
| US | Path |
|---|---|
| US-01 | SCR-001 --Save filter--> SCR-002 |
| US-02 | SCR-001 --Open filter--> SCR-002 |
| US-03 | SCR-001 --Delete filter--> SCR-002 |
## Wireframes
${['SCR-001','SCR-002'].flatMap(id=>['normal','empty','error','loading'].map(state=>{
 const screen=view(id,state),lines=[screen.title,`Filter name [${screen.name}]`,screen.message,...(screen.row?[`Saved filters: ${screen.row} | Saved`]:[]),state==='normal'&&id==='SCR-001'?'[Save filter] [Open filter] [Confirm delete] [Cancel delete]':'[Return to filters]'];
 return `### ${id}--${state}\n\`\`\`text\n+------------------------------------------------------------+\n${lines.map(line=>'| '+line+' |').join('\n')}\n+------------------------------------------------------------+\n\`\`\`\n`;
})).join('')}`;
const trace='US-01 · US-02 · US-03 · US-01.AC-01 · US-01.AC-02 · US-02.AC-01 · US-03.AC-01 · US-03.AC-02';
export const prototype=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Saved filters prototype</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font: 16px/1.5 system-ui, sans-serif; margin: 0; background: #f5f5f5; color: #222; }
main { max-width: 1040px; padding: 32px; margin: auto; }
h1 { font-size: 32px; line-height: 1.25; }
h2 { font-size: 24px; line-height: 1.25; }
h3 { font-size: 20px; line-height: 1.25; margin: 0; }
section { padding: 24px 0 40px; scroll-margin-top: 16px; }
.trace { margin: 8px 0 16px; max-width: 65ch; }
.screen { width: 100%; max-width: 720px; border: 1px solid #777; background: #fafafa; }
.screen-header { padding: 16px 24px; background: #e5e5e5; border-bottom: 1px solid #777; }
.screen-body { padding: 24px; }
.screen-body > label { display: block; font-weight: 600; margin-bottom: 8px; }
.screen-body > input { width: 100%; min-width: 0; height: 44px; border: 1px solid #777; padding: 8px 12px; font: inherit; color: #222; background: #fafafa; }
.screen-body > input:disabled { opacity: 1; background: #e5e5e5; color: #555; }
.actions, .state-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
a { display: inline-flex; align-items: center; min-height: 44px; padding: 8px 16px; color: #222; text-underline-offset: 4px; }
a.button { border: 1px solid #777; background: #e5e5e5; text-decoration: none; justify-content: center; }
a:focus-visible, input:focus-visible { outline: 2px solid #222; outline-offset: 2px; }
@media (hover: hover) { a:hover { background: #ddd; } }
a:active { background: #ddd; }
.rows { list-style: none; margin: 24px 0 0; padding: 0; }
.rows li { display: flex; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid #777; }
.state-message { margin: 16px 0; }
::selection { background: #ddd; color: #222; }
@media (max-width: 600px) { main { padding: 16px; } .screen-header, .screen-body { padding: 16px; } }
</style></head><body><main>
<section id="start"><h1>Saved filters prototype</h1><p>Explore saving, opening and deleting a saved filter.</p><nav class="actions" aria-label="Start a user story"><a class="button" href="#SCR-001--normal">US-01: save a filter</a><a class="button" href="#SCR-001--normal">US-02: open a filter</a><a class="button" href="#SCR-001--normal">US-03: delete a filter</a></nav></section>
${['SCR-001','SCR-002'].flatMap(id=>['normal','empty','error','loading'].map(state=>`<section id="${id}--${state}"><h2>${id}: ${state}</h2><p class="trace">${trace}</p>
<div class="screen" role="group" aria-labelledby="${id}--${state}-title"${state==='loading'?' aria-busy="true"':''}><header class="screen-header"><h3 id="${id}--${state}-title">${view(id,state).title}</h3></header><div class="screen-body">
<label for="${id}--${state}-name">Filter name</label><input id="${id}--${state}-name" type="text" inputmode="text" autocomplete="off" value="${view(id,state).name}" readonly${state==='loading'?' disabled':''}${state==='error'?` aria-invalid="true" aria-describedby="${id}--${state}-message"`:''}>
<p class="state-message" id="${id}--${state}-message"${state==='error'?' role="alert"':state==='loading'?' role="status"':''}>${view(id,state).message}</p>
${state==='normal'?`<ul class="rows" aria-label="Saved filters"><li><span>${view(id,state).row}</span><span>Saved</span></li></ul>`:''}
<nav class="actions" aria-label="${id} ${state} actions">${state==='normal'&&id==='SCR-001'?'<a class="button" href="#SCR-002--normal">Save filter</a><a class="button" href="#SCR-002--normal">Open filter</a><a class="button" href="#SCR-002--normal">Confirm delete</a><a class="button" href="#SCR-001--normal">Cancel delete</a>':`<a class="button" href="#${id}--normal">Return to filters</a>`}</nav>
</div></div><nav class="state-nav" aria-label="${id} ${state} preview states">${['normal','empty','error','loading'].filter(s=>s!==state).map(s=>`<a href="#${id}--${s}">View ${s} state</a>`).join('')}<a href="#start">Return to start</a></nav></section>`)).join('\n')}
</main></body></html>`;

import { esc, chip, absent, section, table, pageLink, stateChip, facts } from './html.mjs';
import { neutralizeHtml, sectionOf } from './embed.mjs';

/* Developer view: an index plus one panel per story with its flow, rules, selectors, screens/states, design-system refs, source
   gaps, dependencies, trace-linked rulings and inline OPEN. Hidden and merged stories stay in. */
const idList = (ids, make) => (ids.length ? ids.map(make).join(', ') : '—');
const plain = (t) => String(t).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
const BR = /\b(D\d+|A-\d+)\b/g;

export function buildDevIndex(ctx) {
  const { stories, uiRowsByUs, screensByUs, uiRows, screens, openAll } = ctx;
  const refs = new Set(uiRows.flatMap((r) => [...r.components, ...r.patterns]));
  const gaps = screens.rows.filter((r) => !(r.source.label === 'active' && r.source.tone === 'ok')).length;
  const rows = stories.map((s) => ({ id: `row-${s.id.toLowerCase()}`, cells: [
    pageLink(`dev-${s.page}`, `${s.id} · ${s.title}`), esc(s.area), s.hidden ? chip('hidden in readable view', 'warn') : esc(s.status || '—'),
    esc(String((screensByUs[s.id] || []).length)), esc(String((uiRowsByUs[s.id] || []).length)), s.open.length ? chip(`${s.open.length} open`, s.open.some((o) => o.blocking) ? 'bad' : 'warn') : '—',
    s.noUi ? chip('no UI', 'info') : (uiRowsByUs[s.id] || []).length ? '' : chip('no selectors', 'warn'),
  ] }));
  const summary = facts([['Stories', `${stories.length}`], ['Screen states', `${screens.rows.length}`], ['Behavioral selectors', `${uiRows.length}`], ['Design-system references', `${refs.size}`], ['States with a source gap', gaps ? `${gaps} ${pageLink('design-view', 'see list')}` : `0 ${chip('none', 'ok')}`], ['Open questions', `${openAll.length}`]]);
  return `${summary}<p>One panel per story: flow, rules, behavioral selectors, screens and states, design-system references and source gaps, with every open question kept inline.</p>${table(['Story', 'Epic', 'Status', 'Screen states', 'Selectors', 'Open', 'Note'], rows, { caption: 'Stories with a developer panel' })}`;
}

function rulings(ctx, s, rulesMd) {
  const wanted = [...new Set([...s.decisions, ...s.amendments, ...(rulesMd.match(BR) || [])])];
  const dec = new Map((ctx.decisions?.items || []).map((d) => [d.id, d]));
  const am = new Map((ctx.amendments?.items || []).map((a) => [a.id, a]));
  const rows = wanted.map((id) => {
    const d = dec.get(id), a = am.get(id);
    if (d) return [pageLink('decisions', id, id.toLowerCase()), esc(d.title), esc(plain(d.detail || ''))];
    if (a) return [pageLink('amendments', id, id.toLowerCase()), esc(a.title || a.summary || a.round), esc(a.rows.slice(0, 3).map((r) => `${r.id}: ${r.change}`).join(' · '))];
    return [esc(id), chip('not found in the ledger', 'bad'), ''];
  });
  const reqs = s.reqs.map((r) => ctx.chain?.reqs.find((x) => x.id === r)).map((r, i) => (r ? [pageLink('reference-chain', r.id, r.id.toLowerCase()), esc(r.title), esc(r.group || '')] : [esc(s.reqs[i]), chip('requirement not found', 'bad'), '']));
  return (reqs.length ? `<h3>Requirements</h3>${table(['Id', 'Requirement', 'Group'], reqs)}` : '') + (rows.length ? `<h3>Rulings and amendments referenced</h3>${table(['Id', 'Ruling', 'Text'], rows)}` : '');
}

export function buildDevPanel(ctx, s) {
  const page = ctx.pageById.get(s.page);
  const md = page?.md || '';
  const embed = (n) => neutralizeHtml(sectionOf(md, n)) || '';
  const rows = ctx.uiRowsByUs[s.id] || [];
  const states = ctx.screensByUs[s.id] || [];
  const out = [];
  out.push(facts([['Story page', pageLink(s.page, 'Open the build spec page')], ['Epic', esc(s.epic || '—')], ['Priority · wave', esc(`${s.priority || '—'} · ${s.wave || '—'}`)], ['Status', esc(s.status || '—')],
    ['Dependencies', idList(s.deps, (d) => (ctx.storyIds.has(d) ? pageLink(`dev-${d.toLowerCase()}`, d) : `${esc(d)} ${chip('missing', 'bad')}`))], ['Readable view', s.hidden ? chip(`hidden: ${s.hidden.reason}`, 'warn') : chip('shown', 'ok')]]));
  out.push(section('Story', '', embed(1) || absent('The story section is missing.')));
  out.push(section('Flow', '', embed(2) || absent('No flow section is written for this story.')));
  const rules = embed(3);
  out.push(section('Data and rules', '', (rules || absent('No data and rules section is written.')) + '\n\n' + rulings(ctx, s, rules)));
  out.push(section('Behavioral selectors', rows.length, rows.length
    ? table(['Screen · state', 'Element', 'Kind', 'Roles · scope', 'Components', 'Target', 'Scenarios'], rows.map((r) => [esc(`${r.screen}${r.state ? ` · ${r.state}` : ''}`), `<code>${esc(r.element)}</code>`, esc(r.kind), esc(`${r.roles.join(', ') || '—'} · ${r.scope.join(', ') || '—'}`), esc(r.components.join(', ') || '—'), esc(r.target || '—'), esc(r.scn.join(', ') || '—')]), { caption: `Selectors for ${s.id}` })
    : s.noUi ? absent(`This story declares no UI: ${s.noUi}`) : absent('No ui-contract rows list this story. This is disclosed debt, not a pass.')));
  out.push(section('Screens and states', states.length, states.length
    ? table(['Screen · state', 'Route', 'Source', 'Design system', 'Disclosure'], states.map((r) => [pageLink('design-view', r.key, r.key.toLowerCase().replace('/', '-')), esc(r.route), `${stateChip(r.source.label)} ${esc(r.source.reason)}`, esc([...r.components, ...r.patterns].join(', ') || '—'), r.source.label === 'active' && r.source.tone === 'ok' ? '' : chip('source needs attention', 'warn')]), { caption: `Screens for ${s.id}` })
    : absent(s.noUi ? 'No UI, so no screens.' : 'No inventory row lists this story.')));
  out.push(section('Open questions', s.open.length, s.open.length
    ? table(['Question', 'Where', 'Owner', 'Affects'], s.open.map((o) => [esc(o.text) + (o.blocking ? ` ${chip('blocking', 'bad')}` : ''), esc(`${o.rel}:${o.line}`), esc(o.owner || '—'), esc(o.affects.join(', ') || '—')]))
    : absent('No OPEN marker in this story.')));
  const led = ctx.ledgerByTarget.get(s.id) || [];
  if (led.length) out.push(section('Source items mapped here', led.length, table(['Source item', 'Status', 'Mapped to', 'Reason'], led.map((l) => [pageLink('source-ledger', l.item.id, `src-${l.item.id.toLowerCase()}`), stateChip(l.item.status), esc(l.target), esc(l.item.reason || '—')]))));
  return out.join('\n');
}

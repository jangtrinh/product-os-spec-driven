/* Generated pages: built in the browser from content.json, so the content stays project data and every behaviour lives in the shell.
   Pages that need data the spec does not carry are skipped; the indexer lists the skipped ones in content.json (data.skipped). */
const gpEsc = (s) => String(s).replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
const gpStatus = (s) => String(s || '').split(/[:;(]/)[0].trim().replace(/^Draft for .*/, 'Draft').replace(/^Current to .*/, 'Current').replace(/^./, (c) => c.toUpperCase());
const gpShort = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const gpCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const gpChip = (text, tone) => `<span class="chip${tone ? ` tone-${tone}` : ''}">${text}</span>`;
const gpTone = (s) => (/done|locked|written|current|reviewed|built/i.test(s || '') ? 'ok' : /draft|progress|per wave|planned|review/i.test(s || '') ? 'warn' : '');
const gpFence = (src) => `\`\`\`mermaid\n${src}\n\`\`\``;
const VIEW_BLURB = {
  'po-view': 'Release, epics, design preview, approvals and open questions.',
  'dev-view': 'One panel per story: flow, rules, selectors, screens, design-system references.',
  'qa-view': 'Each acceptance criterion with its scenarios, screen states, methods and evidence.',
  'open-items': 'Every unanswered question, blocking ones first.',
  'coverage': 'Passed, reviewed and covered acceptance criteria per area, with denominators.',
  'design-view': 'Every screen and state with its design source, preview and evidence.',
  'evidence-view': 'Evidence receipts and their freshness.',
  'source-ledger': 'Preserved source items and how each maps to typed spec items.',
};
const GP_ORDER = ['start', 'changes-to-read', 'reference-chain', 'amendments', 'decisions', 'dossier'];

function gpPage(data, id, title, label, md, extra) {
  return {
    id, title, label, md, rel: `generated/${id}`, artifact: 0, tier: 'index', group: '', generated: true, sort: `0-${GP_ORDER.indexOf(id)}`,
    owner: '', updated: data.date, status: 'Generated', trace: { a: [], d: [], req: [], us: [] }, ...(extra || {}),
  };
}

function gpStart(data) {
  const chain = data.chain;
  const tiers = data.tiers.filter((t) => t.id !== 'index' && t.count > 0);
  const rows = tiers.map((t) => `| <span class="nw">${t.name} ${gpChip(t.count)}</span> | ${t.audience || ''} | ${t.status ? gpChip(t.status, gpTone(t.status)) : ''} | ${t.purpose || ''} | <span class="nw">[Open ${t.name}](#${t.first})</span> |`);
  const arts = data.artifacts.filter((a) => a.n > 0);
  const nodes = []; const links = []; const classes = { ok: [], warn: [], planned: [] };
  arts.forEach((a) => {
    nodes.push(`A${a.n}["${a.n} · ${gpEsc(a.name)}<br/>${a.exported ? `${a.files} ${a.files === 1 ? 'file' : 'files'}` : 'not exported'}<br/>${gpEsc(gpStatus(a.status))}"]`);
    classes[!a.exported ? 'planned' : gpTone(a.status) === 'ok' ? 'ok' : 'warn'].push(`A${a.n}`);
    if (a.first) links.push(`click A${a.n} href "#${a.first}"`);
  });
  const ids = arts.map((a) => `A${a.n}`);
  const rowsOf = []; for (let i = 0; i < ids.length; i += 4) rowsOf.push(ids.slice(i, i + 4));
  const flow = [
    '%%{init: {"flowchart": {"rankSpacing": 24, "nodeSpacing": 24, "useMaxWidth": true}}}%%', 'flowchart TB',
    ...rowsOf.flatMap((r, i) => [`subgraph R${i + 1}[" "]`, 'direction LR', r.join(' --> '), 'end']),
    ...rowsOf.slice(1).map((_, i) => `R${i + 1} ~~~ R${i + 2}`), ...nodes, ...links,
    'classDef ok stroke:#1F8A5B,stroke-width:2px', 'classDef warn stroke:#9A6200,stroke-width:2px', 'classDef planned stroke:#8A8D95,stroke-dasharray:4 3',
    ...Object.entries(classes).filter(([, v]) => v.length).map(([k, v]) => `class ${v.join(',')} ${k}`),
    ...rowsOf.map((_, i) => `style R${i + 1} fill:none,stroke:none`),
  ].join('\n');
  const artRows = arts.map((a) => `| ${a.n} | ${a.name} | ${gpChip(a.exported ? a.files : 0)} | ${a.status ? gpChip(a.status, gpTone(a.status)) : ''} | ${a.first ? `[Open ${a.name}](#${a.first})` : 'Not in this spec'} |`);
  const md = [];
  if (data.changes) md.push(`<p class="changes-entry"><a href="#changes-to-read">${escapeHtml(changeLabels(data).title)}</a> ${gpChip(data.changes.items.length)}</p>`, '');
  if (data.readable && data.orderReadable && data.orderReadable.length) md.push(`Looking for the plain-language version? [Open the Readable view](#${data.orderReadable[0]}). This page opens the Build spec, the layer written for builders and testers.`, '');
  md.push(`Read the ${data.title} as one connected set: ${gpChip(data.counts.sourcePages)} pages across ${arts.length} artifacts. Pick the tier that matches your role${data.readingOrder.length ? ', follow the reading order' : ''}, or open the [full dossier](#dossier) to scan everything on one page.`);
  const viewIds = ['po-view', 'dev-view', 'qa-view', 'open-items', 'coverage', 'design-view', 'evidence-view', 'source-ledger'];
  const viewPages = viewIds.map((id) => data.pages.find((p) => p.id === id)).filter(Boolean);
  if (viewPages.length) md.push('', '## Role views', '', 'Generated from the same spec files for each role. They hold no authority of their own.', '', '| View | What it answers |', '|---|---|', ...viewPages.map((p) => `| [${p.title}](#${p.id}) | ${VIEW_BLURB[p.id] || ''} |`));
  if (rows.length) md.push('', '## Read by audience', '', '| Tier | Audience | Status | Purpose | Open |', '|---|---|---|---|---|', ...rows);
  md.push('', '## Artifact flow', '', 'Each artifact feeds the next one. Click a node to open its first page.', '', gpFence(flow), '', '| # | Artifact | Files | Status | Open |', '|---|---|---|---|---|', ...artRows);
  if (chain) {
    const t = chain.totals;
    const trace = ['%%{init: {"flowchart": {"rankSpacing": 24, "useMaxWidth": true}}}%%', 'flowchart LR',
      `REQ["${t.reqs} requirements${chain.prdTitle ? `<br/>${gpEsc(chain.prdTitle)}` : ''}"] --> US["${t.stories} user stories<br/>${t.storiesWithReq} cite a REQ"]`,
      `US --> AC["${t.acs} acceptance criteria"] --> SCR["${t.screens} screens"] --> EV["${t.boards} boards · ${t.scenarios} scenarios"]`];
    if (chain.prdPage) trace.push(`click REQ href "#${chain.prdPage}"`);
    if (chain.usIndexPage) trace.push(`click US href "#${chain.usIndexPage}"`);
    if (chain.inventoryPage) trace.push(`click SCR href "#${chain.inventoryPage}"`);
    if (chain.boardsPage) trace.push(`click EV href "#${chain.boardsPage}"`);
    md.push('', '## How requirements trace to evidence', '', 'Every requirement should end in a screen and a scenario that proves it. The counts below come from the PRD and the story files. [Open the reference chain map](#reference-chain) to pick a requirement or a story.', '', gpFence(trace.join('\n')));
  }
  if (data.readingOrder.length) {
    md.push('', '## Reading order', '', ...data.readingOrder.map((r, i) => `${i + 1}. ${r.links.map((l) => `[${l.label}](#${l.id})`).join(', then ')}${r.note ? `: ${r.note}` : ''}`));
  }
  md.push('');
  return gpPage(data, 'start', data.title, 'Spec overview', md.join('\n'));
}

function gpChain(data) {
  const t = data.chain.totals;
  const md = ['Pick a requirement to see the stories and acceptance criteria that cover it, or pick a story to see the requirements it serves. Ids come from the PRD requirement table and the story files.',
    '', '<div data-widget="reference-chain"></div>', '', '## Coverage', '',
    `- ${gpChip(t.reqsNoStory)} requirements are cited by no story file.`, `- ${gpChip(t.storiesNoReq)} story files cite no requirement.`];
  if (t.agree !== null && t.agree !== undefined) md.push(`- The PRD table and the story files name the same stories for ${gpChip(t.agree)} of ${gpChip(t.reqs)} requirements.`);
  md.push('');
  return gpPage(data, 'reference-chain', 'Reference chain map', 'Reference chain map', md.join('\n'));
}

function gpAmendments(data) {
  const am = data.amendments;
  const key = (a) => a.id.replace('-', '');
  const first = am.changes[0];
  const nodes = [`V0["${first ? `v${first.version}` : 'Locked'}<br/>Locked${first && first.date ? ` · ${first.date}` : ''}"]`];
  const edges = []; let prev = 'V0';
  am.items.forEach((a, i) => {
    nodes.push(`${key(a)}["${a.id}<br/>${gpEsc(a.round)} · ${a.decision}<br/>${a.rows.length} changes"]`, `V${i + 1}["${a.version ? `v${a.version}` : 'next'}<br/>${a.date}"]`);
    edges.push(`${prev} --> ${key(a)} --> V${i + 1}`);
    prev = `V${i + 1}`;
  });
  const flow = ['%%{init: {"flowchart": {"rankSpacing": 22, "nodeSpacing": 20, "useMaxWidth": true}}}%%', 'flowchart LR', ...nodes, ...edges,
    ...am.items.map((a) => `click ${key(a)} href "#amendments.${a.id.toLowerCase()}"`), 'classDef amend stroke:#4C5FD5,stroke-width:2px', `class ${am.items.map(key).join(',')} amend`].join('\n');
  const rows = am.items.map((a) => `| ${a.id} | ${a.version ? `v${a.version}` : ''} | ${a.date} | ${gpCell(a.round)} | ${a.decision} | ${gpChip(a.rows.length)} | ${gpCell(a.summary || a.title)} |`);
  const detail = am.items.map((a) => [`### ${a.id} · ${a.round} · ${a.decision}`, '',
    ...a.rows.slice(0, 5).map((r) => `- **${r.id}** ${gpShort(r.change, 190)}`), `- [Read all ${a.rows.length} rows in ${am.label}](#${am.fcId}.${a.headingId})`, ''].join('\n'));
  const md = [`${am.label} was locked at ${first ? `v${first.version}` : 'its first version'} and then amended ${am.items.length} ${am.items.length === 1 ? 'time' : 'times'} in place. Each amendment adds rows to the body and to the change log. Source: [${am.label}](#${am.fcId}).`,
    '', gpFence(flow), '', '## Amendments', '', '| Amendment | Version | Date | Source | Decision | Changes | What changed |', '|---|---|---|---|---|---|---|', ...rows,
    '', '## Largest changes per amendment', '', ...detail];
  if (am.changes.length) md.push('## Change log', '', '| Version | Date | Why | Approved by |', '|---|---|---|---|', ...am.changes.map((c) => `| ${c.version} | ${c.date} | ${gpCell(gpShort(c.why, 150))} | ${gpCell(gpShort(c.approved, 90))} |`), '');
  return gpPage(data, 'amendments', 'Amendment timeline', 'Amendment timeline', md.join('\n'));
}

function gpDecisions(data) {
  const dec = data.decisions;
  const byId = Object.fromEntries(dec.items.map((d) => [d.id, d]));
  const topics = dec.topics.map((t) => ({ ...t, items: t.ids.map((i) => byId[i]).filter(Boolean) })).filter((t) => t.items.length);
  const range = `${dec.items[0].id} to ${dec.items[dec.items.length - 1].id}`;
  const flow = ['%%{init: {"flowchart": {"rankSpacing": 36, "nodeSpacing": 10, "useMaxWidth": true}}}%%', 'flowchart LR', `ROOT(["${range}"])`];
  topics.forEach((t) => {
    flow.push(`ROOT --> ${t.id}(["${gpEsc(t.name)} · ${t.items.length}"])`);
    t.items.forEach((d) => flow.push(`${t.id} --> ${d.id}["${d.id} · ${gpEsc(gpShort(d.title, 34))}"]`));
  });
  topics.forEach((t) => t.items.forEach((d) => flow.push(`click ${d.id} href "#decisions.${d.id.toLowerCase()}"`)));
  flow.push('classDef topic stroke-width:2px', `class ${topics.map((t) => t.id).join(',')} topic`);
  const sections = topics.map((t) => [`## ${t.name} ${gpChip(t.items.length)}`, '', t.note ? `${t.note}.` : '', '', '| Id | Decision | Mentioned in | Source |', '|---|---|---|---|',
    ...t.items.map((d) => {
      const m = d.mentions;
      const firstFour = m.slice(0, 4).map((x) => `[${x.label}](#${x.id})`).join(' · ');
      const more = m.length > 4 ? ` <details class="more"><summary>${m.length - 4} more pages</summary>${m.slice(4).map((x) => `<a href="#${x.id}">${x.label}</a>`).join(' · ')}</details>` : '';
      const refinement = Array.from((d.detail || '').matchAll(/\b(?:Refined|Superseded) by [^.]+\./g), m => m[0]).join(' ');
      return `| ${d.id} | ${gpCell(d.title)}${refinement ? '<br>' + escapeHtml(refinement) : ''} | ${m.length ? `${gpChip(m.length)} ${firstFour}${more}` : 'No other page'} | <span class="nw">[Open source row](#${dec.pageId}.${d.id.toLowerCase()})</span> |`;
    }), ''].join('\n'));
  const md = [`The decisions ${range}, grouped by topic. Each id links to its row here and to the page that holds the full ruling; the pages that mention it come from a search of the spec. Source: [decision ledger](#${dec.pageId}).`,
    '', gpFence(flow.join('\n')), '', ...sections];
  return gpPage(data, 'decisions', 'Decision map', 'Decision map', md.join('\n'));
}

function buildGeneratedPages(data) {
  const out = [gpStart(data)];
  if (data.changes) out.push(gpChanges(data));
  if (data.chain) out.push(gpChain(data));
  if (data.amendments) out.push(gpAmendments(data));
  if (data.decisions) out.push(gpDecisions(data));
  out.push(gpPage(data, 'dossier', 'Full dossier', 'Full dossier', '', { kind: 'dossier' }));
  return out;
}

function showLintBanner(lint) {
  const el = $('#lint-banner');
  if (!lint || !lint.errors) { el.hidden = true; return; }
  const items = lint.problems.slice(0, 12).map((p) => `<li>${escapeHtml(p)}</li>`).join('');
  const more = lint.errors > 12 ? `<li>${lint.errors - 12} more problems. Run spec-lint to see them all.</li>` : '';
  el.innerHTML = `<details><summary>Rendered with ${lint.errors} lint problem(s) (--force). Do not treat this as a checkpoint.</summary><ul>${items}${more}</ul></details>`;
  el.hidden = false;
}

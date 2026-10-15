/* The whole reviewer-visible packet, built from the embedded canonical data and the pinned source bytes only. Runs unchanged in the
   generator (to write the static markup), in the page (to rebuild what is shown at open time) and in the verifier (to compare). It reads
   no clock, no network and no markup. Needs ac-row-core.js (concatenated before it). */
var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
var chip = function (t, tone) { return '<span class="chip' + (tone ? ' tone-' + tone : '') + '">' + esc(t) + '</span>'; };
var TONE = { CURRENT: 'ok', PASS: 'ok', verified: 'ok', direct: 'bad', transitive: 'warn', unknown: 'bad', STALE: 'bad', MISSING: 'bad', FAIL: 'bad', blocked: 'bad', 'not-run': 'warn', NOT_RUN: 'warn' };
var stateChip = function (w) { return chip(w, TONE[w] || 'info'); };
var tableHtml = function (head, rows, cap, wide) {
  return '<div class="table-wrap" role="region" aria-label="' + esc(cap) + '" tabindex="0"><table class="stack' + (wide ? ' wide' : '') + '"><caption class="sr-only">' + esc(cap) + '</caption><thead><tr>' +
    head.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td data-label="' + esc(head[i]) + '">' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
};
var SEG = [['', 'Use default'], ['approve', 'Approve'], ['changes-requested', 'Request changes'], ['defer', 'Defer']];
var absent = function (t) { return '<p class="absent">' + esc(t) + '</p>'; };
var section = function (id, title, count, body) { return '<section id="' + id + '" aria-labelledby="' + id + '-h"><h2 id="' + id + '-h">' + esc(title) + (count === undefined ? '' : '<span class="count"> (' + esc(count) + ')</span>') + '</h2>' + body + '</section>'; };
var keysOf = function (texts) { return Object.keys(texts).sort(); };

/* The source that holds story `us` (found by its front-matter id), the first inventory and every ui-contract row, all from pinned bytes. */
function storyKeyOf(texts, us) { return keysOf(texts).filter(function (k) { return storyIdOf(texts[k]) === us; })[0] || null; }
function inventoryKeyOf(texts) { return keysOf(texts).filter(function (k) { return screensFor(texts[k], []) !== null; })[0] || null; }
function contractRowsOf(texts) { return keysOf(texts).reduce(function (all, k) { return all.concat(contractRowsFor(texts[k])); }, []); }
function rulingsOf(texts, id) { return keysOf(texts).map(function (k) { return decisionRuling(texts[k], id); }).filter(function (r) { return r !== null; }); }
function acRowOf(texts, id) { var us = id.split('.')[0], k = storyKeyOf(texts, us); return k ? acRowCells(texts[k], id.split('.').slice(1).join('.')) : null; }

/* Everything the page shows that is not read back from pinned bytes or the digest-checked data is a defect to name here. */
function viewProblems(p, texts) {
  var out = [], ids = p.scope.ids;
  ids.forEach(function (id) { if (!acRowOf(texts, id)) out.push(id + ': no acceptance row in a pinned story source'); });
  p.decisions.forEach(function (d) { var r = rulingsOf(texts, d.id); if (r.length !== 1 || r[0] !== d.text) out.push(d.id + ': the data ruling is not the single ruling in the pinned sources'); });
  var inv = inventoryKeyOf(texts);
  if (inv) { if (canon(p.screens) !== canon(screensFor(texts[inv], ids))) out.push('screens differ from the pinned inventory ' + inv); }
  else if (p.screens.length) out.push('screens are shown but no pinned inventory holds them');
  var contract = contractRowsOf(texts);
  p.screens.forEach(function (r) {
    var rows = contract.filter(function (c) { return c.screen === r.screen && c.state === r.state; });
    if (!rows.length) out.push(r.screen + '/' + r.state + ': no pinned ui-contract row');
    else if (rows.some(function (c) { return c.route !== r.route; })) out.push(r.screen + '/' + r.state + ': the ui-contract route differs from the inventory route');
  });
  return out;
}

function renderView(p, texts, hints) {
  var d = p, ids = d.scope.ids, byUs = {}, order = [];
  ids.forEach(function (id) { var us = id.split('.')[0]; if (!byUs[us]) { byUs[us] = []; order.push(us); } byUs[us].push(id); });
  var storyTitle = function (us) { var k = storyKeyOf(texts, us); return (k && storyTitleOf(texts[k])) || us; };
  var imp = function (c) { return d.change.impact.filter(function (i) { return i.classification === c; }).length; };
  var evBad = d.evidence.filter(function (r) { return r.freshness !== 'CURRENT' || (r.execution && r.execution.exit !== 0); }).length;
  var blockingOpen = d.open.filter(function (o) { return o.blocking; }).length;
  var unresolved = d.findings.filter(function (f) { return f.disposition === 'open'; }).length;
  var notVerified = d.change.propagation.filter(function (x) { return x.status !== 'verified'; }).length;
  var changeState = (hints && hints.changeState) || 'unknown';
  var blockers = [
    !d.change.closure.complete && 'Impact closure is incomplete. Fallback: reopen from ' + d.change.closure.fallback + ' and every later gate. No smaller batch is guessed.',
    blockingOpen && blockingOpen + ' blocking open question(s).', unresolved && unresolved + ' unresolved finding(s).', evBad && evBad + ' receipt(s) are not current or did not pass.',
    notVerified && notVerified + ' propagation row(s) are not verified.', changeState !== 'Reviewed' && 'The change set state is ' + changeState + ', not Reviewed.',
  ].filter(Boolean);
  var packetId = 'packet-' + (hints && hints.dataSha || '');
  var out = [];
  out.push('<section class="plain" aria-labelledby="top-h"><h1 id="top-h">Batch review packet · ' + esc(d.change.id) + '</h1><p class="muted">' + esc(d.change.reason) + '</p>' +
    '<dl class="stats"><div><dt>Acceptance criteria requested</dt><dd>' + ids.length + '</dd></div><div><dt>Impact: direct / transitive / unknown</dt><dd>' + imp('direct') + ' / ' + imp('transitive') + ' / ' + imp('unknown') + '</dd></div>' +
    '<div><dt>Impact closure</dt><dd>' + (d.change.closure.complete ? 'complete' : 'incomplete') + '</dd></div><div><dt>Receipts current and passed</dt><dd>' + (d.evidence.length - evBad) + ' of ' + d.evidence.length + '</dd></div><div><dt>Blocking open questions</dt><dd>' + blockingOpen + '</dd></div></dl>' +
    '<p class="muted">Packet id <code>' + esc(packetId) + '</code>. Change set state ' + stateChip(changeState) + ' ' + chip('not verified here', 'warn') + '. This page is not an approval. It exports a decision file that the controller imports with the runner after checking the data digest, pins, scope, authority and current evidence.</p></section>');
  out.push(section('blockers', 'What can stop approval', blockers.length, blockers.length ? '<div class="callout' + (d.change.closure.complete ? '' : ' bad') + '" role="note"><ul>' + blockers.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div><p class="muted">The importer re-checks all of this. A decision here cannot waive a failed mandatory check.</p>' : absent('Nothing visible blocks approval. The importer still verifies pins, scope, authority and current evidence.')));
  var seg = function (name, v) { return '<div class="seg" role="radiogroup" aria-label="Decision for ' + esc(name) + '">' + SEG.map(function (o) { return '<label class="seg-opt"><input type="radio" name="ov-' + esc(name) + '" value="' + o[0] + '" data-override="' + esc(name) + '"' + (o[0] === '' ? ' checked' : '') + '>' + o[1] + '</label>'; }).join('') + '</div>'; };
  var dec = '<form id="decision-form" aria-busy="true" onsubmit="return false"><fieldset><legend>Decision for the whole batch</legend><div class="choices" role="radiogroup" aria-label="Batch decision">' +
    '<label class="choice"><input type="radio" name="default" value="approve">Approve</label><label class="choice"><input type="radio" name="default" value="changes-requested">Request changes</label><label class="choice"><input type="radio" name="default" value="defer">Defer</label></div></fieldset>' +
    '<div class="field"><label for="reason">Reason (required)</label><textarea id="reason" autocomplete="off"></textarea></div><div class="field"><label for="by">Your email as PO</label><input id="by" type="email" autocomplete="email" inputmode="email"></div>' +
    '<fieldset><legend>Override one story</legend>' + tableHtml(['Story', 'Criteria', 'Decision', 'Reason'], order.map(function (us) { return ['<strong>' + esc(us) + '</strong> ' + esc(storyTitle(us)), byUs[us].length, seg(us), '<input type="text" aria-label="Reason for ' + esc(us) + '" data-override-reason="' + esc(us) + '">']; }), 'Per-story overrides') + '</fieldset>' +
    '<details class="override"><summary>Override single acceptance criteria (' + ids.length + ', expand to choose)</summary>' + tableHtml(['Criterion', 'Decision', 'Reason'], ids.map(function (id) { return ['<code>' + esc(id) + '</code>', seg(id), '<input type="text" aria-label="Reason for ' + esc(id) + '" data-override-reason="' + esc(id) + '">']; }), 'Per-criterion overrides') + '</details>' +
    (d.exceptions.length ? '<fieldset><legend>Approved exceptions to cite</legend>' + d.exceptions.map(function (e) { return '<label class="choice"><input type="checkbox" name="exception" value="' + esc(e.id) + '">' + esc(e.id) + ' · ' + esc(e.kind) + ' · ' + esc(e.status) + '</label>'; }).join('') + '</fieldset>' : '') +
    '<button id="export" class="btn primary" type="button" disabled>Export decision file</button><p id="export-status" role="status" tabindex="-1">Decision export is disabled while packet verification is pending.</p><div id="preview-box" hidden><h3>Decision file preview</h3><pre id="decision-preview"></pre></div></form>' +
    '<p id="digest-check" class="muted" role="status">Checking the embedded data digest.</p><p id="binding-check" class="muted" role="status">Checking the wording on this page against the pinned sources.</p>';
  out.push(section('decision', 'Decision', undefined, dec));
  out.push(section('rules', 'Before and after', d.change.rules.length, d.change.rules.map(function (r) { return '<h3><code>' + esc(r.source) + '</code></h3><div class="ba"><div class="before"><h4>Before</h4><p>' + esc(r.before) + '</p></div><div class="after"><h4>After</h4><p>' + esc(r.after) + '</p></div></div>'; }).join('')));
  out.push(section('impact', 'Impact and closure', d.change.impact.length, tableHtml(['Node', 'Domain', 'Class', 'Reason', 'Path from the change'], d.change.impact.map(function (i) { return ['<code>' + esc(i.node) + '</code>', esc(i.domain), stateChip(i.classification), esc(i.reason), esc(i.path.join(' → '))]; }), 'Impact rows') +
    '<p>' + (d.change.closure.complete ? 'Closure is complete. ' + d.unaffected.length + ' criteria outside the batch stay out, each with independence from the dependency graph.' : 'Closure is incomplete; the fallback reopens from ' + esc(d.change.closure.fallback) + '.') + '</p>' + (d.unaffected.length ? '<details><summary>Criteria left out of the batch (' + d.unaffected.length + ')</summary><p class="mono">' + d.unaffected.map(esc).join(', ') + '</p></details>' : '')));
  out.push(section('propagation', 'Propagation', d.change.propagation.length, tableHtml(['Behavior', 'Criteria', 'Scenarios', 'Screens', 'Evidence', 'Status', 'Review'], d.change.propagation.map(function (x) { return [esc(x.behavior), esc(x.ac.join(', ')), esc(x.scenario.join(', ')), esc(x.ui.join(', ') || '—'), esc(x.evidence.join(', ') || 'none'), stateChip(x.status), esc(x.review)]; }), 'Propagation rows')));
  out.push(section('scope', 'Requested scope', ids.length, order.map(function (us) {
    var first = acRowOf(texts, byUs[us][0]), head = first ? first.header.slice(1) : [];
    return '<h3>' + esc(us) + ' ' + esc(storyTitle(us)) + '</h3>' + tableHtml(['Criterion'].concat(head, ['Reason for review', 'Member revision']), byUs[us].map(function (id) {
      var row = acRowOf(texts, id), m = d.membership.members.filter(function (x) { return x.kind === 'ac' && x.id === id; })[0], req = d.requests.filter(function (r) { return r.id === id; })[0];
      return ['<code>' + esc(id) + '</code>'].concat(head.map(function (_, i) { return esc(row ? row.cells[i + 1] : ''); }), [esc(req ? req.reason : ''), '<code>' + esc(m ? m.revision.slice(0, 12) : 'missing') + '</code>']);
    }), 'Scope of ' + us, true);
  }).join('')));
  var contract = contractRowsOf(texts);
  var shots = d.screens.map(function (r) {
    var rows = contract.filter(function (c) { return c.screen === r.screen && c.state === r.state; });
    var pv = hints && hints.previews && hints.previews[r.screen + '/' + r.state], uri = pv && d.assets[pv.asset] ? pv.asset : '';
    return ['<strong>' + esc(r.screen) + '</strong> · ' + esc(r.state), '<code>' + esc(r.route) + '</code>', esc(r.roles.join(', ') + ' · ' + r.scope.join(', ')), stateChip(r.source.kind) + ' ' + esc(r.source.reason || r.source.ref || ''),
      rows.length ? esc(rows.slice(0, 3).map(function (c) { return c.kind + ' · ' + c.element; }).join('; ') + (rows.length > 3 ? '; +' + (rows.length - 3) + ' more' : '')) : chip('no ui-contract row', 'bad'),
      (uri ? '<img class="thumb" width="224" height="140" data-asset="' + esc(uri) + '" alt="' + esc('Preview of ' + r.screen + ' ' + r.state) + '">' + (pv.built ? '' : chip('wireframe, not built', 'warn')) : chip('no image', 'warn')) + ' ' + chip('not verified', 'warn')];
  });
  out.push(section('screens', 'Screens and states', d.screens.length, shots.length ? tableHtml(['Screen · state', 'Route', 'Roles · scope', 'Design source', 'UI contract (pinned)', 'Preview (not verified)'], shots, 'Screens and states', true) +
    '<p class="muted">Route, roles, scope, design source and UI contract are read from the pinned inventory and ui-contract. A preview image is shown for orientation only: which image belongs to which screen is not pinned, so it is not part of what Approve binds.</p>' : absent('No screen state is joined to this scope. A no-UI story states its reason in the spec.')));
  out.push(section('evidence', 'Evidence', d.evidence.length, d.evidence.length ? tableHtml(['Receipt', 'Domain', 'Freshness', 'Result', 'Review', 'Covers'], d.evidence.map(function (r) { return ['<code>' + esc(r.id) + '</code>', esc(r.domain), stateChip(r.freshness), r.execution.exit === null ? chip('not executed', 'warn') : stateChip(r.execution.result), esc(r.review.verdict + ' · ' + (r.review.independent ? 'independent' : 'not independent')), esc(r.coverage.ac.length + ' AC')]; }), 'Evidence receipts') : absent('No receipt covers this scope. Missing evidence is shown, never filled in.')));
  out.push(section('findings', 'Findings and open questions', d.findings.length + d.open.length, (d.findings.length ? tableHtml(['Finding', 'Severity', 'Disposition', 'Impact'], d.findings.map(function (f) { return ['<code>' + esc(f.id) + '</code> ' + esc(f.criterion), esc(f.severity), esc(f.disposition), esc(f.impact)]; }), 'Findings') : absent('No finding is recorded.')) +
    (d.open.length ? tableHtml(['Open question', 'Blocking'], d.open.map(function (o) { return [esc(o.text), o.blocking ? chip('blocking', 'bad') : chip('open', 'warn')]; }), 'Open questions') : absent('No open question is recorded for these stories.'))));
  out.push(section('records', 'Decisions, assumptions, exceptions and checks', undefined, '<h3>Decisions that apply</h3>' + (d.decisions.length ? tableHtml(['Id', 'Ruling'], d.decisions.map(function (x) { return [esc(x.id), esc(x.text)]; }), 'Decisions') : absent('No ruling is linked.')) +
    '<h3>Assumptions</h3>' + (d.assumptions.length ? tableHtml(['Id', 'Assumption', 'Confidence', 'Would change if'], d.assumptions.map(function (x) { return [esc(x.id), esc(x.text), esc(x.confidence), esc(x.what_would_flip)]; }), 'Assumptions') : absent('No assumption is recorded; none was substituted for a missing answer.')) +
    '<h3>Exceptions</h3>' + (d.exceptions.length ? tableHtml(['Id', 'Kind', 'Status', 'Reason'], d.exceptions.map(function (x) { return [esc(x.id), esc(x.kind), esc(x.status), esc(x.reason)]; }), 'Exceptions') : absent('No exception applies.')) +
    '<h3>Aggregate checks rerun</h3>' + (d.aggregate_checks.length ? '<p class="mono">' + d.aggregate_checks.map(esc).join(', ') + '</p>' : absent('No aggregate check is recorded.'))));
  out.push(section('pins', 'Pins', undefined, tableHtml(['', 'Head', 'Base', 'Manifest', 'Build'], [['Baseline'].concat(['head', 'base', 'manifest', 'build'].map(function (k) { return '<code class="wrapall">' + esc(d.baseline[k]) + '</code>'; })), ['Candidate'].concat(['head', 'base', 'manifest', 'build'].map(function (k) { return '<code class="wrapall">' + esc(d.candidate[k]) + '</code>'; }))], 'Baseline and candidate pins')));
  var nav = [['blockers', 'Blockers'], ['decision', 'Decision'], ['rules', 'Before and after'], ['impact', 'Impact'], ['propagation', 'Propagation'], ['scope', 'Scope'], ['screens', 'Screens'], ['evidence', 'Evidence'], ['findings', 'Findings'], ['records', 'Records'], ['pins', 'Pins']];
  return '<a class="skip" href="#main">Skip to the packet</a>\n<header class="bar"><strong>PRODUCT:OS Spec Driven</strong><span class="muted grow">Batch review packet · ' + esc(d.change.id) + '</span><button id="theme-toggle" class="btn icon" type="button" aria-pressed="false" aria-label="Switch theme"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg></button></header>\n' +
    '<div class="wrap">\n<nav class="toc" aria-label="Packet sections"><ol>' + nav.map(function (n) { return '<li><a href="#' + n[0] + '">' + esc(n[1]) + '</a></li>'; }).join('') + '</ol></nav>\n<main id="main">\n' + out.join('\n') + '\n</main>\n</div>';
}

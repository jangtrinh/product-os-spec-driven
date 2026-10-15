/* Screen/state inventory joined to design source, boards, coded previews, evidence and behavioral rows. Every missing, retired,
   unverified or not-created relation is kept as an explicit state so the views can disclose it. */
const STATE_ORDER = ['normal', 'empty', 'loading', 'error', 'disabled', 'focus', 'long-content', 'no-permission'];

export function resolveSource(source, sourceEntries, boardIds, deny) {
  const src = source || {};
  if (src.kind === 'not-created') return { kind: 'not-created', label: 'not-created', tone: 'warn', reason: src.reason || 'No reason recorded', link: '', snapshot: '' };
  if (src.kind === 'html-board') {
    const ok = boardIds.has(src.ref);
    return { kind: 'html-board', label: ok ? 'html-board' : 'missing', tone: ok ? 'info' : 'bad', reason: ok ? `Authored board ${src.ref}` : `Board ${src.ref} is not in this spec`, link: ok ? `board:${src.ref}` : '', snapshot: '' };
  }
  const entry = (sourceEntries || []).find((e) => e.id === src.ref);
  if (!entry) return { kind: src.kind || 'unknown', label: 'missing', tone: 'bad', reason: `No entry "${src.ref}" in the generated source map`, link: '', snapshot: '' };
  const snap = entry.snapshot || '';
  const denied = snap && (deny || []).some((d) => snap === d || snap.endsWith(`/${d}`));
  const live = entry.status === 'active' && entry.freshness === 'CURRENT';
  return {
    kind: src.kind, label: entry.status, tone: entry.status === 'active' ? (entry.freshness === 'CURRENT' ? 'ok' : 'warn') : entry.status === 'retired' ? 'bad' : 'warn',
    reason: `${entry.tool || 'tool'} · revision ${entry.revision || 'n/a'} · ${entry.freshness || 'MISSING'}${entry.status === 'retired' ? ' · retired, not fresh acceptance' : ''}`,
    link: live && entry.locator?.url ? entry.locator.url : '', snapshot: denied ? '' : snap, snapshotDenied: !!denied && snap, freshness: entry.freshness || 'MISSING',
  };
}

export function buildScreens({ design, stories, uiRows, evidence, chain, deny, imageRoles }) {
  const boardIds = new Set((chain?.boards || []).map((b) => b.id));
  const entries = design.sources?.entries || [];
  const codedByUs = new Map(stories.map((s) => [s.id, Object.entries(imageRoles[s.page] || {}).filter(([, role]) => role === 'coded').map(([src]) => src)]));
  const rows = (design.inventory || []).map((row) => {
    const source = resolveSource(row.source, entries, boardIds, deny);
    const rowEvidence = (row.evidence || []).map((id) => ({ id, receipt: evidence.byId.get(id) || null }));
    const boards = [...new Set([...(row.boards || []), ...row.us.flatMap((u) => stories.find((s) => s.id === u)?.boards || [])])].filter(Boolean);
    return {
      key: `${row.screen}/${row.state}`, screen: row.screen, state: row.state, route: row.route, roles: row.roles || [], scope: row.scope || [], us: row.us || [], ac: row.ac || [],
      scenarios: row.scenarios || [], flow: row.flow || '', data: row.data || '', components: row.components || [], patterns: row.patterns || [], boards, source,
      availability: row.availability || '', overlay: row.overlay || 'none', consequences: row.consequences || [], evidence: rowEvidence,
      coded: [...new Set(row.us.flatMap((u) => codedByUs.get(u) || []))],
      selectors: uiRows.filter((u) => u.screen === row.screen && (u.state === row.state || !u.state)),
    };
  });
  const screens = [...new Set(rows.map((r) => r.screen))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map((id) => {
    const own = rows.filter((r) => r.screen === id).sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));
    return { id, states: own, missingStates: STATE_ORDER.filter((s) => !own.some((r) => r.state === s)) };
  });
  return { rows, screens };
}

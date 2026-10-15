/* Evidence receipts and acceptance coverage, computed from recorded data only. A declared status is never evidence: an AC counts as
   passed only when every scenario associated with it is declared passing AND a CURRENT executed-PASS receipt lists the AC as passed.
   The reader shows receipts as recorded; retirement and supersession are decided by the runner, not here. */
export function buildEvidence(design) {
  const receipts = (design.receipts || []).map(({ rel, data: r }) => ({
    id: r.id, rel, domain: r.domain || '', freshness: r.freshness || 'MISSING', result: r.execution?.result || '', exit: r.execution?.exit ?? null,
    selected: r.execution?.selected ?? 0, at: r.at || '', command: r.execution?.command || '', verdict: r.review?.verdict || '', independent: r.review?.independent === true,
    ac: r.coverage?.ac || [], scn: r.coverage?.scenarios || [], passed: r.coverage?.passed || [], supersedes: r.supersedes || [],
    pins: r.pins || {}, visual: r.visual || null, artifacts: r.artifacts || {}, scope: r.scope || null,
  }));
  const byId = new Map(receipts.map((r) => [r.id, r]));
  const executedPass = (r) => r.freshness === 'CURRENT' && r.exit === 0 && r.result === 'PASS' && r.selected > 0;
  const forAc = (qid) => receipts.filter((r) => r.ac.includes(qid));
  const currentPassed = (qid) => receipts.some((r) => executedPass(r) && r.passed.includes(qid));
  return { receipts, byId, executedPass, forAc, currentPassed };
}

const REVIEWED = new Set(['auto', 'visual', 'review', 'manual']);

/* Worst-first state of one AC from its associated scenarios. */
export function acState(scns, evidence, qid) {
  if (!scns.length) return 'uncovered';
  const has = (st) => scns.some((s) => s.status === st);
  if (has('failing')) return 'failing';
  if (has('blocked')) return 'blocked';
  if (has('stale')) return 'stale';
  if (scns.some((s) => s.method === 'not-built')) return 'not-built';
  if (scns.some((s) => s.method === 'unassigned')) return 'unassigned';
  if (scns.every((s) => s.status === 'passing')) return evidence.currentPassed(qid) ? 'passed' : 'unverified';
  return 'planned';
}

export function buildCoverage(stories, evidence) {
  const acRows = [];
  for (const s of stories) {
    for (const a of s.acs) {
      const scns = s.scenarios.filter((x) => x.ac.includes(a.id));
      const state = acState(scns, evidence, a.qid);
      acRows.push({ ...a, us: s.id, area: s.area, scns, state, reviewed: scns.length > 0 && scns.every((x) => REVIEWED.has(x.method)), receipts: evidence.forAc(a.qid).map((r) => r.id) });
    }
  }
  const areaMap = new Map();
  for (const s of stories) {
    if (!areaMap.has(s.area)) areaMap.set(s.area, { id: s.area, name: s.epic || s.area, us: [], req: new Set() });
    const a = areaMap.get(s.area); a.us.push(s.id); s.reqs.forEach((r) => a.req.add(r));
  }
  const count = (rows, fn) => rows.filter(fn).length;
  const areas = [...areaMap.values()].map((a) => {
    const rows = acRows.filter((r) => r.area === a.id);
    const states = {}; rows.forEach((r) => { states[r.state] = (states[r.state] || 0) + 1; });
    return {
      id: a.id, name: a.name, us: a.us.length, req: a.req.size, ac: rows.length, withScenario: count(rows, (r) => r.scns.length > 0), reviewed: count(rows, (r) => r.reviewed),
      passed: count(rows, (r) => r.state === 'passed'), unverified: count(rows, (r) => r.state === 'unverified'), states,
    };
  });
  const scnAll = stories.flatMap((s) => s.scenarios.map((x) => ({ ...x, us: s.id })));
  const tally = (key) => scnAll.reduce((o, x) => { o[x[key]] = (o[x[key]] || 0) + 1; return o; }, {});
  const totals = {
    us: stories.length, ac: acRows.length, withScenario: count(acRows, (r) => r.scns.length > 0), reviewed: count(acRows, (r) => r.reviewed), passed: count(acRows, (r) => r.state === 'passed'),
    unverified: count(acRows, (r) => r.state === 'unverified'), scenarios: scnAll.length, methods: tally('method'), statuses: tally('status'),
    states: acRows.reduce((o, r) => ({ ...o, [r.state]: (o[r.state] || 0) + 1 }), {}),
  };
  return { acRows, areas, totals, exclusions: [] };
}

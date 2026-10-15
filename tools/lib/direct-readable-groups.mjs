/* Direct story groups supplement user-goal epics; existing epic gates still run unchanged. */
export function separateDirectGroups(map, build, expected = []) {
  const errors = [], declared = new Set(expected), direct = (map.epics || []).filter(e => e.direct === true);
  const belongs = build.groupOf || {}, directIds = build.storyIds.filter(id => declared.has(belongs[id]));
  const counts = new Map();
  const same = (a,b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
  for (const id of expected) if (direct.filter(e => e.id === id).length !== 1) errors.push(`${id}: direct group must appear exactly once`);
  for (const e of direct) {
    if (!declared.has(e.id)) errors.push(`${e.id}: undeclared direct group`);
    if (e.page !== null) errors.push(`${e.id}: direct group page must be null`);
    for (const key of ['slug','title','goal','roles','screens','status','capabilities']) if (!e[key] || (Array.isArray(e[key]) && !e[key].length)) errors.push(`${e.id}: missing ${key}`);
    if (!map.statuses?.[e.status]) errors.push(`${e.id}: unknown status ${e.status}`);
    for (const c of e.capabilities || []) {
      for (const key of ['id','title','text','done_when']) if (!c[key]) errors.push(`${e.id}: capability missing ${key}`);
      if (!map.statuses?.[c.status]) errors.push(`${c.id}: unknown status ${c.status}`);
      const ids = [...(c.us || []), ...(c.merged || []).map(m => m.us)];
      if (!ids.length) errors.push(`${c.id}: no direct story links`);
      for (const id of ids) {
        counts.set(id, (counts.get(id) || 0) + 1);
        if (!build.storyIds.includes(id)) errors.push(`${c.id}: unknown story ${id}`);
        if (belongs[id] !== e.id) errors.push(`${c.id}: ${id} belongs to ${belongs[id] || 'a user-goal epic'}, not ${e.id}`);
      }
      for (const r of c.req || []) if (!build.reqIds.has(r)) errors.push(`${c.id}: unknown requirement ${r}`);
      if (!same(ids.flatMap(id => build.reqOf[id] || []), c.req || [])) errors.push(`${c.id}: REQ list drifts from story requirements`);
    }
  }
  for (const id of directIds) if (counts.get(id) !== 1) errors.push(`${id}: direct story must appear exactly once (found ${counts.get(id) || 0})`);
  const core = {...map, epics: (map.epics || []).filter(e => e.direct !== true)};
  for (const e of core.epics) for (const c of e.capabilities || []) for (const id of [...(c.us || []), ...(c.merged || []).map(m => m.us)]) if (directIds.includes(id)) errors.push(`${id}: direct story placed in a user-goal epic`);
  for (const h of map.hidden || []) if (directIds.includes(h.us)) errors.push(`${h.us}: direct story cannot be hidden`);
  return {map:core, build:{...build,storyIds:build.storyIds.filter(id => !directIds.includes(id))}, errors};
}

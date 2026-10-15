/* Recent-change labels share the indexer's deterministic dates; no browser clock or storage grants. */
function changeLabels(data) {
  const vi = data.changes && data.changes.locale === 'vi';
  return vi ? { title: 'Changes to read', new: 'Mới', page: 'Trang', decision: 'Quyết định', amendment: 'Amendment', empty: 'Không có thay đổi trong khoảng này.' }
    : { title: 'Changes to read', new: 'New', page: 'Page', decision: 'Decision', amendment: 'Amendment', empty: 'No changes in this window.' };
}

function changeText(date, data) {
  if (!date) return '';
  return `${changeLabels(data || state.data).new} · ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/* What the "*" mark means in the code: the page, decision or amendment is dated within the recent window (manifest changes.recent_days,
   default 7) ending at the newest date in the spec. It is not "since you last read": the reader keeps no read history. */
function changeLegend(data) {
  const c = (data || state.data).changes;
  const vi = c.locale === 'vi';
  return vi ? `Đổi trong ${c.recentDays} ngày gần nhất, tính đến ${c.newest}` : `Changed in the last ${c.recentDays} days, up to ${c.newest}`;
}

function changeChip(date, recent, data) {
  if (!recent || !date) return '';
  const label = changeText(date, data);
  const tip = `${label}. ${changeLegend(data)}`;
  return `<span class="chip change-chip" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)} (${escapeHtml(date)})"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/></svg>${escapeHtml(label)}</span>`;
}

function decorateChangeRows(root, page) {
  const data = state.data;
  const decision = Object.fromEntries(((data.decisions && data.decisions.items) || []).map((d) => [d.id, d]));
  const amendment = Object.fromEntries(((data.amendments && data.amendments.items) || []).map((a) => [a.id, a]));
  const ledger = data.decisions && data.decisions.pageId;
  const contract = data.amendments && data.amendments.fcId;
  $$('tbody tr', root).forEach((tr) => {
    const cell = tr.firstElementChild;
    const id = cell ? cell.textContent.trim() : '';
    let item;
    if (page.id === ledger || page.id === 'decisions') item = decision[id];
    if (page.id === contract || page.id === 'amendments') {
      item = amendment[id] || Object.values(amendment).find((a) => a.rows.some((r) => r.id === id));
    }
    if (item && item.recent && !cell.querySelector('.change-chip')) cell.insertAdjacentHTML('beforeend', changeChip(item.date, true));
  });
}

function gpChanges(data) {
  const labels = changeLabels(data);
  const changes = data.changes;
  const md = [`${changes.since} — ${changes.newest}`, '', data.changes.locale === 'vi'
    ? 'Đọc các trang spec đã đổi trước khi quyết định có code hay không. Các link đưa đến đúng trang hoặc dòng quyết định/amendment; ngày mới nhất đứng trước.'
    : 'Read the changed spec before deciding whether to code. Links open the exact page or decision/amendment row, newest first.', ''];
  if (!changes.items.length) md.push(labels.empty);
  else {
    md.push('| Date | Type | Read | Impacted pages |', '|---|---|---|---|');
    changes.items.forEach((item) => {
      const text = `${item.kind === 'page' ? '' : item.id + ' · '}${item.title}`;
      const impacted = item.mentions.map((p) => `<a href="${hashOf(p.id, '')}">${escapeHtml(p.label)}</a>`).join(' · ');
      md.push(`| ${item.date} ${changeChip(item.date, true, data)} | ${labels[item.kind]} | <a href="${hashOf(item.page, item.token)}">${gpCell(escapeHtml(text))}</a> | ${gpCell(impacted) || '—'} |`);
    });
  }
  return gpPage(data, 'changes-to-read', labels.title, labels.title, md.join('\n'));
}

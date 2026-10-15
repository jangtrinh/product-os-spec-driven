/* Historical wording is rendered separately; current Markdown and the search index never include it. */
function historyText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('.change-chip, .anchor-btn, .block-history' + (node.tagName === 'LI' ? ', ul, ol' : '')).forEach((n) => n.remove());
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function historyBlock(text, kind) {
  const host = document.createElement('div');
  let md = text;
  if (kind === 'row') {
    const cols = text.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).length;
    md = '| ' + Array(cols).fill('Column').join(' | ') + ' |\n| ' + Array(cols).fill('---').join(' | ') + ' |\n' + text;
  }
  host.innerHTML = markedFor(false).parse(md);
  return host.querySelector(kind === 'row' ? 'tbody tr' : kind === 'list' ? 'li' : 'p') || host;
}

function historyLabel(record, target) {
  const linked = new Set(Array.from(target?.querySelectorAll('a') || []).map(a => a.textContent.trim()));
  const vi = state.data.changes.locale === 'vi';
  const box = document.createElement('div');
  box.className = 'block-history';
  box.dataset.change = record.id;
  box.setAttribute('role', 'note');
  const description = !record.before ? (vi ? 'Nội dung mới' : 'New block') : !record.after ? (vi ? 'Nội dung đã bỏ' : 'Removed block') : (vi ? 'Nội dung trước thay đổi' : 'Previous wording');
  box.setAttribute('aria-label', description);
  box.innerHTML = changeChip(record.date, true) + ' ' + Array.from(new Set(record.refs)).filter(id => !linked.has(id)).map((id) => {
    const target = idTarget(id);
    return `<a href="${escapeHtml(target)}">${escapeHtml(id)}</a>`;
  }).join(' · ');
  return box;
}

function historyBefore(box, text, showLabel = true) {
  const label = document.createElement('span');
  label.className = 'history-label';
  label.textContent = state.data.changes.locale === 'vi' ? 'Trước thay đổi: ' : 'Previous wording: ';
  const old = document.createElement('del');
  old.className = 'previous-wording';
  old.innerHTML = markedFor(false).parseInline(text);
  old.querySelectorAll('a').forEach((a) => a.replaceWith(document.createTextNode(a.textContent)));
  old.querySelectorAll('img').forEach((img) => img.replaceWith(document.createTextNode(img.alt)));
  box.append(document.createElement('br'));
  if (showLabel) box.append(label);
  box.append(old);
}

function decorateBlockHistory(root, page) {
  if (page.generated || !page.blockChanges?.length) return;
  const selectors = { row: 'tbody tr', paragraph: 'p', list: 'li' };
  const occupied = new Set();
  const previous = new Set();
  for (const original of page.blockChanges) {
    const record = {...original};
    if (record.before && previous.has(record.before)) record.before = "";
    if (root.querySelector(`[data-change="${record.id}"]`)) continue;
    const expected = record.after ? historyBlock(record.after, record.kind) : null;
    const candidates = Array.from(root.querySelectorAll(selectors[record.kind])).filter((n) => !n.closest('.block-history'));
    const target = expected && candidates.filter((n) => historyText(n) === historyText(expected))[record.occurrence || 0];
    if (target && occupied.has(target)) continue;
    if (target) occupied.add(target);
    if (record.before) previous.add(record.before);
    if (record.after && !target) continue;
    if (!record.after) {
      const removed = historyLabel(record);
      removed.classList.add('removed-block');
      historyBefore(removed, record.before);
      const next = record.next && historyBlock(record.next, record.kind);
      const following = next && candidates.find((n) => historyText(n) === historyText(next));
      const anchor = following?.closest('.table-wrap') || following;
      if (anchor) anchor.before(removed); else root.append(removed);
      continue;
    }
    const linkedRefs = new Set();
    target.querySelectorAll('a').forEach(a => {
      const id = a.textContent.trim();
      if (!/^(A-\d+|D\d+)$/.test(id)) return;
      if (linkedRefs.has(id)) a.replaceWith(document.createTextNode(id));
      else linkedRefs.add(id);
    });
    const label = historyLabel(record, target);
    const existingChip = target.querySelector('.change-chip');
    if (existingChip?.getAttribute('aria-label')?.includes(record.date)) label.querySelector('.change-chip')?.remove();
    else existingChip?.remove();
    if (record.kind === 'row') {
      target.classList.add('changed-block');
      target.cells[0].append(label);
      if (record.before) {
        const before = historyBlock(record.before, 'row');
        let labelled = false;
        const seen = new Set();
        Array.from(target.cells).forEach((cell, i) => {
          const old = before.cells?.[i];
          if (!old || historyText(old) === historyText(cell)) return;
          const previous = document.createElement('div');
          previous.className = 'block-history previous-cell';
          previous.dataset.change = record.id;
          const raw = record.before.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/)[i]?.trim() || old.textContent;
          if (seen.has(raw)) return;
          seen.add(raw);
          historyBefore(previous, raw, !labelled);
          labelled = true;
          cell.prepend(previous);
        });
      }
    } else {
      target.classList.add('changed-block');
      if (record.before) historyBefore(label, record.before);
      target.prepend(label);
    }
  }
}

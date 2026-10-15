/* Metadata line and tier banner under each page title. */
function idLink(id) {
  const t = idTarget(id);
  return t ? `<a href="${t}">${id}</a>` : id;
}

function metaLine(page) {
  const sep = '<span class="sep" aria-hidden="true">·</span>';
  const stem = page.generated ? page.id : page.rel.split('/').pop().replace(/\.md$/, '');
  const parts = [`id: ${escapeHtml(stem)}`];
  if (page.generated) parts.push('generated from the spec files');
  else if (page.owner) parts.push(`owner: ${escapeHtml(page.owner)}`);
  if (page.status && !page.generated) parts.push(`status: ${escapeHtml(page.status)}`);
  parts.push(`updated: ${page.updated}`);
  if (page.recent) parts.push(changeChip(page.updated, true));
  const t = page.trace || {};
  const ids = [].concat(t.a || [], t.d || [], t.req || [], t.us || [], t.ac || []);
  if (ids.length) {
    const shown = ids.slice(0, 10).map(idLink).join(', ');
    const rest = ids.slice(10);
    const more = rest.length ? `, <details><summary>Show ${rest.length} more ids</summary>${rest.map(idLink).join(', ')}</details>` : '';
    parts.push(`sources: ${shown}${more}`);
  }
  return `<p class="page-meta">${parts.join(sep)}</p>`;
}

function tierBanner(page) {
  if (page.generated || page.layer === 'readable') return '';
  const t = state.tiers[page.tier];
  if (!t) return '';
  const sep = ' <span class="sep" aria-hidden="true">·</span> ';
  return `<div class="tier-banner" role="note"><div><b>Tier:</b> ${escapeHtml(t.name)}${sep}<b>Audience:</b> ${escapeHtml(page.audience || t.audience)}${sep}<b>Updated:</b> ${page.updated}${t.purpose ? `${sep}<b>Purpose:</b> ${escapeHtml(t.purpose)}` : ''}</div><p class="banner-back"><a href="#start">Back to spec index</a></p></div>`;
}

/* Readable layer: which epic this story belongs to, or why it is hidden there. */
function epicLine(page) {
  const r = state.data.readable;
  if (!r || page.generated || page.layer === 'readable') return '';
  const stem = page.rel.split('/').pop().replace(/\.md$/, '');
  const m = r.stories[stem];
  if (!m) return '';
  if (m.hidden) {
    const review = state.order.readable.map((id) => state.pages[id]).find((p) => p.group === 'For review');
    const more = review ? ` <a href="${hashOf(review.id, '')}">For review</a>` : '';
    return `<p class="epic-line"><span class="hidden-note">Hidden in readable view: ${escapeHtml(m.reason || 'no reason recorded')}${more}</span></p>`;
  }
  const e = m.epic ? state.pages[m.epic] : null;
  const label = escapeHtml(String(m.epicTitle || (e && e.label) || '').replace(/^Epic\s*\d+\s*[:.\-–—]\s*/i, ''));
  return `<p class="epic-line">${e ? `<a class="chip epic-chip" href="${hashOf(e.id, m.epicToken || '')}">Epic: ${label}</a>` : `<span class="chip epic-chip">Epic: ${label}</span>`}</p>`;
}

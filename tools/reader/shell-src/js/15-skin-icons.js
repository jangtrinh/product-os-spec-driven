/* Standard skin: local Lucide icons replace the placeholder glyphs of the native controls. Icons supplement names, never replace them. */
function fillIcon(svg, name) {
  const nodes = SKIN_ICONS[name];
  if (!nodes) return;
  svg.replaceChildren(...nodes.map(([tag, attrs]) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  }));
  svg.dataset.icon = name;
}

function installIcons() {
  $$('.tree-link:not(:has(.reader-leaf-icon))').forEach((leaf) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('ico', 'reader-leaf-icon');
    leaf.prepend(svg);
  });
  $$('svg.ico:not([data-icon])').forEach((svg) => {
    const name = svg.matches('.reader-leaf-icon') ? 'file-text' : svg.matches('.chev') ? 'chevron-right' : svg.closest('.anchor-btn') ? 'link'
      : svg.closest('.change-chip') ? 'sparkles' : svg.closest('#btn-theme') ? (isDark() ? 'sun' : 'moon')
      : svg.closest('#btn-pages-show') ? 'menu' : svg.closest('.search-field, #btn-search') ? 'search' : '';
    if (name) fillIcon(svg, name);
  });
}

function syncThemeIcon() {
  const svg = $('#btn-theme svg');
  if (svg) fillIcon(svg, isDark() ? 'sun' : 'moon');
}

/* Standard skin: overlay floor for search, the page drawer and the image preview. An open overlay makes the background inert, locks
   scrolling, contains Tab and Shift+Tab, and returns focus to the opener (or the search button) on close. Native routing stays in charge. */
const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]';
const isVisibleFocus = (el) => el.tabIndex >= 0 && !el.matches(':disabled') && !el.closest('[inert],[hidden]') && el.getClientRects().length > 0 && !['hidden', 'collapse'].includes(getComputedStyle(el).visibility);

function installOverlayFloors() {
  const search = $('#search-layer'), drawer = $('#pages-card'), lightbox = $('#lightbox');
  let active = null, opener = null, release = () => {};
  const candidates = () => [...(active ? active.querySelectorAll(FOCUSABLE) : [])].filter(isVisibleFocus);
  const current = () => (!lightbox.hidden ? lightbox : !search.hidden ? search : document.body.classList.contains('pages-open') ? drawer : null);
  const first = () => candidates()[0] || active;
  const restore = () => { const target = opener && opener.isConnected && isVisibleFocus(opener) ? opener : $('#btn-search'); if (target) target.focus({ preventScroll: true }); };
  const sync = () => {
    const next = current();
    if (next === active) return;
    const previous = active;
    release(); release = () => {}; active = next;
    if (!next) { if (previous) restore(); return; }
    const inerted = [];
    let branch = next;
    while (branch.parentElement) {
      for (const sibling of [...branch.parentElement.children]) {
        if (sibling !== branch && sibling.id !== 'scrim' && !sibling.inert) { sibling.inert = true; inerted.push(sibling); }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const role = next.getAttribute('role'), modal = next.getAttribute('aria-modal');
    if (next === drawer) { next.setAttribute('role', 'dialog'); next.setAttribute('aria-modal', 'true'); }
    release = () => {
      inerted.forEach((el) => { el.inert = false; });
      document.body.style.overflow = overflow;
      if (next === drawer) {
        if (role === null) next.removeAttribute('role'); else next.setAttribute('role', role);
        if (modal === null) next.removeAttribute('aria-modal'); else next.setAttribute('aria-modal', modal);
      }
    };
    if (!next.contains(document.activeElement)) { const f = first(); if (f) f.focus({ preventScroll: true }); }
  };
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#btn-search,#btn-pages-show,img[data-zoom],a[href$=".png"]')) opener = e.target.closest('button,a,img');
  }, true);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && search.hidden) opener = document.activeElement;
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('#btn-search,#btn-pages-show')) opener = e.target;
    sync();
    if (!active || e.key !== 'Tab') return;
    const items = candidates(), at = items.indexOf(document.activeElement);
    if (at < 0 || (e.shiftKey && at === 0) || (!e.shiftKey && at === items.length - 1)) {
      e.preventDefault(); e.stopPropagation();
      const target = e.shiftKey ? items[items.length - 1] : items[0];
      if (target) target.focus({ preventScroll: true });
    }
  }, true);
  document.addEventListener('focusin', () => {
    sync();
    if (active && !active.contains(document.activeElement)) { const f = first(); if (f) f.focus({ preventScroll: true }); }
  });
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  [search, lightbox].forEach((el) => observer.observe(el, { attributes: true, attributeFilter: ['hidden'] }));
  sync();
}

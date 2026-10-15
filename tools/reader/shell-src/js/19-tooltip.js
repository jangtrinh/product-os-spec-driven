/* Tooltips for [data-tip] elements (the "*" mark). One dark bubble with a caret, shown after a short hover delay and on keyboard focus.
   No native title tooltip is used. */
function bindTooltips() {
  const tip = document.createElement('div');
  tip.id = 'reader-tip';
  tip.className = 'reader-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  let target = null;
  let timer = 0;
  const hide = () => { clearTimeout(timer); target = null; tip.hidden = true; };
  const show = (el) => {
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), document.documentElement.clientWidth - w - 8);
    const above = r.top - h - 10 >= 8;
    tip.dataset.side = above ? 'top' : 'bottom';
    tip.style.left = left + 'px';
    tip.style.top = (above ? r.top - h - 8 : r.bottom + 8) + 'px';
    tip.style.setProperty('--tip-caret', (r.left + r.width / 2 - left) + 'px');
  };
  const pick = (e, delay) => {
    const el = e.target.closest ? e.target.closest('[data-tip]:not(.anchor-btn)') : null;
    if (el === target) return;
    hide();
    if (!el) return;
    target = el;
    timer = window.setTimeout(() => show(el), delay);
  };
  document.addEventListener('mouseover', (e) => pick(e, 150));
  document.addEventListener('focusin', (e) => pick(e, 0));
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) hide(); });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
  window.addEventListener('scroll', hide, { passive: true });
}

/* Standard skin: a short cross-fade between pages through the View Transition API when the browser has it. The router decides the
   destination; the skin only wraps the same route callback. Reduced motion routes directly. */
function installNavigationMotion() {
  if (!document.startViewTransition) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let pending;
  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', () => {
    if (pending) pending.skipTransition();
    if (reduced.matches) { route(); return; }
    pending = document.startViewTransition(() => route());
    pending.ready.catch((error) => { if (error.name !== 'AbortError') console.error(error); });
    pending.finished.catch((error) => { if (error.name !== 'AbortError') console.error(error); });
  });
  document.documentElement.dataset.readerNavigationMotion = 'ready';
}

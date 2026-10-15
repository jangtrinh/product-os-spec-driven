/* A generated role table (QA, Design, Evidence, Coverage, Dev, Source ledger) must never hide a column or a status chip behind a sideways
   scroll. It stays a table while it fits its column; the moment its natural width is wider than the box it sits in, it becomes one stacked
   card per row. The measure is the real content width (sidebar, rail, font, user zoom included), not a guessed viewport breakpoint. */
function fitStackTables() {
  $$('.prose table.stack').forEach((table) => {
    const box = table.closest('.table-wrap');
    if (!box) return;
    table.classList.remove('cards');
    const overflows = box.scrollWidth > box.clientWidth + 1;
    if (overflows) table.classList.add('cards');
    const hint = box.previousElementSibling;
    if (hint && hint.matches('.reader-table-hint') && !(box.scrollWidth > box.clientWidth + 1)) hint.remove();
  });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStackTables);

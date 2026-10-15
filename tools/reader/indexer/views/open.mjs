import { esc, chip, absent, table, pageLink } from './html.mjs';

/* Open items: every actionable OPEN marker of every story, hidden and merged stories included. The marker in the story stays canonical. */
export function buildOpenItems(ctx) {
  const items = ctx.openAll;
  if (!items.length) return absent('No story carries an OPEN marker. Nothing is waiting for an answer.');
  const blocking = items.filter((o) => o.blocking).length;
  const rows = items.map((o, i) => ({ id: `open-${i + 1}`, cells: [
    esc(o.text), pageLink(o.page, o.us), esc(`${o.rel}:${o.line}`), o.blocking ? chip('blocking', 'bad') : chip('open', 'warn'), esc(o.owner || '—'), esc(o.affects.join(', ') || '—'),
    o.hidden ? chip('hidden story', 'warn') : '',
  ] }));
  return `<p>${chip(items.length)} open ${items.length === 1 ? 'question' : 'questions'}, ${chip(blocking, blocking ? 'bad' : 'ok')} blocking. A blocking question fails the requirements gate until it is answered in the story.</p>${table(['Question', 'Story', 'Source line', 'State', 'Owner', 'Affects', 'Note'], rows, { caption: 'Open items' })}`;
}

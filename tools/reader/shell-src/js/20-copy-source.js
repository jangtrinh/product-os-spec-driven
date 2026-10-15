/* Source positions for "Copy cho AI". The page markdown is rendered one top-level block at a time and every block element carries
   data-src-start / data-src-end: the real first and last line of that block in its spec file (not in the rendered markdown).
   Table rows and list items carry their own line. A selection then maps to the union of the blocks it touches. */
const srcCount = (s) => (s.match(/\n/g) || []).length;

function listItemLines(list, startLine, out) {
  let ok = true;
  let off = 0;
  list.items.forEach((item) => {
    const first = startLine + off;
    out.push([first, first + srcCount(item.raw.replace(/\n+$/, ''))]);
    const rows = item.raw.split('\n');
    let from = 1;
    (item.tokens || []).filter((t) => t.type === 'list').forEach((t) => {
      const needle = t.raw.split('\n')[0].trim();
      let at = -1;
      for (let j = from; j < rows.length; j += 1) if (rows[j].trim() === needle) { at = j; break; }
      if (at < 0) { ok = false; return; }
      from = at + 1;
      if (!listItemLines(t, first + at, out)) ok = false;
    });
    off += srcCount(item.raw);
  });
  return ok;
}

function addAttrs(html, tag, attrs) {
  return html.replace(new RegExp('^<' + tag + '(?=[\\s>/])'), '<' + tag + attrs);
}

function markBlock(html, tok, start, src) {
  const at = (i) => copyFileLine(src, i);
  const end = start + srcCount(tok.raw.replace(/\n+$/, ''));
  const fenced = tok.type === 'code' && /^ {0,3}(```|~~~)/.test(tok.raw);
  let out = html.replace(/^<([a-zA-Z][a-zA-Z0-9]*)/, '<$1 data-src-start="' + at(start) + '" data-src-end="' + at(end) + '"' + (fenced ? ' data-src-fence="1"' : ''));
  if (tok.type === 'table') {
    let k = -1;
    out = out.replace(/<tr>/g, () => { k += 1; const line = at(k === 0 ? start : start + 1 + k); return '<tr data-src-start="' + line + '" data-src-end="' + line + '">'; });
  } else if (tok.type === 'list') {
    const items = [];
    if (listItemLines(tok, start, items) && (out.match(/<li[ >]/g) || []).length === items.length) {
      let k = -1;
      out = out.replace(/<li(?=[ >])/g, () => { k += 1; return '<li data-src-start="' + at(items[k][0]) + '" data-src-end="' + at(items[k][1]) + '"'; });
    }
  }
  return out;
}

function renderSourceBlocks(inst, page) {
  let line = 0;
  let html = '';
  inst.lexer(page.md).forEach((tok) => {
    const start = line;
    line += srcCount(tok.raw);
    if (tok.type === 'space') return;
    html += markBlock(inst.parser([tok], inst.defaults), tok, start, page.src);
  });
  return html;
}

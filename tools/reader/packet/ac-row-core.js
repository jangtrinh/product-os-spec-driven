/* Wording extraction shared by the packet generator, the packet page and the verifier. All three run this very source text, so what is
   shown is always re-derived from the bytes a member hashes pin. No module syntax, no I/O. */
function splitTableRow(line) {
  var t = line.trim();
  if (t.charAt(0) !== '|') return null;
  t = t.slice(1);
  if (t.charAt(t.length - 1) === '|' && t.charAt(t.length - 2) !== '\\') t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map(function (c) { return c.trim(); });
}

/* The first table row whose id cell is `localId` (for example AC-01) under a header that starts with ID and has a Then column.
   Returns { header, cells } with the raw trimmed cells, or null when the pinned text has no such row. */
function acRowCells(text, localId) {
  var lines = text.split(/\r?\n/), header = null, fence = false;
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; header = null; continue; }
    if (fence) continue;
    var cells = splitTableRow(lines[i]);
    if (!cells) { header = null; continue; }
    if (/^\|?\s*:?-{3,}/.test(lines[i].trim())) continue;
    var next = lines[i + 1] === undefined ? '' : lines[i + 1].trim();
    if (/^\|\s*:?-{3,}/.test(next)) { header = cells; continue; }
    if (header && /^id$/i.test(header[0]) && header.some(function (h) { return /^then$/i.test(h); }) && cells[0].replace(/\*/g, '') === localId) return { header: header, cells: cells };
  }
  return null;
}

/* The story title from the front matter, quotes removed; null when absent. */
function storyTitleOf(text) {
  var m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  var t = /^title:\s*(.*)$/m.exec(m[1]);
  if (!t) return null;
  var v = t[1].trim();
  if (v.charAt(0) === '"') { try { return JSON.parse(v); } catch (e) { return null; } }
  if (v.charAt(0) === "'" && v.charAt(v.length - 1) === "'") return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

/* The ruling text (second cell) of ledger row `id` under a header that starts with Id, outside code fences; null when the pinned text
   has no such row. The decision wording on the packet comes only from this, read from the bytes the member pins. */
function decisionRuling(text, id) {
  var lines = text.split(/\r?\n/), header = null, fence = false;
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; header = null; continue; }
    if (fence) continue;
    var cells = splitTableRow(lines[i]);
    if (!cells) { header = null; continue; }
    if (/^\|?\s*:?-{3,}/.test(lines[i].trim())) continue;
    var next = lines[i + 1] === undefined ? '' : lines[i + 1].trim();
    if (/^\|\s*:?-{3,}/.test(next)) { header = cells; continue; }
    if (header && /^id$/i.test(header[0]) && cells[0] === id) return cells[1] === undefined ? null : cells[1];
  }
  return null;
}

/* The story id from the front matter (id: US-01); null when absent. A story source is found by this id, never by a file name. */
function storyIdOf(text) {
  var m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  var t = m && /^id:\s*(.*)$/m.exec(m[1]);
  return t ? t[1].trim().replace(/^["']|["']$/g, '') : null;
}

var byScreenState = function (a, b) { var x = a.screen + '/' + a.state, y = b.screen + '/' + b.state; return x < y ? -1 : x > y ? 1 : 0; };

/* Inventory rows (assets/inventory.json bytes) that join the scope, in display order; null when the bytes are not an inventory. */
function screensFor(text, scopeIds) {
  var doc;
  try { doc = JSON.parse(text); } catch (e) { return null; }
  if (!doc || !Array.isArray(doc.screens)) return null;
  return doc.screens.filter(function (r) { return (r.ac || []).some(function (id) { return scopeIds.indexOf(id) >= 0; }); }).sort(byScreenState);
}

/* Rows of every table whose header has Screen and Element (the ui-contract); { screen, state, route, element, kind } per row. */
function contractRowsFor(text) {
  var lines = text.split(/\r?\n/), header = null, fence = false, out = [];
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { fence = !fence; header = null; continue; }
    if (fence) continue;
    var cells = splitTableRow(lines[i]);
    if (!cells) { header = null; continue; }
    if (/^\|?\s*:?-{3,}/.test(lines[i].trim())) continue;
    var next = lines[i + 1] === undefined ? '' : lines[i + 1].trim();
    if (/^\|\s*:?-{3,}/.test(next)) { header = cells.map(function (h) { return h.toLowerCase().replace(/[^a-z]/g, ''); }); continue; }
    if (header && header.indexOf('screen') >= 0 && header.indexOf('element') >= 0) {
      var get = function (n) { var k = header.indexOf(n); return k < 0 ? '' : cells[k] || ''; };
      out.push({ screen: get('screen'), state: get('state'), route: get('route'), element: get('element'), kind: get('kind') });
    }
  }
  return out;
}

/* Order-independent canonical text of a JSON value (the same function the page uses to check the embedded digest). */
function canon(v) { return Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v !== null && typeof v === 'object' ? '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}' : JSON.stringify(v); }

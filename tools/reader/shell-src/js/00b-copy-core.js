/* "Copy cho AI" text: the clipboard shapes and the source-line arithmetic. Pure functions, no DOM and no I/O, so the reader tests run
   this very source in Node and the browser shell runs it unchanged. */
var COPY_EMPTY_REQUEST = '(chưa nhập)';

/* Source file line of line `i` (0-based) of a page's markdown. `src.map` lists the file line of every markdown line when the reader
   inserted lines (a note under a not-built image); otherwise the lines run on from `src.first`. */
function copyFileLine(src, i) {
  if (src.map) return src.map[Math.min(Math.max(i, 0), src.map.length - 1)];
  return src.first + i;
}

function copyQuote(text) {
  var lines = String(text).replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '').split('\n');
  return lines.map(function (l) { var t = l.replace(/\s+$/, ''); return t ? '> ' + t : '>'; }).join('\n');
}

function copyFilePath(project, rel) {
  return project.specPath ? project.specPath + '/' + rel : rel;
}

/* ":start-end", or nothing when the selection could not be placed (never a guessed line). */
function copyLinesSuffix(c) {
  return c.start == null ? '' : ':' + c.start + '-' + c.end;
}

function copyProjectLine(project) {
  return project.root + ' (spec @ ' + project.rev + ')';
}

function copyRequest(request) {
  var r = String(request || '').trim();
  return r || COPY_EMPTY_REQUEST;
}

function copyHeadingPart(ids, heading) {
  var h = heading ? '"' + heading + '"' : '';
  if (ids.length && h) return ids.join(', ') + ' › ' + h;
  return ids.length ? ids.join(', ') : h || '(không rõ)';
}

/* One line for the box and for the log: where the text came from. */
function copyLocationLine(c) {
  var where = c.generated
    ? 'Trang tạo tự động: ' + c.pageTitle + (c.sources && c.sources.length ? ' · nguồn ' + c.sources.map(function (s) { return copyFilePath(c.project, s); }).join(', ') : '')
    : copyFilePath(c.project, c.rel) + copyLinesSuffix(c);
  var tail = copyHeadingPart(c.ids || [], c.heading);
  return where + (tail === '(không rõ)' ? '' : ' · ' + tail);
}

/* c: { text, rel, start, end, generated, pageId, pageTitle, sources, ids, heading, anchor, project, request } */
function copyFormatSpec(c) {
  var file = c.generated
    ? 'Trang tạo tự động "' + c.pageTitle + '" (generated:' + c.pageId + ')' + (c.sources && c.sources.length ? ' · nguồn: ' + c.sources.map(function (s) { return copyFilePath(c.project, s); }).join(', ') : ' · không có dòng nguồn duy nhất')
    : copyFilePath(c.project, c.rel) + copyLinesSuffix(c);
  return [
    'Sửa đoạn spec này:', '',
    copyQuote(c.text), '',
    '- File: ' + file,
    '- Mục: ' + copyHeadingPart(c.ids || [], c.heading),
    '- Trang reader: #' + c.anchor,
    '- Project: ' + copyProjectLine(c.project), '',
    'Yêu cầu của tôi: ' + copyRequest(c.request),
  ].join('\n');
}

/* c: { screen, title, state, role, text, line, related, project, request } */
function copyFormatPrototype(c) {
  var screen = (c.screen + (c.title ? ' ' + c.title : '')).trim() || '(không rõ)';
  return [
    'Sửa phần tử prototype này:', '',
    '- Màn: ' + screen + ' · state: ' + (c.state || '(không rõ)'),
    '- Phần tử: ' + c.role + (c.text ? ' "' + c.text + '"' : ''),
    '- File: ' + copyFilePath(c.project, 'prototype/index.html') + ':' + c.line,
    '- Liên quan: ' + ((c.related && c.related.length) ? c.related.join(', ') : '(không có)'),
    '- Project: ' + copyProjectLine(c.project), '',
    'Yêu cầu của tôi: ' + copyRequest(c.request),
  ].join('\n');
}

function copyProtoLocationLine(c) {
  return copyFilePath(c.project, 'prototype/index.html') + ':' + c.line + ' · ' + (c.screen || '') + (c.state ? ' ' + c.state : '') + ' › ' + c.role + (c.text ? ' "' + c.text + '"' : '');
}

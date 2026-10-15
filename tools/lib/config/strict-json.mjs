// JSON.parse discards duplicate keys. Runtime records must reject them instead.
export function parseJson(source, label = 'JSON') {
  let at = 0;
  const error = message => { throw new Error(`${label}: ${message} at byte ${at}`); };
  const space = () => { while (/\s/.test(source[at] ?? '') && at < source.length) at++; };
  function string() {
    const start = at++;
    while (at < source.length) {
      if (source[at] === '\\') { at += 2; continue; }
      if (source[at++] === '"') return JSON.parse(source.slice(start, at));
    }
    error('unterminated string');
  }
  function value() {
    space();
    const ch = source[at];
    if (ch === '"') return string();
    if (ch === '{') {
      at++; space();
      const result = Object.create(null);
      if (source[at] === '}') { at++; return result; }
      while (at < source.length) {
        space(); if (source[at] !== '"') error('expected object key');
        const key = string(); space();
        if (Object.hasOwn(result, key)) error(`duplicate key ${key}`);
        if (source[at++] !== ':') error('expected colon');
        result[key] = value(); space();
        if (source[at] === '}') { at++; return result; }
        if (source[at++] !== ',') error('expected comma');
      }
      error('unterminated object');
    }
    if (ch === '[') {
      at++; space(); const result = [];
      if (source[at] === ']') { at++; return result; }
      while (at < source.length) {
        result.push(value()); space();
        if (source[at] === ']') { at++; return result; }
        if (source[at++] !== ',') error('expected comma');
      }
      error('unterminated array');
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(at));
    if (!match) error('expected JSON value');
    at += match[0].length;
    const result = JSON.parse(match[0]);
    if (typeof result === 'number' && !Number.isFinite(result)) error('non-finite number');
    return result;
  }
  const result = value(); space();
  if (at !== source.length) error('trailing content');
  return result;
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

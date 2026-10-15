/* JSON.parse accepts duplicate keys; document contracts forbid them. */
export function parseJson(text) {
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) || [];
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '{') stack.push(new Set());
    else if (t === '[') stack.push(null);
    else if (t === '}' || t === ']') stack.pop();
    else if (t.startsWith('"') && tokens[i + 1] === ':' && stack.at(-1) instanceof Set) {
      const key = JSON.parse(t), keys = stack.at(-1);
      if (keys.has(key)) throw new SyntaxError(`duplicate JSON key ${key}`);
      keys.add(key);
    }
  }
  return JSON.parse(text);
}

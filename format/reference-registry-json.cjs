'use strict';
// Parse valid JSON only after checking decoded keys at every object depth.
module.exports = function parseUnique(text) {
  const value = JSON.parse(text);
  let i = 0;
  const space = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  function string() {
    const start = i++;
    while (i < text.length) {
      const ch = text[i++];
      if (ch === '\\') i++;
      else if (ch === '"') break;
    }
    return JSON.parse(text.slice(start, i));
  }
  function visit() {
    space();
    if (text[i] === '"') { string(); return; }
    if (text[i] === '{') {
      i++; space(); const keys = new Set();
      while (text[i] !== '}') {
        const key = string();
        if (keys.has(key)) throw new SyntaxError('duplicate JSON key ' + key);
        keys.add(key); space(); i++; visit(); space();
        if (text[i] !== ',') break;
        i++; space();
      }
      i++; return;
    }
    if (text[i] === '[') {
      i++; space();
      while (text[i] !== ']') {
        visit(); space(); if (text[i] !== ',') break;
        i++; space();
      }
      i++; return;
    }
    while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
  }
  visit(); return value;
};
